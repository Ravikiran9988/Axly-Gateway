import pytest
from datetime import datetime, timedelta
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.base import utc_now
from app.models.circuit_breaker import CircuitBreaker
from app.routing.circuit_breaker import CircuitBreakerManager
from app.routing.schemas import CircuitBreakerStateEnum


@pytest.mark.asyncio
async def test_circuit_breaker_full_lifecycle(db_session: AsyncSession):
    """
    Test complete Circuit Breaker state transitions:
    CLOSED -> consecutive failures -> OPEN -> recovery timeout -> HALF_OPEN -> success -> CLOSED
    """
    scope_type = "provider"
    scope_id = "test_cb_provider"

    # 1. Initially CLOSED
    can_exec, reason = await CircuitBreakerManager.can_execute(db_session, scope_type, scope_id)
    assert can_exec is True
    assert "CLOSED" in reason

    # 2. Record 4 failures (threshold is 5) -> must remain CLOSED
    for i in range(4):
        await CircuitBreakerManager.record_failure(db_session, scope_type, scope_id, reason=f"Failure {i}")
    cb = await CircuitBreakerManager.get_or_create(db_session, scope_type, scope_id)
    assert cb.state == CircuitBreakerStateEnum.CLOSED.value
    assert cb.current_failures == 4

    # 3. Record 5th failure -> trips to OPEN!
    await CircuitBreakerManager.record_failure(db_session, scope_type, scope_id, reason="Failure 5")
    await db_session.commit()
    cb = await CircuitBreakerManager.get_or_create(db_session, scope_type, scope_id)
    assert cb.state == CircuitBreakerStateEnum.OPEN.value

    # Subsequent request is blocked while OPEN
    can_exec, reason = await CircuitBreakerManager.can_execute(db_session, scope_type, scope_id)
    assert can_exec is False
    assert "OPEN" in reason

    # 4. Simulate recovery timeout elapsed -> transitions to HALF_OPEN
    cb.last_state_change = utc_now() - timedelta(seconds=cb.recovery_timeout_seconds + 5)
    await db_session.commit()

    # Now can_execute should allow 1 trial probe and transition to HALF_OPEN!
    can_exec_probe, reason_probe = await CircuitBreakerManager.can_execute(db_session, scope_type, scope_id)
    assert can_exec_probe is True
    assert "HALF_OPEN" in reason_probe
    cb = await CircuitBreakerManager.get_or_create(db_session, scope_type, scope_id)
    assert cb.state == CircuitBreakerStateEnum.HALF_OPEN.value

    # 5. Successful probe request -> transitions back to CLOSED!
    await CircuitBreakerManager.record_success(db_session, scope_type, scope_id)
    await db_session.commit()
    cb = await CircuitBreakerManager.get_or_create(db_session, scope_type, scope_id)
    assert cb.state == CircuitBreakerStateEnum.CLOSED.value
    assert cb.current_failures == 0


@pytest.mark.asyncio
async def test_circuit_breaker_half_open_probe_failure(db_session: AsyncSession):
    """
    Test that if a trial probe in HALF_OPEN fails, the circuit breaker immediately trips back to OPEN.
    """
    scope_type = "provider"
    scope_id = "test_cb_probe_fail"

    cb = await CircuitBreakerManager.get_or_create(db_session, scope_type, scope_id)
    cb.state = CircuitBreakerStateEnum.HALF_OPEN.value
    cb.current_half_open_probes = 1
    await db_session.commit()

    # Probe fails
    await CircuitBreakerManager.record_failure(db_session, scope_type, scope_id, reason="Probe upstream 503")
    await db_session.commit()

    cb_after = await CircuitBreakerManager.get_or_create(db_session, scope_type, scope_id)
    assert cb_after.state == CircuitBreakerStateEnum.OPEN.value
    assert "Probe upstream 503" in cb_after.last_error_reason


@pytest.mark.asyncio
async def test_circuit_breaker_manual_reset(db_session: AsyncSession):
    """Test manual administrator circuit breaker reset."""
    scope_type = "provider"
    scope_id = "test_cb_manual_reset"

    cb = await CircuitBreakerManager.get_or_create(db_session, scope_type, scope_id)
    cb.state = CircuitBreakerStateEnum.OPEN.value
    cb.current_failures = 10
    await db_session.commit()

    await CircuitBreakerManager.manual_reset(db_session, scope_type, scope_id)
    await db_session.commit()

    cb_reset = await CircuitBreakerManager.get_or_create(db_session, scope_type, scope_id)
    assert cb_reset.state == CircuitBreakerStateEnum.CLOSED.value
    assert cb_reset.current_failures == 0
