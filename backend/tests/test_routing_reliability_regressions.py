import time
import uuid
from datetime import datetime, timedelta, timezone
from email.utils import format_datetime

import httpx
import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.credential import ProviderCredential
from app.models.health import CredentialHealth
from app.models.provider import Provider
from app.providers.exceptions import (
    AuthenticationError,
    InvalidRequestError,
    PermissionError,
    ProviderUnavailableError,
)
from app.routing.circuit_breaker import CircuitBreakerManager
from app.routing.cooldown_manager import CooldownManager
from app.routing.error_classifier import ErrorClassifier
from app.routing.policies import CooldownPolicy
from app.routing.retry_controller import RetryController
from app.routing.schemas import ErrorCategory, ErrorClassification, HealthState, QuotaScope
from app.services.encryption import get_encryption_service


def test_retry_after_is_authoritative_and_not_jittered():
    assert CooldownPolicy.calculate_cooldown(
        ErrorCategory.RATE_LIMIT,
        consecutive_cooldowns=4,
        explicit_retry_after=73.0,
    ) == 73.0


def test_cooldown_environment_overrides_and_cap(monkeypatch):
    monkeypatch.setenv("AXLY_COOLDOWN_RATE_LIMIT_BASE_SECONDS", "7")
    monkeypatch.setenv("AXLY_COOLDOWN_RATE_LIMIT_MAX_SECONDS", "12")
    monkeypatch.setenv("AXLY_COOLDOWN_RATE_LIMIT_BACKOFF_FACTOR", "2")
    monkeypatch.setenv("AXLY_COOLDOWN_JITTER_RATIO", "0")

    assert CooldownPolicy.calculate_cooldown(ErrorCategory.RATE_LIMIT, 0) == 7.0
    assert CooldownPolicy.calculate_cooldown(ErrorCategory.RATE_LIMIT, 1) == 12.0
    assert CooldownPolicy.calculate_cooldown(ErrorCategory.RATE_LIMIT, 10) == 12.0


def test_retry_after_http_date_is_parsed():
    retry_at = datetime.now(timezone.utc) + timedelta(seconds=45)
    header = format_datetime(retry_at, usegmt=True)
    request = httpx.Request("GET", "https://provider.example/v1")
    response = httpx.Response(429, headers={"Retry-After": header}, request=request)
    classification = ErrorClassifier.classify(
        httpx.HTTPStatusError("rate limit", request=request, response=response)
    )

    assert classification.retry_after_seconds is not None
    assert 0 <= classification.retry_after_seconds <= 45
    assert classification.cooldown_seconds == classification.retry_after_seconds


def test_403_incidental_rate_substring_is_not_a_quota_signal():
    # "separate" contains the substring "rate"; that alone must not mean rate-limited.
    classification = ErrorClassifier.classify(
        PermissionError("This account uses a separate entitlement profile", provider="openai")
    )
    assert classification.category == ErrorCategory.PERMISSION


def test_403_structured_resource_exhausted_code_is_quota():
    classification = ErrorClassifier.classify(
        PermissionError(
            "Request rejected",
            provider="gemini",
            details={"error": {"code": "RESOURCE_EXHAUSTED"}},
        )
    )
    assert classification.category == ErrorCategory.QUOTA_EXHAUSTED
    assert classification.scope == QuotaScope.PROJECT


def test_422_is_a_non_retryable_client_validation_error():
    request = httpx.Request("POST", "https://provider.example/v1")
    response = httpx.Response(422, request=request)
    classification = ErrorClassifier.classify(
        httpx.HTTPStatusError("unprocessable entity", request=request, response=response)
    )
    assert classification.category == ErrorCategory.BAD_REQUEST
    assert classification.status_code == 422
    assert classification.is_retryable is False


