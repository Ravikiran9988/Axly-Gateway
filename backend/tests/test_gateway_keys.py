import pytest
from httpx import AsyncClient
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.admin import Administrator
from app.models.gateway_key import GatewayApiKey
from app.services.auth import create_initial_admin
from app.core.security import create_access_token


@pytest.mark.asyncio
async def test_gateway_key_lifecycle(client: AsyncClient, db_session: AsyncSession):
    # Setup test admin and generate auth token
    await db_session.execute(delete(Administrator))
    await db_session.execute(delete(GatewayApiKey))
    await db_session.commit()

    admin = await create_initial_admin(db_session, "admin@axly.gateway", "SecureAdminPass#2026")
    await db_session.commit()
    token = create_access_token(str(admin.id))
    auth_headers = {"Authorization": f"Bearer {token}"}

    # 1. Create gateway API key
    key_payload = {
        "label": "Production Microservice Key",
        "rate_limit_rpm": 120,
    }
    create_resp = await client.post("/api/v1/keys", json=key_payload, headers=auth_headers)
    assert create_resp.status_code == 201
    created_data = create_resp.json()["data"]
    assert "raw_key" in created_data
    raw_key = created_data["raw_key"]
    key_id = created_data["id"]
    assert raw_key.startswith("axly_live_")
    assert created_data["label"] == key_payload["label"]
    assert created_data["is_active"] is True

    # 2. List keys - raw_key MUST NOT be in list output
    list_resp = await client.get("/api/v1/keys", headers=auth_headers)
    assert list_resp.status_code == 200
    keys_list = list_resp.json()["data"]
    assert len(keys_list) >= 1
    found_key = next((k for k in keys_list if k["id"] == key_id), None)
    assert found_key is not None
    assert "raw_key" not in found_key
    assert "key_preview" in found_key

    # 3. Revoke key
    revoke_resp = await client.delete(f"/api/v1/keys/{key_id}", headers=auth_headers)
    assert revoke_resp.status_code == 200
    assert revoke_resp.json()["success"] is True

    # 4. Verify key list reflects inactive state
    list_resp2 = await client.get("/api/v1/keys", headers=auth_headers)
    refreshed_key = next((k for k in list_resp2.json()["data"] if k["id"] == key_id), None)
    assert refreshed_key is not None
    assert refreshed_key["is_active"] is False
