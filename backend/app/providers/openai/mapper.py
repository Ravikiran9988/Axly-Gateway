from typing import Any, Dict
from app.providers.schemas import (
    ChatCompletionChoice,
    ChatCompletionChoiceMessage,
    ChatCompletionChunk,
    ChatCompletionChunkChoice,
    ChatCompletionChunkDelta,
    ChatCompletionRequest,
    ChatCompletionResponse,
    CompletionUsage,
)


def to_openai_request(request: ChatCompletionRequest) -> Dict[str, Any]:
    """Prepares payload for OpenAI chat completions."""
    clean_model = request.model.replace("openai/", "")
    payload: Dict[str, Any] = {
        "model": clean_model,
        "messages": [m.model_dump(exclude_none=True) for m in request.messages],
        "stream": request.stream,
    }

    if request.stream:
        payload["stream_options"] = {"include_usage": True}

    if request.temperature is not None:
        payload["temperature"] = request.temperature

    effective_max_tokens = request.get_effective_max_tokens()
    if effective_max_tokens is not None:
        if clean_model.startswith("o1") or clean_model.startswith("o3"):
            payload["max_completion_tokens"] = effective_max_tokens
        else:
            payload["max_tokens"] = effective_max_tokens

    if request.top_p is not None:
        payload["top_p"] = request.top_p
    if request.frequency_penalty is not None:
        payload["frequency_penalty"] = request.frequency_penalty
    if request.presence_penalty is not None:
        payload["presence_penalty"] = request.presence_penalty
    if request.stop is not None:
        payload["stop"] = request.stop
    if request.response_format is not None:
        payload["response_format"] = request.response_format
    if request.user is not None:
        payload["user"] = request.user

    return payload


def from_openai_response(data: Dict[str, Any], requested_model: str) -> ChatCompletionResponse:
    """Normalizes OpenAI completion response."""
    choices = []
    for c in data.get("choices", []):
        msg_dict = c.get("message", {})
        choices.append(
            ChatCompletionChoice(
                index=c.get("index", 0),
                message=ChatCompletionChoiceMessage(
                    role=msg_dict.get("role", "assistant"),
                    content=msg_dict.get("content", ""),
                ),
                finish_reason=c.get("finish_reason", "stop"),
            )
        )

    usage = None
    if "usage" in data and data["usage"]:
        usage = CompletionUsage(
            prompt_tokens=data["usage"].get("prompt_tokens", 0),
            completion_tokens=data["usage"].get("completion_tokens", 0),
            total_tokens=data["usage"].get("total_tokens", 0),
        )

    return ChatCompletionResponse(
        id=data.get("id", f"chatcmpl-{requested_model}"),
        created=data.get("created", 0),
        model=requested_model,
        choices=choices,
        usage=usage,
    )


def from_openai_chunk(data: Dict[str, Any], requested_model: str) -> ChatCompletionChunk:
    """Normalizes OpenAI SSE stream chunk."""
    choices = []
    for c in data.get("choices", []):
        delta = c.get("delta", {})
        choices.append(
            ChatCompletionChunkChoice(
                index=c.get("index", 0),
                delta=ChatCompletionChunkDelta(
                    role=delta.get("role"),
                    content=delta.get("content"),
                ),
                finish_reason=c.get("finish_reason"),
            )
        )

    usage = None
    if "usage" in data and data["usage"]:
        usage = CompletionUsage(
            prompt_tokens=data["usage"].get("prompt_tokens", 0),
            completion_tokens=data["usage"].get("completion_tokens", 0),
            total_tokens=data["usage"].get("total_tokens", 0),
        )

    return ChatCompletionChunk(
        id=data.get("id", "chatcmpl-openai-chunk"),
        created=data.get("created", 0),
        model=requested_model,
        choices=choices,
        usage=usage,
    )
