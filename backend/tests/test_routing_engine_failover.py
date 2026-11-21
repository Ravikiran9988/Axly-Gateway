import pytest
import uuid
from typing import AsyncGenerator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from unittest.mock import AsyncMock, patch

from app.models.credential import ProviderCredential
from app.models.health import CredentialHealth
from app.models.model import Model
from app.models.provider import Provider
from app.models.quota import QuotaGroup
from app.models.routing import ModelAlias, ModelAliasCandidate, RoutingProfile
from app.models.routing_history import RoutingHistory
from app.providers.exceptions import (
    ProviderUnavailableError,
    QuotaExceededError,
)
from app.providers.schemas import (
    ChatCompletionChoice,
    ChatCompletionChoiceMessage,
    ChatCompletionMessage,
    ChatCompletionRequest,
    ChatCompletionResponse,
    CompletionUsage,
)
from app.routing.engine import RoutingEngine
from app.services.encryption import get_encryption_service


@pytest.mark.asyncio
async def test_cross_provider_failover_gemini_to_groq_to_openai(db_session: AsyncSession):
    """
    Demonstrates the canonical Prompt 3 failure & failover scenario:
    1. Alias: 'fast'
       - Candidate 1: Gemini (gemini-1.5-flash) [Key 01 & Key 02 share same project quota group]
       - Candidate 2: Groq (llama-3.1-8b-instant) [Key 01]
       - Candidate 3: OpenAI (gpt-4o-mini) [Key 01]
    2. Execution Flow:
       - Gemini Key 01 fails with 429 Quota Exhausted (shared project quota).
       - Gemini Key 02 is EXCLUDED automatically without attempting because it shares the same quota group.
       - Failover to Candidate 2: Groq Key 01 fails with 503 Provider Unavailable.
       - Failover to Candidate 3: OpenAI Key 01 succeeds with 200 OK!
    3. Verify:
       - Returned response is from OpenAI, with model reported as 'fast'.
       - Detailed routing audit history traces every attempt and exclusion reason.
    """
    enc = get_encryption_service()

    # 1. Setup Providers
    prov_gemini = Provider(name="gemini", display_name="Google Gemini", is_enabled=True)
    prov_groq = Provider(name="groq", display_name="Groq Cloud", is_enabled=True)
    prov_openai = Provider(name="openai", display_name="OpenAI Platform", is_enabled=True)
    db_session.add_all([prov_gemini, prov_groq, prov_openai])
    await db_session.flush()

    # 2. Setup Catalog Models
    m_gemini = Model(provider_id=prov_gemini.id, model_identifier="gemini-1.5-flash", display_name="Gemini 1.5 Flash")
    m_groq = Model(provider_id=prov_groq.id, model_identifier="llama-3.1-8b-instant", display_name="Llama 3.1 8B Instant")
    m_openai = Model(provider_id=prov_openai.id, model_identifier="gpt-4o-mini", display_name="GPT-4o Mini")
    db_session.add_all([m_gemini, m_groq, m_openai])
    await db_session.flush()

    # 3. Setup Shared Project Quota Group for Gemini
    gemini_project_qg = QuotaGroup(
        name="gemini-shared-cloud-project",
        provider_id=prov_gemini.id,
        scope_type="project",
        status="healthy",
    )
    db_session.add(gemini_project_qg)
    await db_session.flush()

    # 4. Setup Credentials
    # Gemini Key 01 and Key 02 in same quota group
    g_key_1 = ProviderCredential(
        provider_id=prov_gemini.id,
        quota_group_id=gemini_project_qg.id,
        label="Gemini Key 01",
        encrypted_api_key=enc.encrypt("gemini_key_1_secret"),
        key_preview="AIza...g1",
        priority=1,
        is_active=True,
    )
    g_key_2 = ProviderCredential(
        provider_id=prov_gemini.id,
        quota_group_id=gemini_project_qg.id,
        label="Gemini Key 02",
        encrypted_api_key=enc.encrypt("gemini_key_2_secret"),
        key_preview="AIza...g2",
        priority=2,
        is_active=True,
    )
    # Groq Key 01
    gr_key_1 = ProviderCredential(
        provider_id=prov_groq.id,
        label="Groq Key 01",
        encrypted_api_key=enc.encrypt("groq_key_1_secret"),
        key_preview="gsk_...gr1",
        priority=1,
        is_active=True,
    )
    # OpenAI Key 01
    oa_key_1 = ProviderCredential(
        provider_id=prov_openai.id,
        label="OpenAI Key 01",
        encrypted_api_key=enc.encrypt("openai_key_1_secret"),
        key_preview="sk-...oa1",
        priority=1,
        is_active=True,
    )
    db_session.add_all([g_key_1, g_key_2, gr_key_1, oa_key_1])
    await db_session.flush()

    db_session.add_all([
        CredentialHealth(credential_id=g_key_1.id, status="healthy"),
        CredentialHealth(credential_id=g_key_2.id, status="healthy"),
        CredentialHealth(credential_id=gr_key_1.id, status="healthy"),
        CredentialHealth(credential_id=oa_key_1.id, status="healthy"),
    ])

    # 5. Setup Profile & Alias 'fast'
    profile = RoutingProfile(name="production-default", strategy="priority", max_attempts=4)
    db_session.add(profile)
    await db_session.flush()

    alias_fast = ModelAlias(
        alias_name="fast",
        description="Fast routed tier with multi-provider fallbacks",
        profile_id=profile.id,
        is_enabled=True,
        max_attempts=4,
        timeout_seconds=30.0,
    )
    db_session.add(alias_fast)
    await db_session.flush()

    # Candidates: 1. Gemini, 2. Groq, 3. OpenAI
    c1 = ModelAliasCandidate(alias_id=alias_fast.id, provider_id=prov_gemini.id, model_id=m_gemini.id, priority=1)
    c2 = ModelAliasCandidate(alias_id=alias_fast.id, provider_id=prov_groq.id, model_id=m_groq.id, priority=2)
    c3 = ModelAliasCandidate(alias_id=alias_fast.id, provider_id=prov_openai.id, model_id=m_openai.id, priority=3)
    db_session.add_all([c1, c2, c3])
    await db_session.commit()

    # 6. Mock Adapter Behaviors
    # Gemini Adapter -> raises 429 QuotaExceededError (RESOURCE_EXHAUSTED)
    mock_gemini_error = QuotaExceededError(
        "Resource exhausted: Google Cloud project quota exceeded",
        provider="gemini",
        details={"status": "RESOURCE_EXHAUSTED", "code": 429},
    )
    # Groq Adapter -> raises 503 ProviderUnavailableError
    mock_groq_error = ProviderUnavailableError(
        "Groq cloud cluster experiencing temporary disruption",
        provider="groq",
    )
    # OpenAI Adapter -> returns 200 OK
    mock_openai_response = ChatCompletionResponse(
        id="chatcmpl-failover-success",
        created=1700000000,
        model="gpt-4o-mini",
        choices=[
            ChatCompletionChoice(
                index=0,
                message=ChatCompletionChoiceMessage(role="assistant", content="Failover successful from OpenAI!"),
                finish_reason="stop",
            )
        ],
        usage=CompletionUsage(prompt_tokens=15, completion_tokens=10, total_tokens=25),
    )

    req_id = "test-failover-trace-12345"
    chat_request = ChatCompletionRequest(
        model="fast",
        messages=[ChatCompletionMessage(role="user", content="Hello world")],
    )

    with (
        patch("app.providers.gemini.adapter.GeminiAdapter.complete_chat", new_callable=AsyncMock) as mock_gem,
        patch("app.providers.groq.adapter.GroqAdapter.complete_chat", new_callable=AsyncMock) as mock_gr,
        patch("app.providers.openai.adapter.OpenAIAdapter.complete_chat", new_callable=AsyncMock) as mock_oa,
    ):
        mock_gem.side_effect = mock_gemini_error
        mock_gr.side_effect = mock_groq_error
        mock_oa.return_value = mock_openai_response

        # 7. Execute through Routing Engine
        response, decision = await RoutingEngine.complete_chat(
            db=db_session,
            request=chat_request,
            request_id=req_id,
        )

        # 8. Assertions on Outcome
        assert response.choices[0].message.content == "Failover successful from OpenAI!"
        assert response.model == "fast"  # Alias preserved for client
        assert decision.success is True
        assert decision.selected_provider == "openai"
        assert decision.selected_model == "gpt-4o-mini"
        assert decision.selected_credential_label == "OpenAI Key 01"

        # Check attempts
        # Attempt 1: Gemini Key 01 -> failed with 429
        # (Gemini Key 02 was excluded because shared quota group was immediately placed in cooldown)
        # Attempt 2: Groq Key 01 -> failed with 503
        # Attempt 3: OpenAI Key 01 -> succeeded!
        assert len(decision.attempts) == 3
        assert decision.attempts[0].provider_name == "gemini"
        assert decision.attempts[0].result == "failure"
        assert decision.attempts[0].error_category == "quota_exhausted"

        assert decision.attempts[1].provider_name == "groq"
        assert decision.attempts[1].result == "failure"
        assert decision.attempts[1].error_category == "service_unavailable"

        assert decision.attempts[2].provider_name == "openai"
        assert decision.attempts[2].result == "success"

        # 9. Verify RoutingHistory database records
        stmt = (
            select(RoutingHistory)
            .where(RoutingHistory.request_id == req_id)
            .order_by(RoutingHistory.attempt_number.asc())
        )
        history_rows = (await db_session.execute(stmt)).scalars().all()
        assert len(history_rows) == 3
        assert history_rows[0].provider_name == "gemini"
        assert history_rows[1].provider_name == "groq"
        assert history_rows[2].provider_name == "openai"
        assert history_rows[2].result == "success"
