import random
from typing import Dict
from app.routing.schemas import ErrorCategory


class CooldownPolicy:
    """Configurable cooldown durations and exponential backoff parameters."""

    BASE_DURATIONS: Dict[ErrorCategory, float] = {
        ErrorCategory.RATE_LIMIT: 30.0,
        ErrorCategory.QUOTA_EXHAUSTED: 120.0,
        ErrorCategory.SERVICE_UNAVAILABLE: 15.0,
        ErrorCategory.TIMEOUT: 10.0,
        ErrorCategory.NETWORK_ERROR: 10.0,
        ErrorCategory.UNKNOWN: 20.0,
    }

    BACKOFF_FACTORS: Dict[ErrorCategory, float] = {
        ErrorCategory.RATE_LIMIT: 2.0,
        ErrorCategory.QUOTA_EXHAUSTED: 2.0,
        ErrorCategory.SERVICE_UNAVAILABLE: 2.0,
        ErrorCategory.TIMEOUT: 1.5,
        ErrorCategory.NETWORK_ERROR: 1.5,
        ErrorCategory.UNKNOWN: 1.5,
    }

    MAX_COOLDOWN_SECONDS: Dict[ErrorCategory, float] = {
        ErrorCategory.RATE_LIMIT: 900.0,       # 15 minutes max
        ErrorCategory.QUOTA_EXHAUSTED: 3600.0,  # 1 hour max
        ErrorCategory.SERVICE_UNAVAILABLE: 300.0, # 5 minutes max
        ErrorCategory.TIMEOUT: 120.0,           # 2 minutes max
        ErrorCategory.NETWORK_ERROR: 120.0,
        ErrorCategory.UNKNOWN: 300.0,
    }

    DEFAULT_JITTER_RATIO: float = 0.2  # +/- 20% jitter

    @classmethod
    def calculate_cooldown(
        cls,
        category: ErrorCategory,
        consecutive_cooldowns: int = 0,
        explicit_retry_after: float = None,
    ) -> float:
        """
        Calculates cooldown duration using Retry-After if provided,
        or exponential backoff with bounded random jitter.
        """
        if explicit_retry_after is not None and explicit_retry_after > 0:
            # Respect reliable upstream Retry-After plus a slight jitter to prevent thundering herd
            jitter = random.uniform(0.0, 1.0)
            return explicit_retry_after + jitter

        base = cls.BASE_DURATIONS.get(category, 20.0)
        factor = cls.BACKOFF_FACTORS.get(category, 2.0)
        max_duration = cls.MAX_COOLDOWN_SECONDS.get(category, 300.0)

        # Exponential backoff based on consecutive failures: base * (factor ^ count)
        duration = base * (factor ** min(consecutive_cooldowns, 6))
        duration = min(duration, max_duration)

        # Apply random jitter (+/- 20%)
        low = duration * (1.0 - cls.DEFAULT_JITTER_RATIO)
        high = duration * (1.0 + cls.DEFAULT_JITTER_RATIO)
        jittered = random.uniform(low, high)

        return round(max(1.0, jittered), 2)


class CircuitBreakerPolicy:
    """Default parameters for circuit breaker state machine."""

    DEFAULT_FAILURE_THRESHOLD: int = 5
    DEFAULT_RECOVERY_TIMEOUT_SECONDS: int = 60
    DEFAULT_HALF_OPEN_PROBES: int = 1


class RetryPolicy:
    """Configurable boundaries for retry and fallback execution."""

    DEFAULT_MAX_ATTEMPTS: int = 3
    MAX_ALLOWABLE_ATTEMPTS: int = 10
    DEFAULT_OVERALL_DEADLINE_SECONDS: float = 60.0
    DEFAULT_PER_ATTEMPT_TIMEOUT_SECONDS: float = 30.0

    # Bounds on sleeping between candidate retries in active request thread
    MIN_RETRY_BACKOFF_SECONDS: float = 0.05
    MAX_RETRY_BACKOFF_SECONDS: float = 1.5

    @classmethod
    def calculate_attempt_backoff(cls, attempt: int) -> float:
        """Calculates bounded small backoff before trying next candidate."""
        delay = cls.MIN_RETRY_BACKOFF_SECONDS * (1.5 ** attempt)
        jitter = random.uniform(0.01, 0.05)
        return min(cls.MAX_RETRY_BACKOFF_SECONDS, delay + jitter)
