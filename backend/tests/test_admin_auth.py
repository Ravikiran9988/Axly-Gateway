import pytest
from httpx import AsyncClient
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.admin import Administrator


@pytest.mark.asyncio
async def test_admin_setup_and_auth_flow(client: AsyncClient, db_session: AsyncSession):
    # Ensure clean slate for administrators table
    await db_session.execute(delete(Administrator))
    await db_session.commit()

    # 1. Check setup status - should be required
    status_resp = await client.get("/api/admin/setup/status")
    assert status_resp.status_code == 200
    assert status_resp.json()["data"]["is_setup_required"] is True

    # 2. Perform initial setup
    admin_payload = {
        "email": "lead.admin@axly.gateway",
        "password": "StrongAdminPassword#2026",
    }
    setup_resp = await client.post("/api/admin/setup", json=admin_payload)
    assert setup_resp.status_code == 201
    assert setup_resp.json()["success"] is True

    # 3. Setup status should now be False (locked)
    status_resp2 = await client.get("/api/admin/setup/status")
    assert status_resp2.status_code == 200
    assert status_resp2.json()["data"]["is_setup_required"] is False

    # 4. Attempting setup again should be rejected (400 Bad Request)
    dup_setup = await client.post("/api/admin/setup", json=admin_payload)
    assert dup_setup.status_code == 400
    assert dup_setup.json()["error"]["code"] == "SETUP_LOCKED"

    # 5. Authenticate with valid credentials
    login_resp = await client.post(
        "/api/admin/auth/login",
        json={"email": admin_payload["email"], "password": admin_payload["password"]},
    )
    assert login_resp.status_code == 200
    token_data = login_resp.json()["data"]
    assert "access_token" in token_data
    assert token_data["token_type"] == "bearer"
    access_token = token_data["access_token"]

    # 6. Authenticate with invalid password
    bad_login = await client.post(
        "/api/admin/auth/login",
        json={"email": admin_payload["email"], "password": "WrongPassword!"},
    )
    assert bad_login.status_code == 401
    assert bad_login.json()["error"]["code"] == "INVALID_CREDENTIALS"

    # 7. Access protected admin profile endpoint
    me_resp = await client.get(
        "/api/admin/auth/me",
        headers={"Authorization": f"Bearer {access_token}"},
    )
    assert me_resp.status_code == 200
    assert me_resp.json()["data"]["email"] == admin_payload["email"].lower()

    # 8. Access admin endpoint without token should be 401
    unauth_resp = await client.get("/api/admin/auth/me")
    assert unauth_resp.status_code == 401
