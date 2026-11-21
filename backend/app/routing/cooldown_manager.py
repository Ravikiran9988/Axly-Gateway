import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional, Tuple
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.base import utc_now
from app.models.credential import ProviderCredential
from app.models.health import CredentialHealth
from app.models.quota import QuotaGroup
from app.routing.schemas import (
    ErrorCategory,
    ErrorClassification,
    HealthState,
    QuotaScope,
)

logger = logging.getLogger("axly.routing.cooldown")


class CooldownManager:
    """
    Manages persisted cooldowns and automatic recovery for credentials and shared quota groups.
    Source of truth is persisted timestamps in PostgreSQL.
    """

    @classmethod
    async def apply_credential_cooldown(
        cls,
        db: AsyncSession,
        credential_id: uuid.UUID,
        classification: ErrorClassification,
        custom_reason: Optional[str] = None,
    ) -> float:
        """
        Applies a calculated or explicit cooldown duration to a credential health record.
        Updates consecutive_cooldowns, cooldown_until, status, and error details.
        """
        stmt = (
            select(CredentialHealth)
            .where(CredentialHealth.credential_id == credential_id)
            .with_for_update()
        )
        health = (await db.execute(stmt)).scalar_one_or_none()
        if not health:
            logger.warning(f"No health record found for credential {credential_id} to apply cooldown")
            return 0.0

        now = utc_now()
        duration_seconds = classification.cooldown_seconds
        cooldown_until = now + timedelta(seconds=duration_seconds)
        reason = custom_reason or classification.reason

        # Determine target state
        if classification.category == ErrorCategory.AUTHENTICATION:
            # Permanent credential disable until fixed/re-tested
            new_status = HealthState.AUTHENTICATION_FAILURE.value
            duration_seconds = 0.0
            cooldown_until = None
        elif classification.category == ErrorCategory.PERMISSION:
            new_status = HealthState.PERMISSION_FAILURE.value
            duration_seconds = 0.0
            cooldown_until = None
        elif classification.category in (ErrorCategory.RATE_LIMIT, ErrorCategory.QUOTA_EXHAUSTED):
            new_status = HealthState.RATE_LIMITED.value
            health.consecutive_cooldowns += 1
        else:
            new_status = HealthState.TEMPORARILY_UNAVAILABLE.value
            health.consecutive_cooldowns += 1

        health.status = new_status
        health.cooldown_until = cooldown_until
        health.cooldown_reason = reason[:256]
        health.last_failure_at = now
        health.last_error_category = classification.category.value
        health.last_error_code = str(classification.status_code)
        health.last_error_message = reason
        health.consecutive_failures += 1

        await db.flush()
        logger.info(
            f"Applied cooldown to credential {credential_id}: status={new_status}, "
            f"duration={duration_seconds:.1f}s, until={cooldown_until}, reason='{reason}'"
        )
        return duration_seconds

    @classmethod
    async def check_and_recover_credential(
        cls,
        db: AsyncSession,
        credential: ProviderCredential,
        health: Optional[CredentialHealth],
    ) -> Tuple[bool, str]:
        """
        Evaluates whether a credential is eligible for routing:
        - If disabled, returns False
        - If authentication_failure, returns False
        - If permission_failure, returns False
        - If cooldown_until is in the future, returns False (in cooldown)
        - If cooldown_until has passed: automatically marks as 'recovering' and returns True!
        - If healthy, returns True
        """
        if not credential.is_active:
            return False, "Credential is administratively disabled"

        if not health:
            return True, "No health record (assumed healthy)"

        status = health.status
        if status == HealthState.DISABLED.value:
            return False, "Credential marked as disabled"

        if status == HealthState.AUTHENTICATION_FAILURE.value:
            return False, "Credential has authentication failure (invalid or revoked key)"

        if status == HealthState.PERMISSION_FAILURE.value:
            return False, "Credential has permission failure (lacks account scopes)"

        now = utc_now()
        # Check if currently in active cooldown
        if health.cooldown_until and health.cooldown_until > now:
            remaining = (health.cooldown_until - now).total_seconds()
            return False, f"In active cooldown ({remaining:.1f}s remaining, reason: {health.cooldown_reason})"

        # Cooldown has expired! Auto-recover state
        if status in (HealthState.RATE_LIMITED.value, HealthState.TEMPORARILY_UNAVAILABLE.value):
            health.status = HealthState.RECOVERING.value
            health.cooldown_until = None
            await db.flush()
            logger.info(f"Credential {credential.id} cooldown expired -> transitioned to RECOVERING")
            return True, "Cooldown expired, currently recovering"

        return True, "Eligible"

    @classmethod
    async def mark_success(
        cls,
        db: AsyncSession,
        credential_id: uuid.UUID,
        latency_ms: float = 0.0,
    ) -> None:
        """Restores healthy status and resets cooldown counts upon confirmed upstream success."""
        stmt = (
            select(CredentialHealth)
            .where(CredentialHealth.credential_id == credential_id)
            .with_for_update()
        )
        health = (await db.execute(stmt)).scalar_one_or_none()
        if health:
            health.status = HealthState.HEALTHY.value
            health.consecutive_failures = 0
            health.consecutive_cooldowns = 0
            health.cooldown_until = None
            health.cooldown_reason = None
            health.last_success_at = utc_now()
            health.response_time_ms = latency_ms

        # Also increment usage counter on credential
        c_stmt = (
            update(ProviderCredential)
            .where(ProviderCredential.id == credential_id)
            .values(requests_count=ProviderCredential.requests_count + 1)
        )
        await db.execute(c_stmt)
        await db.flush()

    @classmethod
    async def manual_override_cooldown(
        cls,
        db: AsyncSession,
        credential_id: uuid.UUID,
        duration_seconds: float,
        reason: str,
    ) -> CredentialHealth:
        """Allows administrator to manually set a cooldown on a credential."""
        stmt = (
            select(CredentialHealth)
            .where(CredentialHealth.credential_id == credential_id)
            .with_for_update()
        )
        health = (await db.execute(stmt)).scalar_one_or_none()
        if not health:
            raise ValueError(f"No health record found for credential {credential_id}")

        now = utc_now()
        health.status = HealthState.TEMPORARILY_UNAVAILABLE.value
        health.cooldown_until = now + timedelta(seconds=duration_seconds)
        health.cooldown_reason = reason
        await db.flush()
        return health

    @classmethod
    async def manual_recover_credential(
        cls,
        db: AsyncSession,
        credential_id: uuid.UUID,
        force_auth_reset: bool = False,
    ) -> CredentialHealth:
        """
        Manually clears cooldown for a credential.
        Safety rule: If status is authentication_failure, force_auth_reset must be True
        to prevent accidental override without fresh testing.
        """
        stmt = (
            select(CredentialHealth)
            .where(CredentialHealth.credential_id == credential_id)
            .with_for_update()
        )
        health = (await db.execute(stmt)).scalar_one_or_none()
        if not health:
            raise ValueError(f"No health record found for credential {credential_id}")

        if health.status == HealthState.AUTHENTICATION_FAILURE.value and not force_auth_reset:
            raise ValueError(
                "Cannot manually recover credential with authentication failure without validating the key first."
            )

        health.status = HealthState.HEALTHY.value
        health.cooldown_until = None
        health.cooldown_reason = None
        health.consecutive_failures = 0
        health.consecutive_cooldowns = 0
        await db.flush()
        return health
