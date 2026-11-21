import pytest
from unittest.mock import patch
import httpx

from app.providers.groq.adapter import GroqAdapter
from app.providers.groq.mapper import from_groq_chunk, from_groq_response, to_groq_request
from app.providers.exceptions import (
    AuthenticationError,
    InvalidRequestError,
    ModelNotFoundError,
    QuotaExceededError,
    RateLimitError,
)
from app.providers.schemas import (
    ChatCompletionMessage,
    ChatCompletionRequest,
)


def test_groq_request_mapping():
    req = ChatCompletionRequest(
        model="groq/llama-3.1-70b-versatile",
        messages=[
            ChatCompletionMessage(role="system", content="System instruction"),
            ChatCompletionMessage(role="user", content="Hello"),
        ],
        temperature=0.5,
        max_tokens=800,
        stream=False,
    )

    groq_payload = to_groq_request(req)
    assert groq_payload["model"] == "llama-3.1-70b-versatile"
    assert len(groq_payload["messages"]) == 2
    assert groq_payload["temperature"] == 0.5
    assert groq_payload["max_tokens"] == 800
    assert groq_payload["stream"] is False


def test_groq_response_mapping():
    raw_response = {
        "id": "chatcmpl-groq-12345",
        "created": 1700000000,
        "choices": [
            {
                "index": 0,
                "message": {"role": "assistant", "content": "Groq fast response"},
                "finish_reason": "stop",
            }
        ],
        "usage": {"prompt_tokens": 8, "completion_tokens": 16, "total_tokens": 24},
    }

    resp = from_groq_response(raw_response, requested_model="llama-3.1-8b-instant")
    assert resp.id == "chatcmpl-groq-12345"
    assert resp.model == "llama-3.1-8b-instant"
    assert resp.choices[0].message.content == "Groq fast response"
    assert resp.usage.total_tokens == 24


def test_groq_chunk_mapping():
    raw_chunk = {
        "id": "chatcmpl-chunk-123",
        "created": 1700000000,
        "choices": [
            {
                "index": 0,
                "delta": {"content": "Fast stream chunk"},
                "finish_reason": None,
            }
        ],
    }

    chunk = from_groq_chunk(raw_chunk, requested_model="llama-3.1-70b")
    assert chunk.choices[0].delta.content == "Fast stream chunk"
    assert chunk.choices[0].finish_reason is None


@pytest.mark.asyncio
async def test_groq_complete_chat_mock():
    adapter = GroqAdapter()
    req = ChatCompletionRequest(
        model="llama-3.1-8b-instant",
        messages=[ChatCompletionMessage(role="user", content="Hi")],
    )

    mock_resp = {
        "id": "chatcmpl-groq-test",
        "created": 1700000000,
        "choices": [{"index": 0, "message": {"role": "assistant", "content": "Hello!"}, "finish_reason": "stop"}],
        "usage": {"prompt_tokens": 4, "completion_tokens": 2, "total_tokens": 6},
    }

    def mock_handler(request: httpx.Request):
        return httpx.Response(200, json=mock_resp)

    transport = httpx.MockTransport(mock_handler)
    real_client = httpx.AsyncClient(transport=transport)
    with patch("httpx.AsyncClient", return_value=real_client):
        resp = await adapter.complete_chat(req, api_key="gsk_test_key")
        assert resp.choices[0].message.content == "Hello!"
        assert resp.usage.total_tokens == 6


def test_groq_error_handling():
    adapter = GroqAdapter()

    resp_401 = httpx.Response(401, json={"error": {"message": "Invalid API Key", "code": "invalid_api_key"}})
    with pytest.raises(AuthenticationError):
        adapter._handle_http_error(resp_401)

    resp_429 = httpx.Response(429, json={"error": {"message": "Rate limit reached", "code": "rate_limit_exceeded"}})
    with pytest.raises(RateLimitError):
        adapter._handle_http_error(resp_429)

    resp_quota = httpx.Response(429, json={"error": {"message": "Insufficient quota", "code": "insufficient_quota"}})
    with pytest.raises(QuotaExceededError):
        adapter._handle_http_error(resp_quota)
