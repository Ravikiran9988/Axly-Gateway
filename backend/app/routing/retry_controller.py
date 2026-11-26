import asyncio
import logging
import time
from typing import Optional, Tuple
import uuid

from app.routing.policies import RetryPolicy
from app.routing.schemas import ErrorCategory, ErrorClassification, QuotaScope

logger = logging.getLogger("axly.routing.retry_controller")


class RetryController:
    """
    Decides whether a failed request attempt is eligible for retry/failover,
    evaluating deadline boundaries, client connectivity, error permanence,
    and calculating bounded backoff delays.
    """

    FAILOVER_CATEGORIES = frozenset({
        ErrorCategory.AUTHENTICATION,
        ErrorCategory.PERMISSION,
        ErrorCategory.MODEL_NOT_FOUND,
    })
    CREDENTIAL_SCOPED_CATEGORIES = frozenset({
        ErrorCategory.AUTHENTICATION,
        ErrorCategory.PERMISSION,
        ErrorCategory.RATE_LIMIT,
        ErrorCategory.QUOTA_EXHAUSTED,
    })

    @classmethod
    def should_try_next_credential(
        cls,
        classification: ErrorClassification,
        quota_group_id: Optional[uuid.UUID] = None,
    ) -> bool:
        """Return true for key-scoped failures when another independent key may work."""
        if classification.category not in cls.CREDENTIAL_SCOPED_CATEGORIES:
            return False
        if quota_group_id is not None and classification.scope in (
            QuotaScope.PROJECT,
            QuotaScope.ORGANIZATION,
        ):
            return False
        return True

    @classmethod
    def should_retry(
        cls,
        attempt: int,
        max_attempts: int,
        start_monotonic: float,
        overall_deadline_seconds: float,
        classification: ErrorClassification,
        client_disconnected: bool = False,
    ) -> Tuple[bool, str]:
        """
        Determines if a subsequent candidate attempt is allowed.
        Returns (should_retry, reason).
        """
        if client_disconnected:
            return False, "Aborted: client disconnected"

        if (
            not classification.is_retryable
            and classification.category not in cls.FAILOVER_CATEGORIES
        ):
            return False, (
                f"Aborted: permanent unretryable failure "
                f"({classification.category.value}: {classification.reason})"
            )

        if attempt >= max_attempts:
            return False, f"Aborted: maximum attempts ({max_attempts}) reached"

        elapsed = time.monotonic() - start_monotonic
        remaining = overall_deadline_seconds - elapsed

        if remaining <= 0.5:
            return False, f"Aborted: overall request deadline exceeded ({elapsed:.1f}s / {overall_deadline_seconds:.1f}s)"

        return True, f"Approved for fallback attempt ({attempt + 1}/{max_attempts}, {remaining:.1f}s remaining)"

    @classmethod
    async def apply_bounded_backoff(
        cls,
        attempt: int,
        retry_after: Optional[float] = None,
        max_sleep_seconds: float = 1.5,
    ) -> float:
        """
        Applies a bounded short delay before the next candidate is executed.
        Prevents blocking active HTTP client connections for excessive durations.
        """
        if retry_after is not None and 0 < retry_after <= max_sleep_seconds:
            delay = retry_after
        else:
            delay = RetryPolicy.calculate_attempt_backoff(attempt)

        delay = min(delay, max_sleep_seconds)
        if delay > 0:
            await asyncio.sleep(delay)
        return delay
