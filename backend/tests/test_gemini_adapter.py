import json
import pytest
from unittest.mock import AsyncMock, patch
import httpx

from app.providers.gemini.adapter import GeminiAdapter
from app.providers.gemini.mapper import (
    from_gemini_chunk,
    from_gemini_response,
    map_gemini_finish_reason,
    to_gemini_request,
)
from app.providers.exceptions import (
    AuthenticationError,
    InvalidRequestError,
    ModelNotFoundError,
    QuotaExceededError,
    RateLimitError,
    SafetyBlockedError,
)
from app.providers.schemas import (
    ChatCompletionMessage,
    ChatCompletionRequest,
)


def test_gemini_request_mapping():
    req = ChatCompletionRequest(
        model="gemini-1.5-flash",
        messages=[
            ChatCompletionMessage(role="system", content="You are a helpful coding assistant."),
            ChatCompletionMessage(role="user", content="Write a quicksort function."),
            ChatCompletionMessage(role="assistant", content="def quicksort(arr): ..."),
            ChatCompletionMessage(role="user", content="Now optimize it."),
        ],
        temperature=0.7,
        max_tokens=1500,
        top_p=0.9,
        stop=["END", "STOP"],
    )

    gemini_payload = to_gemini_request(req)

    # Verify system instruction extraction
    assert "system_instruction" in gemini_payload
    assert gemini_payload["system_instruction"]["parts"][0]["text"] == "You are a helpful coding assistant."

    # Verify conversation roles
    contents = gemini_payload["contents"]
    assert len(contents) == 3
    assert contents[0]["role"] == "user"
    assert contents[0]["parts"][0]["text"] == "Write a quicksort function."
    assert contents[1]["role"] == "model"
    assert contents[1]["parts"][0]["text"] == "def quicksort(arr): ..."
    assert contents[2]["role"] == "user"
    assert contents[2]["parts"][0]["text"] == "Now optimize it."

    # Verify generation parameters
    config = gemini_payload["generationConfig"]
    assert config["temperature"] == 0.7
    assert config["maxOutputTokens"] == 1500
    assert config["topP"] == 0.9
    assert config["stopSequences"] == ["END", "STOP"]


def test_gemini_finish_reason_mapping():
    assert map_gemini_finish_reason("STOP") == "stop"
    assert map_gemini_finish_reason("MAX_TOKENS") == "length"
    assert map_gemini_finish_reason("SAFETY") == "content_filter"
    assert map_gemini_finish_reason("RECITATION") == "content_filter"
    assert map_gemini_finish_reason(None) == "stop"


def test_gemini_response_mapping():
    raw_response = {
        "candidates": [
            {
                "content": {
                    "parts": [{"text": "Hello, how can I assist you with Python today?"}],
                    "role": "model",
                },
                "finishReason": "STOP",
                "index": 0,
            }
        ],
        "usageMetadata": {
            "promptTokenCount": 12,
            "candidatesTokenCount": 24,
            "totalTokenCount": 36,
        },
    }

    resp = from_gemini_response(raw_response, model_id="gemini-1.5-pro")

    assert resp.model == "gemini-1.5-pro"
    assert len(resp.choices) == 1
    assert resp.choices[0].message.content == "Hello, how can I assist you with Python today?"
    assert resp.choices[0].finish_reason == "stop"
    assert resp.usage.prompt_tokens == 12
    assert resp.usage.completion_tokens == 24
    assert resp.usage.total_tokens == 36


def test_gemini_chunk_mapping():
    raw_chunk = {
        "candidates": [
            {
                "content": {
                    "parts": [{"text": "Hello world"}],
                    "role": "model",
                },
                "finishReason": "STOP",
            }
        ]
    }

    chunk = from_gemini_chunk(raw_chunk, completion_id="test-id", model_id="gemini-1.5-flash")
    assert chunk.id == "test-id"
    assert chunk.choices[0].delta.content == "Hello world"
    assert chunk.choices[0].finish_reason == "stop"


@pytest.mark.asyncio
async def test_gemini_complete_chat_mock():
    adapter = GeminiAdapter()
    req = ChatCompletionRequest(
        model="gemini-1.5-flash",
        messages=[ChatCompletionMessage(role="user", content="Ping")],
    )

    mock_gemini_response = {
        "candidates": [
            {
                "content": {"parts": [{"text": "Pong"}]},
                "finishReason": "STOP",
            }
        ],
        "usageMetadata": {"promptTokenCount": 5, "candidatesTokenCount": 5, "totalTokenCount": 10},
    }

    def mock_handler(request: httpx.Request):
        return httpx.Response(200, json=mock_gemini_response)

    transport = httpx.MockTransport(mock_handler)
    real_client = httpx.AsyncClient(transport=transport)
    with patch("httpx.AsyncClient", return_value=real_client):
        resp = await adapter.complete_chat(req, api_key="test-gemini-key")
        assert resp.choices[0].message.content == "Pong"
        assert resp.usage.total_tokens == 10


def test_gemini_error_handling():
    adapter = GeminiAdapter()

    # Test 401
    resp_401 = httpx.Response(401, json={"error": {"message": "API_KEY_INVALID"}})
    with pytest.raises(AuthenticationError):
        adapter._handle_http_error(resp_401)

    # Test 429 quota
    resp_429 = httpx.Response(429, json={"error": {"message": "Quota exceeded", "status": "RESOURCE_EXHAUSTED"}})
    with pytest.raises(QuotaExceededError):
        adapter._handle_http_error(resp_429)

    # Test 404
    resp_404 = httpx.Response(404, json={"error": {"message": "models/non-existent-model not found"}})
    with pytest.raises(ModelNotFoundError):
        adapter._handle_http_error(resp_404)
