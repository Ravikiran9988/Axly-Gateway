from typing import Any, Dict, Optional


class ProviderError(Exception):
    """Base exception for all upstream provider failures."""

    def __init__(
        self,
        message: str,
        provider: str = "unknown",
        status_code: int = 500,
        error_type: str = "provider_error",
        code: Optional[str] = None,
        details: Optional[Dict[str, Any]] = None,
    ):
        self.message = message
        self.provider = provider
        self.status_code = status_code
        self.error_type = error_type
        self.code = code or f"{provider.upper()}_ERROR"
        self.details = details or {}
        super().__init__(f"[{provider}] {message}")


class AuthenticationError(ProviderError):
    """Raised when upstream credentials are invalid, revoked, or rejected."""

    def __init__(self, message: str, provider: str, details: Optional[Dict[str, Any]] = None):
        super().__init__(
            message=message,
            provider=provider,
            status_code=401,
            error_type="authentication_error",
            code="AUTHENTICATION_FAILED",
            details=details,
        )


class PermissionError(ProviderError):
    """Raised when account lacks required permissions or scopes."""

    def __init__(self, message: str, provider: str, details: Optional[Dict[str, Any]] = None):
        super().__init__(
            message=message,
            provider=provider,
            status_code=403,
            error_type="permission_error",
            code="PERMISSION_DENIED",
            details=details,
        )


class RateLimitError(ProviderError):
    """Raised when upstream rate limit (RPM/TPM) is exceeded."""

    def __init__(self, message: str, provider: str, details: Optional[Dict[str, Any]] = None):
        super().__init__(
            message=message,
            provider=provider,
            status_code=429,
            error_type="rate_limit_error",
            code="RATE_LIMIT_EXCEEDED",
            details=details,
        )


class QuotaExceededError(ProviderError):
    """Raised when upstream account billing quota or token allowance is exhausted."""

    def __init__(self, message: str, provider: str, details: Optional[Dict[str, Any]] = None):
        super().__init__(
            message=message,
            provider=provider,
            status_code=429,
            error_type="quota_exceeded_error",
            code="QUOTA_EXHAUSTED",
            details=details,
        )


class ModelNotFoundError(ProviderError):
    """Raised when the requested model is not found or unsupported by the provider."""

    def __init__(self, message: str, provider: str, details: Optional[Dict[str, Any]] = None):
        super().__init__(
            message=message,
            provider=provider,
            status_code=404,
            error_type="model_not_found_error",
            code="MODEL_NOT_FOUND",
            details=details,
        )


class ProviderUnavailableError(ProviderError):
    """Raised when upstream provider experiences outages or 503s."""

    def __init__(self, message: str, provider: str, details: Optional[Dict[str, Any]] = None):
        super().__init__(
            message=message,
            provider=provider,
            status_code=503,
            error_type="service_unavailable_error",
            code="PROVIDER_UNAVAILABLE",
            details=details,
        )


class UpstreamTimeoutError(ProviderError):
    """Raised when an upstream request times out."""

    def __init__(self, message: str, provider: str, details: Optional[Dict[str, Any]] = None):
        super().__init__(
            message=message,
            provider=provider,
            status_code=504,
            error_type="upstream_timeout_error",
            code="UPSTREAM_TIMEOUT",
            details=details,
        )


class UpstreamNetworkError(ProviderError):
    """Raised when connection drops or DNS fails."""

    def __init__(self, message: str, provider: str, details: Optional[Dict[str, Any]] = None):
        super().__init__(
            message=message,
            provider=provider,
            status_code=502,
            error_type="upstream_network_error",
            code="NETWORK_ERROR",
            details=details,
        )


class SafetyBlockedError(ProviderError):
    """Raised when content is blocked by provider safety/moderation filters."""

    def __init__(self, message: str, provider: str, details: Optional[Dict[str, Any]] = None):
        super().__init__(
            message=message,
            provider=provider,
            status_code=400,
            error_type="safety_blocked_error",
            code="SAFETY_BLOCKED",
            details=details,
        )


class InvalidRequestError(ProviderError):
    """Raised when request parameters are rejected by the upstream provider."""

    def __init__(self, message: str, provider: str, details: Optional[Dict[str, Any]] = None):
        super().__init__(
            message=message,
            provider=provider,
            status_code=400,
            error_type="invalid_request_error",
            code="INVALID_REQUEST",
            details=details,
        )
