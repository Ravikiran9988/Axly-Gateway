import pytest
from httpx import AsyncClient
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from unittest.mock import AsyncMock, patch

from app.core.security import create_access_token
from app.models.admin import Administrator
from app.models.credential import ProviderCredential
from app.models.provider import Provider
from app.services.auth import create_initial_admin
from app.services.encryption import get_encryption_service


@pytest.mark.asyncio
async def test_credential_management_and_encryption(client: AsyncClient, db_session: AsyncSession):
    # 1. Setup admin token
    await db_session.execute(delete(Administrator))
    await db_session.commit()
    admin = await create_initial_admin(db_session, "admin@axly.test", "Password#2026")
    await db_session.commit()
    token = create_access_token(str(admin.id))
    auth_header = {"Authorization": f"Bearer {token}"}

    # 2. Register provider
    provider_resp = await client.post(
        "/api/admin/providers",
        json={"name": "groq", "display_name": "Groq Cloud"},
        headers=auth_header,
    )
    assert provider_resp.status_code == 201
    provider_id = provider_resp.json()["data"]["id"]

    # 3. Create credential under provider
    raw_groq_key = "gsk_1234567890abcdef1234567890"
    cred_resp = await client.post(
        f"/api/admin/providers/{provider_id}/credentials",
        json={"label": "Groq Key 01", "api_key": raw_groq_key, "rate_limit_rpm": 100},
        headers=auth_header,
    )
    assert cred_resp.status_code == 201
    cred_data = cred_resp.json()["data"]
    cred_id = cred_data["id"]

    # Raw secret must NOT be in the API response
    assert raw_groq_key not in str(cred_resp.json())
    assert cred_data["key_preview"].startswith("gsk_")
    assert cred_data["key_preview"].endswith("7890")

    # 4. Verify in DB that it is encrypted with AES-256-GCM
    stmt = select(ProviderCredential).where(ProviderCredential.id == cred_id)
    db_cred = (await db_session.execute(stmt)).scalar_one()
    assert db_cred.encrypted_api_key.startswith("v1:")
    assert raw_groq_key not in db_cred.encrypted_api_key

    # Decrypt in backend service to verify round-trip
    decrypted = get_encryption_service().decrypt(db_cred.encrypted_api_key)
    assert decrypted == raw_groq_key

    # 5. Test credential connectivity endpoint
    with patch("app.providers.groq.adapter.GroqAdapter.validate_credentials", new_callable=AsyncMock) as mock_val:
        mock_val.return_value = True

        test_resp = await client.post(
            f"/api/admin/credentials/{cred_id}/test",
            headers=auth_header,
        )
        assert test_resp.status_code == 200
        assert test_resp.json()["data"]["status"] == "healthy"

    # 6. Update/Replace credential
    new_raw_key = "gsk_new_replaced_api_key_0987654321"
    patch_resp = await client.patch(
        f"/api/admin/credentials/{cred_id}",
        json={"label": "Replaced Groq Key", "api_key": new_raw_key},
        headers=auth_header,
    )
    assert patch_resp.status_code == 200
    assert patch_resp.json()["data"]["label"] == "Replaced Groq Key"
    assert new_raw_key not in str(patch_resp.json())

    # 7. Delete credential
    del_resp = await client.delete(f"/api/admin/credentials/{cred_id}", headers=auth_header)
    assert del_resp.status_code == 200
