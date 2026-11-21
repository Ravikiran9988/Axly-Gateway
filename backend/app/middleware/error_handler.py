import logging
from typing import Union
from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.config import get_settings
from app.providers.exceptions import ProviderError

logger = logging.getLogger("axly.errors")


class APIException(Exception):
    """Base application exception for standardized JSON error responses."""

    def __init__(
        self,
        message: str,
        code: str = "BAD_REQUEST",
        status_code: int = status.HTTP_400_BAD_REQUEST,
        details: Union[dict, list, None] = None,
    ):
        self.message = message
        self.code = code
        self.status_code = status_code
        self.details = details
        super().__init__(message)


def register_exception_handlers(app: FastAPI) -> None:
    """Registers global exception handlers to return consistent, secure JSON errors."""

    @app.exception_handler(ProviderError)
    async def handle_provider_exception(request: Request, exc: ProviderError):
        """Returns standard OpenAI-compatible error format for upstream provider errors."""
        req_id = getattr(request.state, "request_id", "-")
        return JSONResponse(
            status_code=exc.status_code,
            headers={"X-Request-ID": req_id},
            content={
                "error": {
                    "message": exc.message,
                    "type": exc.error_type,
                    "param": None,
                    "code": exc.code,
                }
            },
        )

    @app.exception_handler(APIException)
    async def handle_api_exception(request: Request, exc: APIException):
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "success": False,
                "error": {
                    "code": exc.code,
                    "message": exc.message,
                    "details": exc.details,
                },
            },
        )

    @app.exception_handler(StarletteHTTPException)
    async def handle_http_exception(request: Request, exc: StarletteHTTPException):
        code_map = {
            400: "BAD_REQUEST",
            401: "UNAUTHORIZED",
            403: "FORBIDDEN",
            404: "NOT_FOUND",
            405: "METHOD_NOT_ALLOWED",
            429: "TOO_MANY_REQUESTS",
            500: "INTERNAL_SERVER_ERROR",
            503: "SERVICE_UNAVAILABLE",
        }
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "success": False,
                "error": {
                    "code": code_map.get(exc.status_code, "HTTP_ERROR"),
                    "message": exc.detail or "An HTTP error occurred",
                },
            },
        )

    @app.exception_handler(RequestValidationError)
    async def handle_validation_error(request: Request, exc: RequestValidationError):
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content={
                "success": False,
                "error": {
                    "code": "VALIDATION_ERROR",
                    "message": "Input validation failed",
                    "details": exc.errors(),
                },
            },
        )

    @app.exception_handler(Exception)
    async def handle_unexpected_exception(request: Request, exc: Exception):
        settings = get_settings()
        req_id = getattr(request.state, "request_id", "-")
        logger.error(f"Unhandled server error [req_id:{req_id}]: {exc}", exc_info=True)

        message = (
            f"An unexpected internal error occurred: {str(exc)}"
            if settings.DEBUG
            else "An unexpected internal server error occurred. Please contact support with your Request ID."
        )

        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={
                "success": False,
                "error": {
                    "code": "INTERNAL_SERVER_ERROR",
                    "message": message,
                    "request_id": req_id,
                },
            },
        )
