import pytest
from httpx import AsyncClient
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.model import Model
from app.models.provider import Provider
from app.services.key_service import create_gateway_key


@pytest.mark.asyncio
async def test_models_catalog_listing(client: AsyncClient, db_session: AsyncSession):
    _, raw_gateway_key = await create_gateway_key(db_session, "Model Reader")
    await db_session.execute(delete(Model))
    await db_session.execute(delete(Provider))
    await db_session.flush()

    provider = Provider(name="gemini", display_name="Google Gemini", is_enabled=True)
    db_session.add(provider)
    await db_session.flush()

    # Model 1: Enabled
    m1 = Model(
        provider_id=provider.id,
        model_identifier="gemini-1.5-pro",
        display_name="Gemini 1.5 Pro",
        context_window=2000000,
        is_enabled=True,
    )
    # Model 2: Disabled
    m2 = Model(
        provider_id=provider.id,
        model_identifier="gemini-1.0-deprecated",
        display_name="Gemini 1.0 (Deprecated)",
        context_window=32768,
        is_enabled=False,
    )
    db_session.add(m1)
    db_session.add(m2)
    await db_session.commit()

    resp = await client.get("/v1/models", headers={"Authorization": f"Bearer {raw_gateway_key}"})
    assert resp.status_code == 200
    data = resp.json()

    assert data["object"] == "list"
    models = data["data"]
    assert len(models) == 1
    assert models[0]["id"] == "gemini-1.5-pro"
    assert models[0]["owned_by"] == "gemini"
    assert models[0]["context_window"] == 2000000
