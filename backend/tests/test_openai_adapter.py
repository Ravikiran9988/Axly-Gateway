import pytest
from unittest.mock import patch
import httpx

from app.providers.openai.adapter import OpenAIAdapter
from app.providers.openai.mapper import from_openai_chunk, from_openai_response, to_openai_request
from app.providers.exceptions import (
    AuthenticationError,
    ModelNotFoundError,
    QuotaExceededError,
    RateLimitError,
)
from app.providers.schemas import (
    ChatCompletionMessage,
    ChatCompletionRequest,
)


def test_openai_request_mapping():
    req = ChatCompletionRequest(
        model="openai/gpt-4o",
        messages=[
            ChatCompletionMessage(role="system", content="System instruction"),
            ChatCompletionMessage(role="user", content="Hello OpenAI"),
        ],
        temperature=0.8,
        max_tokens=1000,
        stream=True,
    )

    openai_payload = to_openai_request(req)
    assert openai_payload["model"] == "gpt-4o"
    assert len(openai_payload["messages"]) == 2
    assert openai_payload["temperature"] == 0.8
    assert openai_payload["max_tokens"] == 1000
    assert openai_payload["stream"] is True
    assert openai_payload["stream_options"] == {"include_usage": True}


def test_openai_o1_max_completion_tokens():
    req = ChatCompletionRequest(
        model="o1-mini",
        messages=[ChatCompletionMessage(role="user", content="Reason through this")],
        max_tokens=2000,
    )
    openai_payload = to_openai_request(req)
    assert "max_completion_tokens" in openai_payload
    assert openai_payload["max_completion_tokens"] == 2000


def test_openai_response_mapping():
    raw_response = {
        "id": "chatcmpl-openai-999",
        "created": 1700000000,
        "choices": [
            {
                "index": 0,
                "message": {"role": "assistant", "content": "OpenAI answer"},
                "finish_reason": "stop",
            }
        ],
        "usage": {"prompt_tokens": 10, "completion_tokens": 15, "total_tokens": 25},
    }

    resp = from_openai_response(raw_response, requested_model="gpt-4o")
    assert resp.id == "chatcmpl-openai-999"
    assert resp.model == "gpt-4o"
    assert resp.choices[0].message.content == "OpenAI answer"
    assert resp.usage.total_tokens == 25


def test_openai_chunk_mapping():
    raw_chunk = {
        "id": "chatcmpl-openai-chunk",
        "created": 1700000000,
        "choices": [
            {
                "index": 0,
                "delta": {"content": " streaming"},
                "finish_reason": None,
            }
        ],
    }

    chunk = from_openai_chunk(raw_chunk, requested_model="gpt-4o-mini")
    assert chunk.choices[0].delta.content == " streaming"


@pytest.mark.asyncio
async def test_openai_complete_chat_mock():
    adapter = OpenAIAdapter()
    req = ChatCompletionRequest(
        model="gpt-4o-mini",
        messages=[ChatCompletionMessage(role="user", content="Test")],
    )

    mock_resp = {
        "id": "chatcmpl-test",
        "created": 1700000000,
        "choices": [{"index": 0, "message": {"role": "assistant", "content": "Success"}, "finish_reason": "stop"}],
        "usage": {"prompt_tokens": 5, "completion_tokens": 5, "total_tokens": 10},
    }

    def mock_handler(request: httpx.Request):
        return httpx.Response(200, json=mock_resp)

    transport = httpx.MockTransport(mock_handler)
    real_client = httpx.AsyncClient(transport=transport)
    with patch("httpx.AsyncClient", return_value=real_client):
        resp = await adapter.complete_chat(req, api_key="sk-test-key")
        assert resp.choices[0].message.content == "Success"
        assert resp.usage.total_tokens == 10


def test_openai_error_handling():
    adapter = OpenAIAdapter()

    resp_401 = httpx.Response(401, json={"error": {"message": "Incorrect API key", "code": "invalid_api_key"}})
    with pytest.raises(AuthenticationError):
        adapter._handle_http_error(resp_401)

    resp_quota = httpx.Response(429, json={"error": {"message": "You exceeded your current quota", "code": "insufficient_quota"}})
    with pytest.raises(QuotaExceededError):
        adapter._handle_http_error(resp_quota)
