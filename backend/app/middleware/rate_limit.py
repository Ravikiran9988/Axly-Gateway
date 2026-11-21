import time
from collections import defaultdict
from typing import Dict, List
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import JSONResponse

from app.core.config import get_settings


class SlidingWindowRateLimiter:
    """In-memory sliding window rate limiter per client IP or key."""

    def __init__(self):
        self._history: Dict[str, List[float]] = defaultdict(list)

    def is_allowed(self, client_id: str, max_requests: int, window_seconds: int = 60) -> tuple[bool, int]:
        now = time.time()
        cutoff = now - window_seconds
        # Clean older requests outside the current window
        self._history[client_id] = [t for t in self._history[client_id] if t > cutoff]

        if len(self._history[client_id]) >= max_requests:
            oldest = self._history[client_id][0]
            retry_after = max(1, int(oldest + window_seconds - now))
            return False, retry_after

        self._history[client_id].append(now)
        return True, 0


_limiter = SlidingWindowRateLimiter()


class RateLimitMiddleware(BaseHTTPMiddleware):
    """
    Applies default rate limiting across unauthenticated API endpoints.
    Can be bypassed or overridden for specific internal health endpoints.
    """

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint):
        path = request.url.path
        # Exclude internal health and ready checks from rate limiting
        if path in ("/health", "/ready", "/docs", "/redoc", "/openapi.json"):
            return await call_next(request)

        settings = get_settings()
        client_ip = request.client.host if request.client else "unknown"
        allowed, retry_after = _limiter.is_allowed(
            client_ip,
            max_requests=settings.RATE_LIMIT_DEFAULT_RPM * 2,  # Burst ceiling
            window_seconds=60,
        )

        if not allowed:
            return JSONResponse(
                status_code=429,
                headers={"Retry-After": str(retry_after)},
                content={
                    "success": False,
                    "error": {
                        "code": "RATE_LIMIT_EXCEEDED",
                        "message": f"Rate limit exceeded. Try again in {retry_after} seconds.",
                    },
                },
            )

        return await call_next(request)