def test_authentication_errors_are_safe_cross_candidate_failovers():
    auth = ErrorClassifier.classify(AuthenticationError("bad key", provider="groq"))
    should_retry, _ = RetryController.should_retry(
        attempt=1,
        max_attempts=4,
        start_monotonic=time.monotonic(),
        overall_deadline_seconds=30,
        classification=auth,
    )
    assert should_retry is True
    assert RetryController.should_try_next_credential(auth) is True

    bad_request = ErrorClassifier.classify(
        InvalidRequestError("invalid input", provider="groq")
    )
    should_retry, _ = RetryController.should_retry(
        attempt=1,
        max_attempts=4,
        start_monotonic=time.monotonic(),
        overall_deadline_seconds=30,
        classification=bad_request,
    )
    assert should_retry is False


def test_shared_quota_does_not_requeue_sibling_keys_in_same_quota_group():
    quota = ErrorClassification(
        category=ErrorCategory.QUOTA_EXHAUSTED,
        is_retryable=True,
        scope=QuotaScope.PROJECT,
        status_code=403,
        reason="shared project quota",
    )
    assert RetryController.should_try_next_credential(quota, uuid.uuid4()) is False
    assert RetryController.should_try_next_credential(quota, None) is True


@pytest.mark.asyncio
async def test_client_errors_do_not_increment_provider_circuit_breaker(db_session: AsyncSession):
    scope_type = "provider"
    scope_id = "test_client_error_does_not_trip"

    client_error = ErrorClassifier.classify(
        InvalidRequestError("invalid model parameter", provider="openai")
    )
    await CircuitBreakerManager.record_failure(
        db_session,
        scope_type,
        scope_id,
        client_error.reason,
        classification=client_error,
    )
    await db_session.commit()

    breaker = await CircuitBreakerManager.get_or_create(db_session, scope_type, scope_id)
    assert breaker.current_failures == 0

    upstream_error = ErrorClassifier.classify(
        ProviderUnavailableError("provider outage", provider="openai")
    )
    await CircuitBreakerManager.record_failure(
        db_session,
        scope_type,
        scope_id,
        upstream_error.reason,
        classification=upstream_error,
    )
    await db_session.commit()

    breaker = await CircuitBreakerManager.get_or_create(db_session, scope_type, scope_id)
    assert breaker.current_failures == 1


@pytest.mark.asyncio
async def test_persisted_cooldown_streak_increases_and_success_resets(db_session: AsyncSession):
    encryption = get_encryption_service()
    provider = Provider(
        name="cooldown_streak_provider",
        display_name="Cooldown Streak Provider",
        is_enabled=True,
    )
    db_session.add(provider)
    await db_session.flush()

    credential = ProviderCredential(
        provider_id=provider.id,
        label="Cooldown streak key",
        encrypted_api_key=encryption.encrypt("test-secret"),
        key_preview="test_...cret",
        priority=1,
        is_active=True,
    )
    db_session.add(credential)
    await db_session.flush()

    health = CredentialHealth(
        credential_id=credential.id,
        status=HealthState.HEALTHY.value,
        consecutive_cooldowns=0,
    )
    db_session.add(health)
    await db_session.commit()

    classification = ErrorClassification(
        category=ErrorCategory.RATE_LIMIT,
        is_retryable=True,
        scope=QuotaScope.CREDENTIAL,
        status_code=429,
        retry_after_seconds=None,
        cooldown_seconds=30.0,
        reason="rate limit",
    )

    first = await CooldownManager.apply_credential_cooldown(
        db_session, credential.id, classification
    )
    await db_session.commit()
    assert 24.0 <= first <= 36.0
    assert health.consecutive_cooldowns == 1

    second = await CooldownManager.apply_credential_cooldown(
        db_session, credential.id, classification
    )
    await db_session.commit()
    assert 48.0 <= second <= 72.0
    assert health.consecutive_cooldowns == 2

    await CooldownManager.mark_success(db_session, credential.id)
    await db_session.commit()
    assert health.consecutive_cooldowns == 0

    after_recovery = await CooldownManager.apply_credential_cooldown(
        db_session, credential.id, classification
    )
    assert 24.0 <= after_recovery <= 36.0
