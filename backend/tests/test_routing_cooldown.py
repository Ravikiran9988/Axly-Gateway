import pytest
from datetime import datetime, timedelta
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.base import utc_now
from app.models.credential import ProviderCredential
from app.models.health import CredentialHealth
from app.models.provider import Provider
from app.routing.cooldown_manager import CooldownManager
from app.routing.policies import CooldownPolicy
from app.routing.schemas import ErrorCategory, ErrorClassification, HealthState, QuotaScope
from app.services.encryption import get_encryption_service


def test_cooldown_exponential_backoff_and_jitter():
    """Verify that consecutive failures increase cooldown exponentially within bounded jitter."""
    # Attempt 0: base 30s (+/- 20% jitter) -> between 24s and 36s
    d0 = CooldownPolicy.calculate_cooldown(ErrorCategory.RATE_LIMIT, consecutive_cooldowns=0)
    assert 24.0 <= d0 <= 36.0

    # Attempt 1: base 30 * 2^1 = 60s (+/- 20%) -> between 48s and 72s
    d1 = CooldownPolicy.calculate_cooldown(ErrorCategory.RATE_LIMIT, consecutive_cooldowns=1)
    assert 48.0 <= d1 <= 72.0

    # Attempt 2: base 30 * 2^2 = 120s (+/- 20%) -> between 96s and 144s
    d2 = CooldownPolicy.calculate_cooldown(ErrorCategory.RATE_LIMIT, consecutive_cooldowns=2)
    assert 96.0 <= d2 <= 144.0

    # Respects max boundary
    d_max = CooldownPolicy.calculate_cooldown(ErrorCategory.RATE_LIMIT, consecutive_cooldowns=10)
    assert d_max <= 900.0 * 1.2


def test_cooldown_respects_retry_after():
    """When an upstream provider passes a reliable Retry-After, cooldown must honor it."""
    duration = CooldownPolicy.calculate_cooldown(
        ErrorCategory.RATE_LIMIT, consecutive_cooldowns=0, explicit_retry_after=50.0
    )
    assert 50.0 <= duration <= 51.0


@pytest.mark.asyncio
async def test_credential_automatic_recovery_flow(db_session: AsyncSession):
    """
    Test that an expired cooldown automatically transitions from rate_limited to recovering,
    and a subsequent successful request fully restores healthy status.
    """
    enc = get_encryption_service()
    provider = Provider(name="cooldown_test_prov", display_name="Cooldown Provider", is_enabled=True)
    db_session.add(provider)
    await db_session.flush()

    cred = ProviderCredential(
        provider_id=provider.id,
        label="Test Key",
        encrypted_api_key=enc.encrypt("secret_key"),
        key_preview="key_...123",
        priority=1,
        is_active=True,
    )
    db_session.add(cred)
    await db_session.flush()

    # Place in cooldown in the past (expired 10s ago)
    health = CredentialHealth(
        credential_id=cred.id,
        status=HealthState.RATE_LIMITED.value,
        cooldown_until=utc_now() - timedelta(seconds=10),
        consecutive_cooldowns=2,
    )
    db_session.add(health)
    await db_session.commit()

    # 1. Check recovery: should auto-recover to recovering
    eligible, reason = await CooldownManager.check_and_recover_credential(db_session, cred, health)
    assert eligible is True
    assert health.status == HealthState.RECOVERING.value
    assert health.cooldown_until is None

    # 2. Mark success: should restore to healthy and clear cooldown counters
    await CooldownManager.mark_success(db_session, cred.id, latency_ms=120.0)
    await db_session.commit()

    assert health.status == HealthState.HEALTHY.value
    assert health.consecutive_cooldowns == 0
    assert health.consecutive_failures == 0


@pytest.mark.asyncio
async def test_manual_cooldown_override(db_session: AsyncSession):
    """Test administrator manual cooldown application and clearing."""
    enc = get_encryption_service()
    provider = Provider(name="manual_cooldown_prov", display_name="Manual Cooldown Prov", is_enabled=True)
    db_session.add(provider)
    await db_session.flush()

    cred = ProviderCredential(
        provider_id=provider.id,
        label="Manual Key",
        encrypted_api_key=enc.encrypt("sec_man"),
        key_preview="sec_...man",
        priority=1,
        is_active=True,
    )
    db_session.add(cred)
    await db_session.flush()

    health = CredentialHealth(credential_id=cred.id, status=HealthState.HEALTHY.value)
    db_session.add(health)
    await db_session.commit()

    # Manually place in cooldown for 300s
    await CooldownManager.manual_override_cooldown(
        db_session, cred.id, duration_seconds=300.0, reason="Operator maintenance"
    )
    assert health.status == HealthState.TEMPORARILY_UNAVAILABLE.value
    assert health.cooldown_until > utc_now() + timedelta(seconds=200)

    # Manually recover
    await CooldownManager.manual_recover_credential(db_session, cred.id)
    assert health.status == HealthState.HEALTHY.value
    assert health.cooldown_until is None
