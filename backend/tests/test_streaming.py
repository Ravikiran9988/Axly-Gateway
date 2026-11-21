import json
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from unittest.mock import patch

from app.models.credential import ProviderCredential
from app.models.model import Model
from app.models.provider import Provider
from app.providers.schemas import (
    ChatCompletionChunk,
    ChatCompletionChunkChoice,
    ChatCompletionChunkDelta,
)
from app.services.encryption import get_encryption_service
from app.services.key_service import create_gateway_key


@pytest.mark.asyncio
async def test_streaming_sse_format(client: AsyncClient, db_session: AsyncSession):
    # Setup key and provider
    _, raw_gateway_key = await create_gateway_key(db_session, "Streaming Key")
    encryption_service = get_encryption_service()
    provider = Provider(name="groq", display_name="Groq", is_enabled=True)
    db_session.add(provider)
    await db_session.flush()

    cred = ProviderCredential(
        provider_id=provider.id,
        label="Groq Key",
        encrypted_api_key=encryption_service.encrypt("gsk-test"),
        key_preview="gsk-...test",
        is_active=True,
    )
    db_session.add(cred)
    model = Model(
        provider_id=provider.id,
        model_identifier="llama-3.1-8b-instant",
        display_name="Llama 3.1 8B",
        is_enabled=True,
    )
    db_session.add(model)
    await db_session.commit()

    async def mock_stream_chunks(*args, **kwargs):
        chunks = [
            ChatCompletionChunk(
                id="chatcmpl-stream-1",
                model="llama-3.1-8b-instant",
                choices=[ChatCompletionChunkChoice(index=0, delta=ChatCompletionChunkDelta(role="assistant", content="Streaming "))],
            ),
            ChatCompletionChunk(
                id="chatcmpl-stream-1",
                model="llama-3.1-8b-instant",
                choices=[ChatCompletionChunkChoice(index=0, delta=ChatCompletionChunkDelta(content="response "))],
            ),
            ChatCompletionChunk(
                id="chatcmpl-stream-1",
                model="llama-3.1-8b-instant",
                choices=[ChatCompletionChunkChoice(index=0, delta=ChatCompletionChunkDelta(content="completed."), finish_reason="stop")],
            ),
        ]
        for c in chunks:
            yield c

    with patch("app.providers.groq.adapter.GroqAdapter.stream_chat", side_effect=mock_stream_chunks):
        resp = await client.post(
            "/v1/chat/completions",
            json={
                "model": "llama-3.1-8b-instant",
                "messages": [{"role": "user", "content": "Stream me"}],
                "stream": True,
            },
            headers={"Authorization": f"Bearer {raw_gateway_key}"},
        )

        assert resp.status_code == 200
        assert "text/event-stream" in resp.headers["content-type"]

        body_text = resp.text
        lines = [line.strip() for line in body_text.splitlines() if line.strip()]

        # Verify SSE data lines
        data_lines = [l for l in lines if l.startswith("data:")]
        assert len(data_lines) == 4  # 3 chunks + 1 [DONE]

        # Verify last line is [DONE]
        assert data_lines[-1] == "data: [DONE]"

        # Parse first chunk JSON
        first_chunk_json = json.loads(data_lines[0][5:].strip())
        assert first_chunk_json["object"] == "chat.completion.chunk"
        assert first_chunk_json["choices"][0]["delta"]["content"] == "Streaming "
