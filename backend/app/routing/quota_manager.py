import logging
import uuid
from datetime import datetime, timedelta
from typing import Optional, Tuple
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.base import utc_now
from app.models.quota import QuotaGroup
from app.routing.policies import CooldownPolicy
from app.routing.schemas import ErrorCategory, ErrorClassification

logger = logging.getLogger("axly.routing.quota")


class QuotaManager:
    """
    Manages shared quota groups representing project, organization, or provider-level limits.
    Prevents pointless repeated retries against sibling keys sharing the same exhausted upstream quota.
    """

    @classmethod
    async def is_quota_group_eligible(
        cls,
        db: AsyncSession,
        quota_group_id: Optional[uuid.UUID],
    ) -> Tuple[bool, str]:
        """
        Validates if a quota group is currently eligible to receive requests.
        Returns (is_eligible, reason_string).
        """
        if not quota_group_id:
            return True, "No quota group assigned (independent quota)"

        stmt = (
            select(QuotaGroup)
            .where(QuotaGroup.id == quota_group_id)
            .with_for_update()
        )
        qg = (await db.execute(stmt)).scalar_one_or_none()
        if not qg:
            return True, "Quota group not found (assumed independent)"

        now = utc_now()

        if qg.status == "disabled":
            return False, f"Shared quota group '{qg.name}' is administratively disabled"

        if qg.status in ("cooldown", "exhausted"):
            if qg.cooldown_until and qg.cooldown_until > now:
                remaining = (qg.cooldown_until - now).total_seconds()
                category = qg.last_error_category or "quota"
                return (
                    False,
                    f"Shared quota group '{qg.name}' (scope: {qg.scope_type}) in cooldown "
                    f"({remaining:.1f}s remaining, cause: {category})",
                )
            else:
                # Cooldown expired! Auto-recover
                qg.status = "healthy"
                qg.cooldown_until = None
                await db.flush()
                logger.info(f"Shared quota group '{qg.name}' cooldown expired -> auto-recovered to healthy")
                return True, f"Shared quota group '{qg.name}' auto-recovered"

        return True, f"Shared quota group '{qg.name}' is healthy"

    @classmethod
    async def apply_quota_cooldown(
        cls,
        db: AsyncSession,
        quota_group_id: uuid.UUID,
        classification: ErrorClassification,
    ) -> float:
        """
        Places an entire quota group into cooldown upon observing a project/org level quota failure.
        All sibling keys linked to this group will immediately be excluded from candidate selection.
        """
        stmt = (
            select(QuotaGroup)
            .where(QuotaGroup.id == quota_group_id)
            .with_for_update()
        )
        qg = (await db.execute(stmt)).scalar_one_or_none()
        if not qg:
            logger.warning(f"Quota group {quota_group_id} not found to apply cooldown")
            return 0.0

        now = utc_now()
        duration = CooldownPolicy.calculate_cooldown(
            ErrorCategory.QUOTA_EXHAUSTED,
            consecutive_cooldowns=qg.consecutive_failures,
            explicit_retry_after=classification.retry_after_seconds,
        )

        qg.status = "cooldown"
        qg.cooldown_until = now + timedelta(seconds=duration)
        qg.last_quota_error_at = now
        qg.last_error_category = classification.category.value
        qg.last_error_details = {
            "reason": classification.reason,
            "confidence": classification.confidence,
            "status_code": classification.status_code,
            "scope": classification.scope.value,
        }
        qg.consecutive_failures += 1
        await db.flush()

        logger.warning(
            f"Shared quota group '{qg.name}' (scope: {qg.scope_type}) entered cooldown for {duration:.1f}s "
            f"until {qg.cooldown_until}. Sibling keys will be excluded."
        )
        return duration

    @classmethod
    async def mark_success(
        cls,
        db: AsyncSession,
        quota_group_id: Optional[uuid.UUID],
    ) -> None:
        """Resets consecutive failures on successful upstream execution."""
        if not quota_group_id:
            return

        stmt = (
            select(QuotaGroup)
            .where(QuotaGroup.id == quota_group_id)
            .with_for_update()
        )
        qg = (await db.execute(stmt)).scalar_one_or_none()
        if qg and qg.status == "healthy":
            qg.consecutive_failures = 0
            await db.flush()

    @classmethod
    async def manual_recover_quota_group(
        cls,
        db: AsyncSession,
        quota_group_id: uuid.UUID,
    ) -> QuotaGroup:
        """Administrator manual override to clear quota group cooldown."""
        stmt = (
            select(QuotaGroup)
            .where(QuotaGroup.id == quota_group_id)
            .with_for_update()
        )
        qg = (await db.execute(stmt)).scalar_one_or_none()
        if not qg:
            raise ValueError(f"Quota group {quota_group_id} not found")

        qg.status = "healthy"
        qg.cooldown_until = None
        qg.consecutive_failures = 0
        await db.flush()
        return qg

    @classmethod
    async def manual_cooldown_quota_group(
        cls,
        db: AsyncSession,
        quota_group_id: uuid.UUID,
        duration_seconds: float,
        reason: str,
    ) -> QuotaGroup:
        """Administrator manual override to place quota group in cooldown."""
        stmt = (
            select(QuotaGroup)
            .where(QuotaGroup.id == quota_group_id)
            .with_for_update()
        )
        qg = (await db.execute(stmt)).scalar_one_or_none()
        if not qg:
            raise ValueError(f"Quota group {quota_group_id} not found")

        now = utc_now()
        qg.status = "cooldown"
        qg.cooldown_until = now + timedelta(seconds=duration_seconds)
        qg.last_error_category = "manual_override"
        qg.last_error_details = {"reason": reason}
        await db.flush()
        return qg
