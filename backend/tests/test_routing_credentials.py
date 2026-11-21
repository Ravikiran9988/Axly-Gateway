import pytest
import uuid
from httpx import AsyncClient
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from unittest.mock import AsyncMock, patch

from app.core.security import create_access_token
from app.models.admin import Administrator
from app.models.credential import ProviderCredential
from app.models.health import CredentialHealth
from app.models.model import Model
from app.models.provider import Provider
from app.routing.cooldown_manager import CooldownManager
from app.routing.credential_selector import CredentialSelector
from app.routing.schemas import HealthState
from app.services.auth import create_initial_admin
from app.services.encryption import get_encryption_service


@pytest.mark.asyncio
async def test_multiple_credentials_and_priority_selection(db_session: AsyncSession):
    """
    Test multiple credentials per provider:
    Ensure selection respects administrator priority (priority 1 before priority 2).
    """
    # 1. Setup Provider
    provider = Provider(name="test_multi_prov", display_name="Multi Test Provider", is_enabled=True)
    db_session.add(provider)
    await db_session.flush()

    enc = get_encryption_service()

    # 2. Add two credentials with different priorities
    cred_low_priority = ProviderCredential(
        provider_id=provider.id,
        label="Key Secondary Priority 2",
        encrypted_api_key=enc.encrypt("key_secret_p2"),
        key_preview="key_...p2",
        priority=2,
        is_active=True,
    )
    cred_high_priority = ProviderCredential(
        provider_id=provider.id,
        label="Key Primary Priority 1",
        encrypted_api_key=enc.encrypt("key_secret_p1"),
        key_preview="key_...p1",
        priority=1,
        is_active=True,
    )
    db_session.add_all([cred_low_priority, cred_high_priority])
    await db_session.flush()

    db_session.add_all([
        CredentialHealth(credential_id=cred_low_priority.id, status=HealthState.HEALTHY.value),
        CredentialHealth(credential_id=cred_high_priority.id, status=HealthState.HEALTHY.value),
    ])
    await db_session.commit()

    # 3. Select eligible credential -> must select Priority 1
    selected, exclusions = await CredentialSelector.select_eligible_credential(db_session, provider.id)
    assert selected is not None
    assert selected.credential_id == cred_high_priority.id
    assert selected.decrypted_api_key == "key_secret_p1"

    # 4. If Priority 1 is already attempted, next selection must pick Priority 2
    selected_2, exclusions_2 = await CredentialSelector.select_eligible_credential(
        db_session, provider.id, excluded_credential_ids={cred_high_priority.id}
    )
    assert selected_2 is not None
    assert selected_2.credential_id == cred_low_priority.id
    assert selected_2.decrypted_api_key == "key_secret_p2"


@pytest.mark.asyncio
async def test_disabled_and_unhealthy_credentials_exclusion(db_session: AsyncSession):
    """Test that disabled, rate-limited, and auth-failed credentials are automatically excluded."""
    provider = Provider(name="test_exclusion_prov", display_name="Exclusion Provider", is_enabled=True)
    db_session.add(provider)
    await db_session.flush()

    enc = get_encryption_service()

    # Key 1: Disabled
    c_disabled = ProviderCredential(
        provider_id=provider.id,
        label="Disabled Key",
        encrypted_api_key=enc.encrypt("sec_1"),
        key_preview="sec_...1",
        priority=1,
        is_active=False,
    )
    # Key 2: Authentication failure
    c_auth_fail = ProviderCredential(
        provider_id=provider.id,
        label="Revoked Key",
        encrypted_api_key=enc.encrypt("sec_2"),
        key_preview="sec_...2",
        priority=2,
        is_active=True,
    )
    # Key 3: Healthy
    c_healthy = ProviderCredential(
        provider_id=provider.id,
        label="Healthy Backup Key",
        encrypted_api_key=enc.encrypt("sec_3"),
        key_preview="sec_...3",
        priority=3,
        is_active=True,
    )
    db_session.add_all([c_disabled, c_auth_fail, c_healthy])
    await db_session.flush()

    db_session.add_all([
        CredentialHealth(credential_id=c_disabled.id, status=HealthState.DISABLED.value),
        CredentialHealth(credential_id=c_auth_fail.id, status=HealthState.AUTHENTICATION_FAILURE.value),
        CredentialHealth(credential_id=c_healthy.id, status=HealthState.HEALTHY.value),
    ])
    await db_session.commit()

    # Selection must skip Key 1 and Key 2, and select Key 3
    selected, exclusions = await CredentialSelector.select_eligible_credential(db_session, provider.id)
    assert selected is not None
    assert selected.credential_id == c_healthy.id
    assert selected.label == "Healthy Backup Key"
    assert len(exclusions) == 2


@pytest.mark.asyncio
async def test_auth_failure_recovery_safety_guard(client: AsyncClient, db_session: AsyncSession):
    """
    Test that an administrator cannot accidentally recover a credential
    with authentication_failure without verifying the key against upstream.
    """
    await db_session.execute(delete(Administrator))
    await db_session.commit()
    admin = await create_initial_admin(db_session, "admin_sec@axly.test", "Password#2026")
    await db_session.commit()
    token = create_access_token(str(admin.id))
    auth_header = {"Authorization": f"Bearer {token}"}

    provider = Provider(name="openai", display_name="OpenAI Test", is_enabled=True)
    db_session.add(provider)
    await db_session.flush()

    enc = get_encryption_service()
    cred = ProviderCredential(
        provider_id=provider.id,
        label="Broken Key",
        encrypted_api_key=enc.encrypt("sk-invalid"),
        key_preview="sk-...inv",
        priority=1,
        is_active=True,
    )
    db_session.add(cred)
    await db_session.flush()

    health = CredentialHealth(
        credential_id=cred.id,
        status=HealthState.AUTHENTICATION_FAILURE.value,
        last_error_message="Invalid API Key",
    )
    db_session.add(health)
    await db_session.commit()

    # Attempt manual recover where upstream validation fails
    with patch("app.providers.openai.adapter.OpenAIAdapter.validate_credentials", new_callable=AsyncMock) as mock_val:
        mock_val.side_effect = Exception("Incorrect API key provided")

        recover_resp = await client.post(
            f"/api/admin/credentials/{cred.id}/recover",
            json={"validate_upstream": True},
            headers=auth_header,
        )
        assert recover_resp.status_code == 400
        assert "validation rejected" in recover_resp.json()["error"]["message"]

        # Status must remain authentication_failure
        h_resp = await client.get(f"/api/admin/credentials/{cred.id}/health", headers=auth_header)
        assert h_resp.json()["data"]["status"] == "authentication_failure"
