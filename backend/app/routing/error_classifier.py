import logging
import re
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from typing import Any, Dict, Optional
import httpx

from app.providers.exceptions import (
    AuthenticationError,
    InvalidRequestError,
    ModelNotFoundError,
    PermissionError,
    ProviderError,
    ProviderUnavailableError,
    QuotaExceededError,
    RateLimitError,
    SafetyBlockedError,
    UpstreamNetworkError,
    UpstreamTimeoutError,
)
from app.routing.policies import CooldownPolicy
from app.routing.schemas import ErrorCategory, ErrorClassification, QuotaScope

logger = logging.getLogger("axly.routing.classifier")


class ErrorClassifier:
    """
    Centralized classifier for upstream provider failures and normalized exceptions.
    Interprets HTTP status codes, error details, and error messages to decide:
      - Normalized error category
      - Whether the error is safe to retry with another candidate
      - What quota/cooldown scope to apply (credential, project, organization, provider)
      - The cooldown duration (respecting Retry-After where available)
    """

    @classmethod
    def classify(
        cls,
        exc: Exception,
        provider_name: str = "unknown",
        consecutive_cooldowns: int = 0,
    ) -> ErrorClassification:
        """Classifies an arbitrary exception or ProviderError into structured routing metadata."""
        # 1. Extract status code, message, and details
        status_code = 500
        message = str(exc)
        details: Dict[str, Any] = {}
        headers: Dict[str, str] = {}

        if isinstance(exc, ProviderError):
            status_code = exc.status_code
            message = exc.message
            details = exc.details or {}
            headers = details.get("headers", {})
        elif isinstance(exc, httpx.HTTPStatusError):
            status_code = exc.response.status_code
            message = str(exc)
            headers = dict(exc.response.headers)
            try:
                details = exc.response.json()
            except Exception:
                details = {"raw_text": exc.response.text}
        elif isinstance(exc, (httpx.TimeoutException, TimeoutError)):
            return cls._classify_timeout(message, consecutive_cooldowns)
        elif isinstance(exc, (httpx.NetworkError, httpx.ConnectError)):
            return cls._classify_network_error(message, consecutive_cooldowns)

        # 2. Parse Retry-After header if present
        retry_after_seconds = cls._extract_retry_after(headers, details, message)

        # 3. Categorize based on status code and error types
        if isinstance(exc, AuthenticationError) or status_code == 401:
            return ErrorClassification(
                category=ErrorCategory.AUTHENTICATION,
                is_retryable=False,  # Unsafe to retry same credential, but failover to another credential allowed
                scope=QuotaScope.CREDENTIAL,
                status_code=401,
                reason="Authentication failure: API key rejected or revoked",
                confidence="certain",
                cooldown_seconds=0.0,  # Auth failure requires permanent credential disable until fresh test
                details=details,
            )

        if isinstance(exc, PermissionError) or status_code == 403:
            # Check if this 403 is actually a quota restriction (e.g. Google Cloud quota exceeded on 403)
            if cls._has_explicit_quota_signal(message, details):
                return cls._classify_quota_or_rate_limit(
                    message, details, retry_after_seconds, consecutive_cooldowns, status_code=403
                )
            return ErrorClassification(
                category=ErrorCategory.PERMISSION,
                is_retryable=False,
                scope=QuotaScope.CREDENTIAL,
                status_code=403,
                reason="Permission denied or account lacks required scope",
                confidence="certain",
                cooldown_seconds=0.0,
                details=details,
            )

        if isinstance(exc, SafetyBlockedError):
            return ErrorClassification(
                category=ErrorCategory.SAFETY_BLOCKED,
                is_retryable=False,
                scope=QuotaScope.CREDENTIAL,
                status_code=400,
                reason="Request blocked by upstream content safety/moderation filter",
                confidence="certain",
                details=details,
            )

        if isinstance(exc, InvalidRequestError) or status_code in (400, 422):
            return ErrorClassification(
                category=ErrorCategory.BAD_REQUEST,
                is_retryable=False,
                scope=QuotaScope.CREDENTIAL,
                status_code=status_code,
                reason="Invalid request parameters rejected by provider",
                confidence="certain",
                details=details,
            )

        if isinstance(exc, ModelNotFoundError) or status_code == 404:
            return ErrorClassification(
                category=ErrorCategory.MODEL_NOT_FOUND,
                is_retryable=False,  # Unsafe for this model, but safe for next fallback candidate
                scope=QuotaScope.MODEL_FAMILY,
                status_code=404,
                reason="Model not supported or not found on provider",
                confidence="certain",
                details=details,
            )

        if isinstance(exc, (RateLimitError, QuotaExceededError)) or status_code == 429:
            return cls._classify_quota_or_rate_limit(
                message, details, retry_after_seconds, consecutive_cooldowns, status_code=429
            )

        if status_code in (408, 504) or isinstance(exc, UpstreamTimeoutError):
            return cls._classify_timeout(
                message, consecutive_cooldowns, status_code, retry_after_seconds
            )

        if isinstance(exc, UpstreamNetworkError):
            return cls._classify_network_error(message, consecutive_cooldowns)

        if status_code in (500, 502, 503) or isinstance(exc, ProviderUnavailableError):
            cooldown = CooldownPolicy.calculate_cooldown(
                ErrorCategory.SERVICE_UNAVAILABLE, consecutive_cooldowns, retry_after_seconds
            )
            return ErrorClassification(
                category=ErrorCategory.SERVICE_UNAVAILABLE,
                is_retryable=True,
                scope=QuotaScope.PROVIDER,
                retry_after_seconds=retry_after_seconds,
                cooldown_seconds=cooldown,
                status_code=status_code,
                reason="Upstream provider temporary outage or server failure",
                confidence="certain",
                details=details,
            )

        # Fallback for unexpected errors
        cooldown = CooldownPolicy.calculate_cooldown(
            ErrorCategory.UNKNOWN, consecutive_cooldowns, retry_after_seconds
        )
        return ErrorClassification(
            category=ErrorCategory.UNKNOWN,
            is_retryable=True,
            scope=QuotaScope.CREDENTIAL,
            retry_after_seconds=retry_after_seconds,
            cooldown_seconds=cooldown,
            status_code=status_code,
            reason=f"Unclassified provider error: {message[:120]}",
            confidence="uncertain",
            details=details,
        )

    @classmethod
    def _has_explicit_quota_signal(cls, message: str, details: Dict[str, Any]) -> bool:
        """Recognize explicit quota/rate-limit codes and phrases, not incidental substrings."""
        phrase_pattern = re.compile(
            r"\b(rate[\s_-]+limit|quota[\s_-]+exceeded|insufficient[\s_-]+quota|"
            r"resource[\s_-]+exhausted|daily[\s_-]+quota|billing[\s_-]+hard[\s_-]+limit)\b",
            re.IGNORECASE,
        )
        if phrase_pattern.search(message or ""):
            return True

        accepted_codes = {
            "rate_limit", "rate_limit_exceeded", "quota_exceeded",
            "insufficient_quota", "resource_exhausted",
            "daily_quota_exceeded", "billing_hard_limit_reached",
        }

        def inspect(value: Any, key: str = "") -> bool:
            if isinstance(value, dict):
                for child_key, child_value in value.items():
                    if inspect(child_value, str(child_key).lower()):
                        return True
            elif isinstance(value, (list, tuple)):
                return any(inspect(item, key) for item in value)
            elif key in {"code", "type", "reason", "error_type", "status"}:
                normalized = str(value).strip().lower().replace("-", "_").replace(" ", "_")
                return normalized in accepted_codes
            return False

        return inspect(details or {})

    @classmethod
    def _classify_quota_or_rate_limit(
        cls,
        message: str,
        details: Dict[str, Any],
        retry_after_seconds: Optional[float],
        consecutive_cooldowns: int,
        status_code: int = 429,
    ) -> ErrorClassification:
        """Differentiates short-term rate limits from shared project/account quota limits."""
        lower_msg = message.lower()
        details_str = str(details).lower()

        # Check for billing / project / organization shared quota indicators
        is_project_quota = any(
            k in lower_msg or k in details_str
            for k in (
                "resource_exhausted",
                "insufficient_quota",
                "quota exceeded",
                "project quota",
                "daily limit",
                "requests per day",
                "billing",
                "tier limit",
            )
        )

        if is_project_quota:
            cooldown = CooldownPolicy.calculate_cooldown(
                ErrorCategory.QUOTA_EXHAUSTED, consecutive_cooldowns, retry_after_seconds
            )
            return ErrorClassification(
                category=ErrorCategory.QUOTA_EXHAUSTED,
                is_retryable=True,  # Safe to failover to a different provider or different quota group!
                scope=QuotaScope.PROJECT,
                retry_after_seconds=retry_after_seconds,
                cooldown_seconds=cooldown,
                status_code=status_code,
                reason="Shared project or account billing quota exhausted",
                confidence="certain" if "quota" in lower_msg else "uncertain",
                details=details,
            )
        else:
            # Request/token rate limit (RPM/TPM)
            cooldown = CooldownPolicy.calculate_cooldown(
                ErrorCategory.RATE_LIMIT, consecutive_cooldowns, retry_after_seconds
            )
            return ErrorClassification(
                category=ErrorCategory.RATE_LIMIT,
                is_retryable=True,
                scope=QuotaScope.CREDENTIAL,
                retry_after_seconds=retry_after_seconds,
                cooldown_seconds=cooldown,
                status_code=status_code,
                reason="Rate limit exceeded (requests or tokens per minute)",
                confidence="certain",
                details=details,
            )

    @classmethod
    def _classify_timeout(
        cls,
        message: str,
        consecutive_cooldowns: int,
        status_code: int = 504,
        retry_after_seconds: Optional[float] = None,
    ) -> ErrorClassification:
        cooldown = CooldownPolicy.calculate_cooldown(
            ErrorCategory.TIMEOUT, consecutive_cooldowns, retry_after_seconds
        )
        return ErrorClassification(
            category=ErrorCategory.TIMEOUT,
            is_retryable=True,
            scope=QuotaScope.CREDENTIAL,
            status_code=status_code,
            retry_after_seconds=retry_after_seconds,
            cooldown_seconds=cooldown,
            reason="Upstream request timed out",
            confidence="certain",
        )

    @classmethod
    def _classify_network_error(
        cls, message: str, consecutive_cooldowns: int
    ) -> ErrorClassification:
        cooldown = CooldownPolicy.calculate_cooldown(ErrorCategory.NETWORK_ERROR, consecutive_cooldowns)
        return ErrorClassification(
            category=ErrorCategory.NETWORK_ERROR,
            is_retryable=True,
            scope=QuotaScope.PROVIDER,
            status_code=502,
            cooldown_seconds=cooldown,
            reason="Network or connection drop connecting to upstream provider",
            confidence="certain",
        )

    @classmethod
    def _extract_retry_after(
        cls, headers: Dict[str, str], details: Dict[str, Any], message: str
    ) -> Optional[float]:
        """Extracts seconds from Retry-After header or structured error details."""
        # 1. Check HTTP header (delta-seconds or HTTP-date per RFC 9110).
        for k, v in (headers or {}).items():
            if k.lower() == "retry-after":
                try:
                    return max(0.0, float(str(v).strip()))
                except (TypeError, ValueError):
                    try:
                        retry_at = parsedate_to_datetime(str(v))
                        if retry_at.tzinfo is None:
                            retry_at = retry_at.replace(tzinfo=timezone.utc)
                        return max(0.0, (retry_at - datetime.now(timezone.utc)).total_seconds())
                    except (TypeError, ValueError, OverflowError):
                        pass

        # 2. Check details dict
        if "retry_after" in details:
            try:
                return float(details["retry_after"])
            except (ValueError, TypeError):
                pass

        # 3. Check for pattern in error message: e.g. "try again in 20s" or "retry after 4.5 seconds"
        match = re.search(r"retry\s+(?:after|in)\s+([0-9]+(?:\.[0-9]+)?)\s*s", message, re.IGNORECASE)
        if match:
            try:
                return float(match.group(1))
            except ValueError:
                pass

        return None
