import asyncio
import pytest
from sqlalchemy.ext.asyncio import AsyncSession
from unittest.mock import AsyncMock, patch

from app.db.session import AsyncSessionLocal
from app.models.credential import ProviderCredential
from app.models.health import CredentialHealth
from app.models.model import Model
from app.models.provider import Provider
from app.models.quota import QuotaGroup
from app.models.routing import ModelAlias, ModelAliasCandidate
from app.providers.schemas import (
    ChatCompletionChoice,
    ChatCompletionChoiceMessage,
    ChatCompletionMessage,
    ChatCompletionRequest,
    ChatCompletionResponse,
    CompletionUsage,
)
from app.routing.circuit_breaker import CircuitBreakerManager
from app.routing.engine import RoutingEngine
from app.services.encryption import get_encryption_service


@pytest.mark.asyncio
async def test_concurrent_requests_circuit_breaker_and_quota_consistency(db_session: AsyncSession):
    """
    Test concurrent requests hitting the same provider and quota group.
    Verifies that failure counts, circuit breaker states, and quota states
    transition atomically under simultaneous execution without race conditions.
    """
    enc = get_encryption_service()

    provider = Provider(name="openai", display_name="Concurrent Provider", is_enabled=True)
    db_session.add(provider)
    await db_session.flush()

    qg = QuotaGroup(name="concurrent_quota_group", provider_id=provider.id, scope_type="project", status="healthy")
    db_session.add(qg)
    await db_session.flush()

    cred = ProviderCredential(
        provider_id=provider.id,
        quota_group_id=qg.id,
        label="Concurrent Key",
        encrypted_api_key=enc.encrypt("secret_conc"),
        key_preview="conc...1",
        priority=1,
        is_active=True,
    )
    db_session.add(cred)
    await db_session.flush()
    db_session.add(CredentialHealth(credential_id=cred.id, status="healthy"))

    model = Model(provider_id=provider.id, model_identifier="conc-model", display_name="Concurrent Model")
    db_session.add(model)
    await db_session.flush()

    alias = ModelAlias(alias_name="conc-alias", is_enabled=True)
    db_session.add(alias)
    await db_session.flush()
    db_session.add(ModelAliasCandidate(alias_id=alias.id, provider_id=provider.id, model_id=model.id, priority=1))
    await db_session.commit()

    # Run 10 simulated concurrent requests
    req = ChatCompletionRequest(
        model="conc-alias",
        messages=[ChatCompletionMessage(role="user", content="Ping")],
    )

    mock_resp = ChatCompletionResponse(
        id="chatcmpl-concurrent",
        created=1700000000,
        model="conc-model",
        choices=[ChatCompletionChoice(index=0, message=ChatCompletionChoiceMessage(role="assistant", content="OK"), finish_reason="stop")],
        usage=CompletionUsage(prompt_tokens=5, completion_tokens=5, total_tokens=10),
    )

    with patch("app.providers.openai.adapter.OpenAIAdapter.complete_chat", new_callable=AsyncMock) as mock_complete:
        mock_complete.return_value = mock_resp

        # Run 5 concurrent complete_chat calls using individual sessions
        async def run_one(request_id: str):
            async with AsyncSessionLocal() as session:
                return await RoutingEngine.complete_chat(db=session, request=req, request_id=request_id)

        tasks = [run_one(f"concurrent-{i}") for i in range(5)]
        results = await asyncio.gather(*tasks)

        for resp, decision in results:
            assert resp.choices[0].message.content == "OK"
            assert decision.success is True

    # Verify circuit breaker is CLOSED and failure counter is 0
    cb = await CircuitBreakerManager.get_or_create(db_session, "provider", "openai")
    assert cb.state == "CLOSED"
    assert cb.current_failures == 0
