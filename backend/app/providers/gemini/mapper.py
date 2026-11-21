import time
import uuid
from typing import Any, Dict, List, Optional
from app.providers.exceptions import SafetyBlockedError
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


def to_gemini_request(request: ChatCompletionRequest) -> Dict[str, Any]:
    """
    Translates an OpenAI-compatible ChatCompletionRequest into Gemini REST format.
    - Extracts 'system' messages into 'system_instruction'
    - Maps 'assistant' role to 'model'
    - Normalizes generation parameters
    """
    contents: List[Dict[str, Any]] = []
    system_parts: List[Dict[str, str]] = []

    for msg in request.messages:
        content_text = msg.content or ""
        if msg.role == "system":
            system_parts.append({"text": content_text})
        elif msg.role in ("assistant", "model"):
            contents.append({"role": "model", "parts": [{"text": content_text}]})
        else:  # "user", "function", "tool"
            contents.append({"role": "user", "parts": [{"text": content_text}]})

    # Gemini requires at least one user content item
    if not contents and system_parts:
        contents.append({"role": "user", "parts": [{"text": ""}]})

    payload: Dict[str, Any] = {"contents": contents}

    if system_parts:
        payload["system_instruction"] = {"parts": system_parts}

    gen_config: Dict[str, Any] = {}
    if request.temperature is not None:
        gen_config["temperature"] = request.temperature
    effective_max_tokens = request.get_effective_max_tokens()
    if effective_max_tokens is not None:
        gen_config["maxOutputTokens"] = effective_max_tokens
    if request.top_p is not None:
        gen_config["topP"] = request.top_p
    if request.stop is not None:
        if isinstance(request.stop, str):
            gen_config["stopSequences"] = [request.stop]
        elif isinstance(request.stop, list):
            gen_config["stopSequences"] = request.stop

    if gen_config:
        payload["generationConfig"] = gen_config

    return payload


def map_gemini_finish_reason(reason: Optional[str]) -> str:
    """Normalizes Gemini finishReason values to OpenAI standards."""
    if not reason:
        return "stop"
    reason = reason.upper()
    if reason in ("STOP", "FINISH_REASON_UNSPECIFIED"):
        return "stop"
    elif reason == "MAX_TOKENS":
        return "length"
    elif reason in ("SAFETY", "RECITATION", "BLOCKLIST", "PROHIBITED_CONTENT"):
        return "content_filter"
    return "stop"


def from_gemini_response(
    data: Dict[str, Any], model_id: str, completion_id: Optional[str] = None
) -> ChatCompletionResponse:
    """Translates Gemini generateContent response JSON into ChatCompletionResponse."""
    completion_id = completion_id or f"chatcmpl-{uuid.uuid4().hex[:12]}"
    candidates = data.get("candidates") or []

    if not candidates:
        # Check prompt feedback for blocks
        feedback = data.get("promptFeedback") or {}
        block_reason = feedback.get("blockReason")
        if block_reason:
            raise SafetyBlockedError(
                message=f"Prompt blocked by Gemini safety filters: {block_reason}",
                provider="gemini",
                details=feedback,
            )
        text_content = ""
        finish_reason = "stop"
    else:
        candidate = candidates[0]
        finish_reason = map_gemini_finish_reason(candidate.get("finishReason"))
        parts = candidate.get("content", {}).get("parts") or []
        text_content = "".join(p.get("text", "") for p in parts if "text" in p)

    # Extract usage
    usage_meta = data.get("usageMetadata") or {}
    prompt_tokens = usage_meta.get("promptTokenCount", 0)
    completion_tokens = usage_meta.get("candidatesTokenCount", 0)
    total_tokens = usage_meta.get("totalTokenCount", prompt_tokens + completion_tokens)

    usage = CompletionUsage(
        prompt_tokens=prompt_tokens,
        completion_tokens=completion_tokens,
        total_tokens=total_tokens,
    )

    return ChatCompletionResponse(
        id=completion_id,
        created=int(time.time()),
        model=model_id,
        choices=[
            ChatCompletionChoice(
                index=0,
                message=ChatCompletionChoiceMessage(role="assistant", content=text_content),
                finish_reason=finish_reason,
            )
        ],
        usage=usage,
    )


def from_gemini_chunk(
    chunk_data: Dict[str, Any],
    completion_id: str,
    model_id: str,
    index: int = 0,
) -> ChatCompletionChunk:
    """Translates a single Gemini SSE stream item into a ChatCompletionChunk."""
    candidates = chunk_data.get("candidates") or []
    content_delta = None
    finish_reason = None

    if candidates:
        candidate = candidates[0]
        finish_reason_raw = candidate.get("finishReason")
        if finish_reason_raw:
            finish_reason = map_gemini_finish_reason(finish_reason_raw)
        parts = candidate.get("content", {}).get("parts") or []
        texts = [p.get("text", "") for p in parts if "text" in p]
        if texts:
            content_delta = "".join(texts)

    # Usage in stream chunks (if present)
    usage = None
    usage_meta = chunk_data.get("usageMetadata")
    if usage_meta:
        usage = CompletionUsage(
            prompt_tokens=usage_meta.get("promptTokenCount", 0),
            completion_tokens=usage_meta.get("candidatesTokenCount", 0),
            total_tokens=usage_meta.get("totalTokenCount", 0),
        )

    return ChatCompletionChunk(
        id=completion_id,
        created=int(time.time()),
        model=model_id,
        choices=[
            ChatCompletionChunkChoice(
                index=index,
                delta=ChatCompletionChunkDelta(content=content_delta),
                finish_reason=finish_reason,
            )
        ],
        usage=usage,
    )
