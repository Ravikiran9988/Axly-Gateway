import logging
from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_gateway_key
from app.db.dependencies import get_db
from app.models.gateway_key import GatewayApiKey
from app.providers.schemas import ChatCompletionRequest, ChatCompletionResponse
from app.services.gateway_service import (
    execute_chat_completion,
    execute_stream_completion,
)

logger = logging.getLogger("axly.api.v1.chat")
router = APIRouter(tags=["Chat Completions"])


@router.post("/chat/completions", response_model=None)
async def create_chat_completion(
    request_body: ChatCompletionRequest,
    raw_request: Request,
    gateway_key: GatewayApiKey = Depends(get_current_gateway_key),
    db: AsyncSession = Depends(get_db),
):
    """
    OpenAI-compatible chat completions endpoint.
    Accepts standard chat completion payload and routes to the appropriate upstream provider.
    Supports both non-streaming responses and Server-Sent Events (SSE) streaming.
    """
    req_id = getattr(raw_request.state, "request_id", "-")
    client_ip = raw_request.client.host if raw_request.client else None

    if request_body.stream:
        stream_gen = execute_stream_completion(
            db=db,
            request=request_body,
            gateway_key=gateway_key,
            request_id=req_id,
            ip_address=client_ip,
        )
        return StreamingResponse(
            stream_gen,
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
                "X-Request-ID": req_id,
            },
        )

    # Non-streaming completion
    response: ChatCompletionResponse = await execute_chat_completion(
        db=db,
        request=request_body,
        gateway_key=gateway_key,
        request_id=req_id,
        ip_address=client_ip,
    )
    return response
