import logging
from datetime import datetime, timedelta
from typing import Optional, Tuple
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.base import utc_now
from app.models.circuit_breaker import CircuitBreaker
from app.routing.policies import CircuitBreakerPolicy
from app.routing.schemas import CircuitBreakerStateEnum, ErrorCategory, ErrorClassification

logger = logging.getLogger("axly.routing.circuit_breaker")


class CircuitBreakerManager:
    """
    Database-backed distributed circuit breaker.
    Shared across worker processes via row-level locking (SELECT FOR UPDATE).
    Enforces CLOSED -> OPEN -> HALF_OPEN -> CLOSED state transitions.
    """

    @classmethod
    async def get_or_create(
        cls,
        db: AsyncSession,
        scope_type: str,
        scope_id: str,
        for_update: bool = False,
    ) -> CircuitBreaker:
        """Retrieves or initializes a circuit breaker record for a given scope."""
        stmt = select(CircuitBreaker).where(
            CircuitBreaker.scope_type == scope_type,
            CircuitBreaker.scope_id == scope_id,
        )
        # Always refresh the identity-map copy. The CLOSED fast path is intentionally
        # lock-free, but it must not read stale breaker state from this session.
        stmt = stmt.execution_options(populate_existing=True)
        if for_update:
            stmt = stmt.with_for_update()

        cb = (await db.execute(stmt)).scalar_one_or_none()
        if not cb:
            # Atomic upsert using PostgreSQL ON CONFLICT DO NOTHING to prevent race conditions
            insert_stmt = (
                insert(CircuitBreaker)
                .values(
                    scope_type=scope_type,
                    scope_id=scope_id,
                    state=CircuitBreakerStateEnum.CLOSED.value,
                    failure_threshold=CircuitBreakerPolicy.DEFAULT_FAILURE_THRESHOLD,
                    recovery_timeout_seconds=CircuitBreakerPolicy.DEFAULT_RECOVERY_TIMEOUT_SECONDS,
                    half_open_probes_allowed=CircuitBreakerPolicy.DEFAULT_HALF_OPEN_PROBES,
                    current_failures=0,
                    current_half_open_probes=0,
                    last_state_change=utc_now(),
                    history=[],
                )
                .on_conflict_do_nothing(index_elements=["scope_type", "scope_id"])
            )
            await db.execute(insert_stmt)
            # Publish a newly created row before another request attempts to inspect it.
            await db.commit()
            cb = (await db.execute(stmt)).scalar_one()
        return cb

    @classmethod
    async def can_execute(
        cls,
        db: AsyncSession,
        scope_type: str,
        scope_id: str,
    ) -> Tuple[bool, str]:
        """
        Check breaker eligibility without holding a row lock during the upstream call.

        CLOSED is the common path and is a lock-free read. OPEN/HALF_OPEN are re-read
        under a short lock; any state transition/probe reservation is committed before
        returning to the caller.
        """
        cb = await cls.get_or_create(db, scope_type, scope_id, for_update=False)
        if cb.state == CircuitBreakerStateEnum.CLOSED.value:
            # Release the read transaction/pooled connection before network I/O.
            await db.commit()
            return True, "Circuit breaker is CLOSED (normal operation)"

        # Slow path: serialize only state transitions and half-open probe reservations.
        cb = await cls.get_or_create(db, scope_type, scope_id, for_update=True)
        now = utc_now()

        if cb.state == CircuitBreakerStateEnum.CLOSED.value:
            allowed, reason = True, "Circuit breaker is CLOSED (normal operation)"
        elif cb.state == CircuitBreakerStateEnum.OPEN.value:
            recovery_deadline = cb.last_state_change + timedelta(
                seconds=cb.recovery_timeout_seconds
            )
            if now >= recovery_deadline:
                old_state = cb.state
                cb.state = CircuitBreakerStateEnum.HALF_OPEN.value
                cb.current_half_open_probes = 1
                cb.last_state_change = now
                history = list(cb.history or [])
                history.append({
                    "from": old_state,
                    "to": cb.state,
                    "timestamp": now.isoformat(),
                    "reason": "Recovery timeout elapsed; initiating trial probe",
                })
                cb.history = history[-50:]
                allowed, reason = True, "Circuit breaker is HALF_OPEN (trial probe allowed)"
                logger.info(
                    "Circuit breaker [%s:%s] transitioned OPEN -> HALF_OPEN (probe allowed)",
                    scope_type,
                    scope_id,
                )
            else:
                remaining = (recovery_deadline - now).total_seconds()
                allowed, reason = False, (
                    f"Circuit breaker is OPEN ({remaining:.1f}s until recovery probe, "
                    f"reason: {cb.last_error_reason})"
                )
        elif cb.state == CircuitBreakerStateEnum.HALF_OPEN.value:
            if cb.current_half_open_probes < cb.half_open_probes_allowed:
                cb.current_half_open_probes += 1
                allowed, reason = True, (
                    "Circuit breaker is HALF_OPEN (additional trial probe permitted)"
                )
            else:
                allowed, reason = False, (
                    "Circuit breaker is HALF_OPEN (max concurrent trial probes already active)"
                )
        else:
            allowed, reason = True, "Unknown state (allowing request)"

        # Release the row lock before the caller performs upstream I/O.
        await db.commit()
        return allowed, reason

    @classmethod
    async def record_success(
        cls,
        db: AsyncSession,
        scope_type: str,
        scope_id: str,
    ) -> None:
        """
        Records a successful request.
        If in HALF_OPEN, transitions back to CLOSED.
        Resets failure counters to 0.
        """
        cb = await cls.get_or_create(db, scope_type, scope_id, for_update=True)
        now = utc_now()
        cb.last_success_at = now
        cb.current_failures = 0
        cb.current_half_open_probes = 0

        if cb.state == CircuitBreakerStateEnum.HALF_OPEN.value:
            old_state = cb.state
            cb.state = CircuitBreakerStateEnum.CLOSED.value
            cb.last_state_change = now
            history = list(cb.history or [])
            history.append({
                "from": old_state,
                "to": cb.state,
                "timestamp": now.isoformat(),
                "reason": "Trial probe succeeded; circuit restored to CLOSED",
            })
            cb.history = history[-50:]
            logger.info(f"Circuit breaker [{scope_type}:{scope_id}] transitioned HALF_OPEN -> CLOSED (recovered)")

        await db.flush()

    @classmethod
    async def record_failure(
        cls,
        db: AsyncSession,
        scope_type: str,
        scope_id: str,
        reason: str,
        classification: Optional[ErrorClassification] = None,
    ) -> None:
        """
        Records a genuine upstream availability failure.
        Client errors, safety blocks, authentication/permission errors, rate limits,
        quota exhaustion, and unsupported models do not open a provider-wide breaker.
        """
        if classification is not None:
            provider_failure_categories = {
                ErrorCategory.TIMEOUT,
                ErrorCategory.SERVICE_UNAVAILABLE,
                ErrorCategory.NETWORK_ERROR,
                ErrorCategory.UNKNOWN,
            }
            if (
                classification.category not in provider_failure_categories
                or (
                    classification.category == ErrorCategory.UNKNOWN
                    and classification.status_code < 500
                )
            ):
                logger.debug(
                    "Ignoring non-provider failure for circuit breaker [%s:%s] (%s, HTTP %s)",
                    scope_type,
                    scope_id,
                    classification.category.value,
                    classification.status_code,
                )
                return

        cb = await cls.get_or_create(db, scope_type, scope_id, for_update=True)
        now = utc_now()
        cb.last_failure_at = now
        cb.last_error_reason = reason[:500]

        if cb.state == CircuitBreakerStateEnum.HALF_OPEN.value:
            old_state = cb.state
            cb.state = CircuitBreakerStateEnum.OPEN.value
            cb.last_state_change = now
            cb.current_half_open_probes = 0
            cb.current_failures += 1
            history = list(cb.history or [])
            history.append({
                "from": old_state,
                "to": cb.state,
                "timestamp": now.isoformat(),
                "reason": f"Probe failed in HALF_OPEN: {reason[:120]}",
            })
            cb.history = history[-50:]
            logger.warning(f"Circuit breaker [{scope_type}:{scope_id}] probe failed -> transitioned to OPEN")
            await db.flush()
            return

        if cb.state == CircuitBreakerStateEnum.CLOSED.value:
            cb.current_failures += 1
            if cb.current_failures >= cb.failure_threshold:
                old_state = cb.state
                cb.state = CircuitBreakerStateEnum.OPEN.value
                cb.last_state_change = now
                history = list(cb.history or [])
                history.append({
                    "from": old_state,
                    "to": cb.state,
                    "timestamp": now.isoformat(),
                    "reason": f"Failure threshold reached ({cb.current_failures}/{cb.failure_threshold}): {reason[:120]}",
                })
                cb.history = history[-50:]
                logger.warning(
                    f"Circuit breaker [{scope_type}:{scope_id}] tripped CLOSED -> OPEN "
                    f"after {cb.current_failures} consecutive failures"
                )
            await db.flush()

    @classmethod
    async def manual_reset(
        cls,
        db: AsyncSession,
        scope_type: str,
        scope_id: str,
    ) -> CircuitBreaker:
        """Allows administrator to manually force a circuit breaker back to CLOSED."""
        cb = await cls.get_or_create(db, scope_type, scope_id, for_update=True)
        now = utc_now()
        old_state = cb.state
        cb.state = CircuitBreakerStateEnum.CLOSED.value
        cb.current_failures = 0
        cb.current_half_open_probes = 0
        cb.last_state_change = now
        history = list(cb.history or [])
        history.append({
            "from": old_state,
            "to": cb.state,
            "timestamp": now.isoformat(),
            "reason": "Administrator manual circuit reset",
        })
        cb.history = history[-50:]
        await db.flush()
        return cb
