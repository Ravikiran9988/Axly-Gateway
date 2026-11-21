import pytest
import uuid
from httpx import AsyncClient
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token
from app.models.admin import Administrator
from app.models.credential import ProviderCredential
from app.models.health import CredentialHealth
from app.models.model import Model
from app.models.provider import Provider
from app.models.quota import QuotaGroup
from app.services.auth import create_initial_admin
from app.services.encryption import get_encryption_service


@pytest.mark.asyncio
async def test_admin_routing_profiles_crud(client: AsyncClient, db_session: AsyncSession):
    """Test full CRUD lifecycle for Routing Profiles."""
    await db_session.execute(delete(Administrator))
    await db_session.commit()
    admin = await create_initial_admin(db_session, "admin_prof@axly.test", "Password#2026")
    await db_session.commit()
    token = create_access_token(str(admin.id))
    auth = {"Authorization": f"Bearer {token}"}

    # 1. Create Profile
    create_resp = await client.post(
        "/api/admin/routing/profiles",
        json={
            "name": "high-resilience",
            "description": "Profile for mission critical calls",
            "strategy": "priority",
            "max_attempts": 4,
            "retry_after_cooldown": True,
        },
        headers=auth,
    )
    assert create_resp.status_code == 201
    profile_id = create_resp.json()["data"]["id"]
    assert create_resp.json()["data"]["name"] == "high-resilience"

    # 2. List Profiles
    list_resp = await client.get("/api/admin/routing/profiles", headers=auth)
    assert list_resp.status_code == 200
    assert any(p["id"] == profile_id for p in list_resp.json()["data"])

    # 3. Patch Profile
    patch_resp = await client.patch(
        f"/api/admin/routing/profiles/{profile_id}",
        json={"max_attempts": 5, "description": "Updated description"},
        headers=auth,
    )
    assert patch_resp.status_code == 200
    assert patch_resp.json()["data"]["max_attempts"] == 5

    # 4. Delete Profile
    del_resp = await client.delete(f"/api/admin/routing/profiles/{profile_id}", headers=auth)
    assert del_resp.status_code == 200


@pytest.mark.asyncio
async def test_admin_model_aliases_and_candidates_crud(client: AsyncClient, db_session: AsyncSession):
    """Test full CRUD lifecycle for Model Aliases and candidate assignment."""
    await db_session.execute(delete(Administrator))
    await db_session.commit()
    admin = await create_initial_admin(db_session, "admin_alias@axly.test", "Password#2026")
    await db_session.commit()
    token = create_access_token(str(admin.id))
    auth = {"Authorization": f"Bearer {token}"}

    # Setup Provider and Catalog Model
    prov = Provider(name="groq_alias_test", display_name="Groq Alias", is_enabled=True)
    db_session.add(prov)
    await db_session.flush()
    mod = Model(provider_id=prov.id, model_identifier="llama-3.1-70b", display_name="Llama 70B")
    db_session.add(mod)
    await db_session.commit()

    # 1. Create Alias 'coding' with candidate
    create_resp = await client.post(
        "/api/admin/routing/aliases",
        json={
            "alias_name": "coding",
            "description": "Code generation alias",
            "max_attempts": 3,
            "timeout_seconds": 45.0,
            "candidates": [
                {
                    "provider_id": str(prov.id),
                    "model_id": str(mod.id),
                    "priority": 1,
                    "weight": 100,
                }
            ],
        },
        headers=auth,
    )
    assert create_resp.status_code == 201
    alias_id = create_resp.json()["data"]["id"]
    assert create_resp.json()["data"]["alias_name"] == "coding"
    assert len(create_resp.json()["data"]["candidates"]) == 1

    # 2. List Aliases
    list_resp = await client.get("/api/admin/routing/aliases", headers=auth)
    assert list_resp.status_code == 200
    assert any(a["id"] == alias_id for a in list_resp.json()["data"])

    # 3. Patch Alias
    patch_resp = await client.patch(
        f"/api/admin/routing/aliases/{alias_id}",
        json={"timeout_seconds": 60.0},
        headers=auth,
    )
    assert patch_resp.status_code == 200
    assert patch_resp.json()["data"]["timeout_seconds"] == 60.0

    # 4. Delete Alias
    del_resp = await client.delete(f"/api/admin/routing/aliases/{alias_id}", headers=auth)
    assert del_resp.status_code == 200


@pytest.mark.asyncio
async def test_admin_quota_groups_crud_and_overrides(client: AsyncClient, db_session: AsyncSession):
    """Test full CRUD and manual cooldown/recovery for Quota Groups."""
    await db_session.execute(delete(Administrator))
    await db_session.commit()
    admin = await create_initial_admin(db_session, "admin_qg@axly.test", "Password#2026")
    await db_session.commit()
    token = create_access_token(str(admin.id))
    auth = {"Authorization": f"Bearer {token}"}

    # 1. Create Quota Group
    qg_resp = await client.post(
        "/api/admin/quota-groups",
        json={
            "name": "gcp-prod-billing",
            "scope_type": "project",
            "tier_level": 2,
            "monthly_budget_usd": 500.0,
        },
        headers=auth,
    )
    assert qg_resp.status_code == 201
    qg_id = qg_resp.json()["data"]["id"]

    # 2. Manual Cooldown
    cool_resp = await client.post(
        f"/api/admin/quota-groups/{qg_id}/cooldown",
        json={"duration_seconds": 180.0, "reason": "Monthly budget threshold reached"},
        headers=auth,
    )
    assert cool_resp.status_code == 200
    assert cool_resp.json()["data"]["status"] == "cooldown"

    # 3. Manual Recover
    rec_resp = await client.post(f"/api/admin/quota-groups/{qg_id}/recover", headers=auth)
    assert rec_resp.status_code == 200
    assert rec_resp.json()["data"]["status"] == "healthy"

    # 4. Delete
    del_resp = await client.delete(f"/api/admin/quota-groups/{qg_id}", headers=auth)
    assert del_resp.status_code == 200


@pytest.mark.asyncio
async def test_admin_circuit_breakers_and_health_observability(client: AsyncClient, db_session: AsyncSession):
    """Test Circuit Breakers listing/reset and Routing Health/History endpoints."""
    await db_session.execute(delete(Administrator))
    await db_session.commit()
    admin = await create_initial_admin(db_session, "admin_obs@axly.test", "Password#2026")
    await db_session.commit()
    token = create_access_token(str(admin.id))
    auth = {"Authorization": f"Bearer {token}"}

    # 1. Check Routing Health Overview
    h_resp = await client.get("/api/admin/routing/health", headers=auth)
    assert h_resp.status_code == 200
    assert "providers" in h_resp.json()["data"]
    assert "circuit_breakers" in h_resp.json()["data"]
    assert "quota_groups" in h_resp.json()["data"]

    # 2. Check Routing History endpoint
    hist_resp = await client.get("/api/admin/routing/history?limit=10", headers=auth)
    assert hist_resp.status_code == 200
    assert isinstance(hist_resp.json()["data"], list)

    # 3. List Circuit Breakers
    cb_resp = await client.get("/api/admin/circuit-breakers", headers=auth)
    assert cb_resp.status_code == 200

    # 4. Reset Circuit Breaker endpoint
    reset_resp = await client.post("/api/admin/circuit-breakers/provider/groq/reset", headers=auth)
    assert reset_resp.status_code == 200
    assert reset_resp.json()["data"]["state"] == "CLOSED"
