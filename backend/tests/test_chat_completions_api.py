import pytest
from httpx import AsyncClient
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from unittest.mock import AsyncMock, patch

from app.models.credential import ProviderCredential
from app.models.gateway_key import GatewayApiKey
from app.models.logs import RequestLog
from app.models.model import Model
from app.models.provider import Provider
from app.providers.schemas import (
    ChatCompletionChoice,
    ChatCompletionChoiceMessage,
    ChatCompletionResponse,
    CompletionUsage,
)
from app.services.encryption import get_encryption_service
from app.services.key_service import create_gateway_key


@pytest.mark.asyncio
async def test_chat_completions_auth_failures(client: AsyncClient, db_session: AsyncSession):
    payload = {
        "model": "gpt-4o",
        "messages": [{"role": "user", "content": "Hello"}],
    }

    # 1. Missing Authorization header
    resp_no_auth = await client.post("/v1/chat/completions", json=payload)
    assert resp_no_auth.status_code == 401
    assert resp_no_auth.json()["error"]["code"] == "GATEWAY_KEY_MISSING"

    # 2. Invalid gateway key
    resp_bad_auth = await client.post(
        "/v1/chat/completions",
        json=payload,
        headers={"Authorization": "Bearer axly_live_invalidkey1234567890abcdef"},
    )
    assert resp_bad_auth.status_code == 401
    assert resp_bad_auth.json()["error"]["code"] == "INVALID_GATEWAY_KEY"

    # 3. Revoked gateway key
    key_record, raw_key = await create_gateway_key(db_session, "Revoked Key")
    key_record.is_active = False
    db_session.add(key_record)
    await db_session.commit()

    resp_revoked = await client.post(
        "/v1/chat/completions",
        json=payload,
        headers={"Authorization": f"Bearer {raw_key}"},
    )
    assert resp_revoked.status_code == 401
    assert resp_revoked.json()["error"]["code"] == "INVALID_GATEWAY_KEY"


@pytest.mark.asyncio
async def test_chat_completions_successful_routing(client: AsyncClient, db_session: AsyncSession):
    # Setup Gateway API key
    _, raw_gateway_key = await create_gateway_key(db_session, "Active Client Key")

    # Setup Provider (OpenAI) and Credential
    encryption_service = get_encryption_service()
    provider = Provider(
        name="openai",
        display_name="OpenAI",
        is_enabled=True,
    )
    db_session.add(provider)
    await db_session.flush()

    cred = ProviderCredential(
        provider_id=provider.id,
        label="Primary OpenAI Key",
        encrypted_api_key=encryption_service.encrypt("sk-mock-key"),
        key_preview="sk-...mock",
        is_active=True,
    )
    db_session.add(cred)

    # Register model in DB
    model_record = Model(
        provider_id=provider.id,
        model_identifier="gpt-4o",
        display_name="GPT-4o",
        is_enabled=True,
        input_price_per_million=2.0,
        output_price_per_million=4.0,
    )
    db_session.add(model_record)
    await db_session.commit()

    mock_completion = ChatCompletionResponse(
        id="chatcmpl-test-response",
        created=1700000000,
        model="gpt-4o",
        choices=[
            ChatCompletionChoice(
                index=0,
                message=ChatCompletionChoiceMessage(role="assistant", content="Hello from AXLY Gateway!"),
                finish_reason="stop",
            )
        ],
        usage=CompletionUsage(prompt_tokens=10, completion_tokens=8, total_tokens=18),
    )

    with patch("app.providers.openai.adapter.OpenAIAdapter.complete_chat", new_callable=AsyncMock) as mock_complete:
        mock_complete.return_value = mock_completion

        resp = await client.post(
            "/v1/chat/completions",
            json={
                "model": "gpt-4o",
                "messages": [{"role": "user", "content": "Say hello"}],
            },
            headers={"Authorization": f"Bearer {raw_gateway_key}"},
        )

        assert resp.status_code == 200
        assert "X-Request-ID" in resp.headers
        data = resp.json()
        assert data["id"] == "chatcmpl-test-response"
        assert data["choices"][0]["message"]["content"] == "Hello from AXLY Gateway!"
        assert data["usage"]["total_tokens"] == 18

    request_log = (
        await db_session.execute(
            select(RequestLog).where(RequestLog.request_id == resp.headers["X-Request-ID"])
        )
    ).scalar_one()
    assert request_log.provider_id == provider.id
    assert request_log.estimated_cost_usd == pytest.approx(0.000052)


@pytest.mark.asyncio
async def test_gateway_key_rate_limit_is_enforced(client: AsyncClient, db_session: AsyncSession):
    _, raw_key = await create_gateway_key(
        db_session, "One Request Per Minute", rate_limit_rpm=1
    )
    await db_session.commit()
    headers = {"Authorization": f"Bearer {raw_key}"}

    first = await client.get("/v1/models", headers=headers)
    second = await client.get("/v1/models", headers=headers)

    assert first.status_code == 200
    assert second.status_code == 429
    assert second.json()["error"]["code"] == "GATEWAY_RATE_LIMIT_EXCEEDED"


@pytest.mark.asyncio
async def test_chat_completions_unsupported_model(client: AsyncClient, db_session: AsyncSession):
    _, raw_gateway_key = await create_gateway_key(db_session, "Test Client")
    await db_session.commit()

    # Clear providers to guarantee no enabled provider matches
    await db_session.execute(delete(Provider))
    await db_session.commit()

    resp = await client.post(
        "/v1/chat/completions",
        json={
            "model": "unknown-nonexistent-model",
            "messages": [{"role": "user", "content": "Hi"}],
        },
        headers={"Authorization": f"Bearer {raw_gateway_key}"},
    )

    assert resp.status_code in (404, 400)
    err = resp.json().get("error", {})
    assert "error" in resp.json()
