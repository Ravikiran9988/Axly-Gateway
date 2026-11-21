import pytest
from datetime import datetime, timedelta, timezone
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.base import utc_now
from app.models.credential import ProviderCredential
from app.models.health import CredentialHealth
from app.models.provider import Provider
from app.models.quota import QuotaGroup
from app.routing.credential_selector import CredentialSelector
from app.routing.error_classifier import ErrorClassifier
from app.routing.health_tracker import HealthTracker
from app.routing.quota_manager import QuotaManager
from app.routing.schemas import ErrorCategory, ErrorClassification, HealthState, QuotaScope
from app.services.encryption import get_encryption_service


@pytest.mark.asyncio
async def test_shared_project_quota_exclusion_across_sibling_keys(db_session: AsyncSession):
    """
    Core Quota Test:
    Two Gemini API keys belong to the same Google Cloud Project quota group.
    When Key 01 experiences a 429 Project Quota failure:
    1. The shared QuotaGroup is placed into cooldown.
    2. Key 02 must NOT be tried because it shares the same exhausted project quota!
    """
    enc = get_encryption_service()

    # 1. Setup Provider & Shared Project Quota Group
    provider = Provider(name="gemini_quota_test", display_name="Gemini Quota Test", is_enabled=True)
    db_session.add(provider)
    await db_session.flush()

    shared_project_group = QuotaGroup(
        name="gemini-prod-project",
        provider_id=provider.id,
        scope_type="project",
        status="healthy",
    )
    db_session.add(shared_project_group)
    await db_session.flush()

    # 2. Add two keys sharing this quota group
    key_01 = ProviderCredential(
        provider_id=provider.id,
        quota_group_id=shared_project_group.id,
        label="Gemini Key 01",
        encrypted_api_key=enc.encrypt("gemini_key_01_secret"),
        key_preview="AIza...01",
        priority=1,
        is_active=True,
    )
    key_02 = ProviderCredential(
        provider_id=provider.id,
        quota_group_id=shared_project_group.id,
        label="Gemini Key 02",
        encrypted_api_key=enc.encrypt("gemini_key_02_secret"),
        key_preview="AIza...02",
        priority=2,
        is_active=True,
    )
    db_session.add_all([key_01, key_02])
    await db_session.flush()

    db_session.add_all([
        CredentialHealth(credential_id=key_01.id, status="healthy"),
        CredentialHealth(credential_id=key_02.id, status="healthy"),
    ])
    await db_session.commit()

    # 3. Initially, Key 01 (priority 1) is selected
    selected_1, _ = await CredentialSelector.select_eligible_credential(db_session, provider.id)
    assert selected_1 is not None
    assert selected_1.credential_id == key_01.id

    # 4. Simulate a 429 Project Quota Exhaustion failure on Key 01
    classification = ErrorClassification(
        category=ErrorCategory.QUOTA_EXHAUSTED,
        is_retryable=True,
        scope=QuotaScope.PROJECT,
        cooldown_seconds=60.0,
        status_code=429,
        reason="Quota exceeded for project 123456789: RESOURCE_EXHAUSTED",
        confidence="certain",
    )

    await HealthTracker.record_attempt_result(
        db=db_session,
        credential_id=key_01.id,
        provider_name="gemini_quota_test",
        quota_group_id=key_01.quota_group_id,
        success=False,
        latency_ms=150.0,
        classification=classification,
    )
    await db_session.commit()

    # 5. Now verify: Key 02 MUST NOT be selected because the shared project quota group is in cooldown!
    selected_after, exclusions = await CredentialSelector.select_eligible_credential(db_session, provider.id)
    assert selected_after is None
    # Both keys were excluded due to the shared project quota group
    assert any("gemini-prod-project" in e["reason"] for e in exclusions)


@pytest.mark.asyncio
async def test_independent_quota_groups_not_affected(db_session: AsyncSession):
    """
    Test that an independent key in a separate quota group (or without a quota group)
    remains eligible even if another project quota group is in cooldown.
    """
    enc = get_encryption_service()
    provider = Provider(name="gemini_indep_test", display_name="Gemini Independent Test", is_enabled=True)
    db_session.add(provider)
    await db_session.flush()

    # Group A in cooldown
    group_a = QuotaGroup(
        name="project-alpha-exhausted",
        provider_id=provider.id,
        scope_type="project",
        status="cooldown",
        cooldown_until=utc_now() + timedelta(seconds=120),
        last_error_category="quota_exhausted",
    )
    # Group B healthy
    group_b = QuotaGroup(
        name="project-beta-healthy",
        provider_id=provider.id,
        scope_type="project",
        status="healthy",
    )
    db_session.add_all([group_a, group_b])
    await db_session.flush()

    key_a = ProviderCredential(
        provider_id=provider.id,
        quota_group_id=group_a.id,
        label="Key Alpha",
        encrypted_api_key=enc.encrypt("sec_a"),
        key_preview="AIza...a",
        priority=1,
        is_active=True,
    )
    key_b = ProviderCredential(
        provider_id=provider.id,
        quota_group_id=group_b.id,
        label="Key Beta",
        encrypted_api_key=enc.encrypt("sec_b"),
        key_preview="AIza...b",
        priority=2,
        is_active=True,
    )
    db_session.add_all([key_a, key_b])
    await db_session.flush()

    db_session.add_all([
        CredentialHealth(credential_id=key_a.id, status="healthy"),
        CredentialHealth(credential_id=key_b.id, status="healthy"),
    ])
    await db_session.commit()

    # Selection must skip Key Alpha and select Key Beta!
    selected, exclusions = await CredentialSelector.select_eligible_credential(db_session, provider.id)
    assert selected is not None
    assert selected.credential_id == key_b.id
    assert selected.label == "Key Beta"


@pytest.mark.asyncio
async def test_quota_group_cooldown_expiry_and_auto_recovery(db_session: AsyncSession):
    """Test that when a quota group's cooldown_until passes, it auto-recovers to healthy."""
    group = QuotaGroup(
        name="project-expired-cooldown",
        scope_type="project",
        status="cooldown",
        cooldown_until=utc_now() - timedelta(seconds=5),  # 5 seconds in the past
    )
    db_session.add(group)
    await db_session.commit()

    is_eligible, reason = await QuotaManager.is_quota_group_eligible(db_session, group.id)
    assert is_eligible is True
    assert "auto-recovered" in reason

    # Verify status changed in DB
    refetched = (await db_session.execute(
        QuotaGroup.__table__.select().where(QuotaGroup.id == group.id)
    )).one()
    assert refetched.status == "healthy"
    assert refetched.cooldown_until is None
