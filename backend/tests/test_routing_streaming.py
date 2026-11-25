import json
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from unittest.mock import AsyncMock, patch

from app.models.credential import ProviderCredential
from app.models.health import CredentialHealth
from app.models.model import Model
from app.models.provider import Provider
from app.models.routing_history import RoutingHistory
from app.models.routing import ModelAlias, ModelAliasCandidate
from app.providers.exceptions import ProviderUnavailableError
from app.providers.schemas import (
    ChatCompletionChunk,
    ChatCompletionChunkChoice,
    ChatCompletionChunkDelta,
    ChatCompletionMessage,
    ChatCompletionRequest,
)
from app.routing.engine import RoutingEngine
from app.services.encryption import get_encryption_service


async def mock_failing_stream(req, key):
    # Fails immediately before yielding anything
    raise ProviderUnavailableError("Immediate connection drop", provider="groq")
    yield  # make it a generator


async def mock_successful_stream(req, key):
    yield ChatCompletionChunk(
        id="chunk-1",
        model="gpt-4o-mini",
        choices=[ChatCompletionChunkChoice(index=0, delta=ChatCompletionChunkDelta(content="Hello "))],
    )
    yield ChatCompletionChunk(
        id="chunk-2",
        model="gpt-4o-mini",
        choices=[ChatCompletionChunkChoice(index=0, delta=ChatCompletionChunkDelta(content="world!"))],
    )


async def mock_midstream_failing_stream(req, key):
    # Emits chunk 1, then crashes mid-stream
    yield ChatCompletionChunk(
        id="chunk-1",
        model="groq-model",
        choices=[ChatCompletionChunkChoice(index=0, delta=ChatCompletionChunkDelta(content="Partial "))],
    )
    raise RuntimeError("Upstream socket closed mid-generation")


@pytest.mark.asyncio
async def test_streaming_pre_first_chunk_failover(db_session: AsyncSession):
    """
    Test pre-first-chunk failover:
    Candidate 1 (Groq) crashes before any chunk is produced.
    Failover switches to Candidate 2 (OpenAI), which produces chunks successfully.
    """
    enc = get_encryption_service()

    p_groq = Provider(name="groq", display_name="Groq", is_enabled=True)
    p_openai = Provider(name="openai", display_name="OpenAI", is_enabled=True)
    db_session.add_all([p_groq, p_openai])
    await db_session.flush()

    m_groq = Model(provider_id=p_groq.id, model_identifier="llama-3.1-8b-instant", display_name="Llama")
    m_openai = Model(provider_id=p_openai.id, model_identifier="gpt-4o-mini", display_name="GPT-4o")
    db_session.add_all([m_groq, m_openai])
    await db_session.flush()

    c_groq = ProviderCredential(
        provider_id=p_groq.id, label="Groq Key", encrypted_api_key=enc.encrypt("k1"), key_preview="k1...", priority=1, is_active=True
    )
    c_openai = ProviderCredential(
        provider_id=p_openai.id, label="OpenAI Key", encrypted_api_key=enc.encrypt("k2"), key_preview="k2...", priority=2, is_active=True
    )
    db_session.add_all([c_groq, c_openai])
    await db_session.flush()

    db_session.add_all([
        CredentialHealth(credential_id=c_groq.id, status="healthy"),
        CredentialHealth(credential_id=c_openai.id, status="healthy"),
    ])

    alias = ModelAlias(alias_name="stream_test_alias", max_attempts=3, is_enabled=True)
    db_session.add(alias)
    await db_session.flush()

    db_session.add_all([
        ModelAliasCandidate(alias_id=alias.id, provider_id=p_groq.id, model_id=m_groq.id, priority=1),
        ModelAliasCandidate(alias_id=alias.id, provider_id=p_openai.id, model_id=m_openai.id, priority=2),
    ])
    await db_session.commit()

    req = ChatCompletionRequest(
        model="stream_test_alias",
        stream=True,
        messages=[ChatCompletionMessage(role="user", content="Stream ping")],
    )

    with (
        patch("app.providers.groq.adapter.GroqAdapter.stream_chat", side_effect=mock_failing_stream),
        patch("app.providers.openai.adapter.OpenAIAdapter.stream_chat", side_effect=mock_successful_stream),
    ):
        chunks = []
        async for sse_chunk in RoutingEngine.stream_chat(db=db_session, request=req):
            chunks.append(sse_chunk)

        # Output must be from OpenAI (Hello world!) terminating with [DONE]
        assert len(chunks) == 3
        assert "Hello " in chunks[0]
        assert "world!" in chunks[1]
        assert "data: [DONE]" in chunks[2]


@pytest.mark.asyncio
async def test_streaming_post_first_chunk_safe_termination(db_session: AsyncSession):
    """
    Test post-first-chunk guarantee:
    Once chunk 1 reaches the client, if failure occurs mid-generation,
    the gateway MUST NOT silently switch providers or duplicate output!
    It terminates the stream safely with an error chunk and [DONE].
    """
    enc = get_encryption_service()

    p_groq = Provider(name="groq", display_name="Groq", is_enabled=True)
    db_session.add(p_groq)
    await db_session.flush()

    m_groq = Model(provider_id=p_groq.id, model_identifier="llama-3.1-8b-instant", display_name="Llama")
    db_session.add(m_groq)
    await db_session.flush()

    c_groq = ProviderCredential(
        provider_id=p_groq.id, label="Groq Key", encrypted_api_key=enc.encrypt("k1"), key_preview="k1...", priority=1, is_active=True
    )
    db_session.add(c_groq)
    await db_session.flush()
    db_session.add(CredentialHealth(credential_id=c_groq.id, status="healthy"))
    await db_session.commit()

    req = ChatCompletionRequest(
        model="llama-3.1-8b-instant",
        stream=True,
        messages=[ChatCompletionMessage(role="user", content="Mid stream test")],
    )

    with patch("app.providers.groq.adapter.GroqAdapter.stream_chat", side_effect=mock_midstream_failing_stream):
        chunks = []
        async for sse_chunk in RoutingEngine.stream_chat(
            db=db_session, request=req, request_id="test-midstream-failure"
        ):
            chunks.append(sse_chunk)

        # Chunk 1: "Partial "
        # Chunk 2: Error JSON
        # Chunk 3: [DONE]
        assert len(chunks) == 3
        assert "Partial " in chunks[0]
        assert "STREAM_INTERRUPTED" in chunks[1]
        assert "data: [DONE]" in chunks[2]

    history = (
        await db_session.execute(
            select(RoutingHistory).where(
                RoutingHistory.request_id == "test-midstream-failure"
            )
        )
    ).scalars().all()
    assert len(history) == 1
    assert history[0].result == "failure"
    assert history[0].error_category == "unknown"
