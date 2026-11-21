import contextvars
import uuid
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

# Context variable to hold the current request ID across async tasks
request_id_ctx: contextvars.ContextVar[str] = contextvars.ContextVar("request_id", default="-")


class RequestIdMiddleware(BaseHTTPMiddleware):
    """
    Middleware that assigns a unique request ID (UUID4) to each incoming HTTP request,
    sets it on contextvars for logger usage, and attaches 'X-Request-ID' to response headers.
    """

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        incoming_id = request.headers.get("X-Request-ID")
        if incoming_id and len(incoming_id) <= 64:
            req_id = incoming_id.strip()
        else:
            req_id = str(uuid.uuid4())

        token = request_id_ctx.set(req_id)
        request.state.request_id = req_id

        try:
            response = await call_next(request)
            response.headers["X-Request-ID"] = req_id
            return response
        finally:
            request_id_ctx.reset(token)
