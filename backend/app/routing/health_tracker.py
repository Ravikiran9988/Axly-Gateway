import logging
import uuid
from typing import Any, Dict, List, Optional
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.circuit_breaker import CircuitBreaker
from app.models.credential import ProviderCredential
from app.models.health import CredentialHealth
from app.models.provider import Provider
from app.models.quota import QuotaGroup
from app.routing.cooldown_manager import CooldownManager
from app.routing.quota_manager import QuotaManager
from app.routing.schemas import ErrorClassification, QuotaScope

logger = logging.getLogger("axly.routing.health_tracker")


class HealthTracker:
    """
    Central tracking system for provider credentials, shared quota groups, and provider health.
    Updates health status, usage counters, and coordinates cooldown propagation.
    """

    @classmethod
    async def record_attempt_result(
        cls,
        db: AsyncSession,
        credential_id: Optional[uuid.UUID],
        provider_name: str,
        quota_group_id: Optional[uuid.UUID],
        success: bool,
        latency_ms: float = 0.0,
        classification: Optional[ErrorClassification] = None,
        tokens_count: int = 0,
    ) -> Optional[float]:
        """
        Records attempt outcome.
        On success: marks healthy and clears cooldowns.
        On failure: increments error counters, applies cooldown to credential,
        and if project/org quota, cascades cooldown to the shared QuotaGroup.
        Returns applied cooldown duration in seconds if failure, or None.
        """
        if not credential_id:
            return None

        if success:
            await CooldownManager.mark_success(db, credential_id, latency_ms)
            if quota_group_id:
                await QuotaManager.mark_success(db, quota_group_id)

            if tokens_count > 0:
                stmt = (
                    update(ProviderCredential)
                    .where(ProviderCredential.id == credential_id)
                    .values(tokens_count=ProviderCredential.tokens_count + tokens_count)
                )
                await db.execute(stmt)
                await db.flush()
            return None

        # Failure handling
        stmt = (
            update(ProviderCredential)
            .where(ProviderCredential.id == credential_id)
            .values(errors_count=ProviderCredential.errors_count + 1)
        )
        await db.execute(stmt)
        await db.flush()

        applied_cooldown = 0.0
        if classification:
            applied_cooldown = await CooldownManager.apply_credential_cooldown(
                db, credential_id, classification
            )

            # If quota scope is project, organization, or provider level, apply to quota group as well!
            if (
                quota_group_id
                and classification.scope in (QuotaScope.PROJECT, QuotaScope.ORGANIZATION, QuotaScope.PROVIDER)
            ):
                qg_cooldown = await QuotaManager.apply_quota_cooldown(
                    db, quota_group_id, classification
                )
                applied_cooldown = max(applied_cooldown, qg_cooldown)

        return applied_cooldown

    @classmethod
    async def get_system_health_overview(cls, db: AsyncSession) -> Dict[str, Any]:
        """Returns consolidated health report across providers, credentials, and circuit breakers."""
        # 1. Fetch providers with credentials and health
        p_stmt = select(Provider).options(
            selectinload(Provider.credentials).selectinload(ProviderCredential.health),
            selectinload(Provider.credentials).selectinload(ProviderCredential.quota_group),
        )
        providers = (await db.execute(p_stmt)).scalars().all()

        # 2. Fetch circuit breakers
        cb_stmt = select(CircuitBreaker)
        circuit_breakers = (await db.execute(cb_stmt)).scalars().all()

        # 3. Fetch quota groups
        qg_stmt = select(QuotaGroup)
        quota_groups = (await db.execute(qg_stmt)).scalars().all()

        provider_summaries = []
        for p in providers:
            total_creds = len(p.credentials)
            healthy_creds = sum(
                1 for c in p.credentials
                if c.is_active and (not c.health or c.health.status in ("healthy", "recovering"))
            )
            provider_summaries.append({
                "id": str(p.id),
                "name": p.name,
                "display_name": p.display_name,
                "is_enabled": p.is_enabled,
                "total_credentials": total_creds,
                "healthy_credentials": healthy_creds,
                "status": "healthy" if (p.is_enabled and healthy_creds > 0) else "degraded",
            })

        return {
            "providers": provider_summaries,
            "circuit_breakers": [
                {
                    "scope_type": cb.scope_type,
                    "scope_id": cb.scope_id,
                    "state": cb.state,
                    "current_failures": cb.current_failures,
                    "failure_threshold": cb.failure_threshold,
                    "last_state_change": cb.last_state_change.isoformat() if cb.last_state_change else None,
                }
                for cb in circuit_breakers
            ],
            "quota_groups": [
                {
                    "id": str(qg.id),
                    "name": qg.name,
                    "scope_type": qg.scope_type,
                    "status": qg.status,
                    "cooldown_until": qg.cooldown_until.isoformat() if qg.cooldown_until else None,
                    "consecutive_failures": qg.consecutive_failures,
                }
                for qg in quota_groups
            ],
        }
