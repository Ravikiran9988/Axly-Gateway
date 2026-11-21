from typing import List
from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_admin
from app.db.dependencies import get_db
from app.middleware.error_handler import APIException
from app.models.admin import Administrator
from app.models.circuit_breaker import CircuitBreaker
from app.routing.circuit_breaker import CircuitBreakerManager
from app.routing.schemas import CircuitBreakerResponse
from app.schemas.common import APIResponse

router = APIRouter(prefix="/circuit-breakers", tags=["Circuit Breakers"])


@router.get("", response_model=APIResponse[List[CircuitBreakerResponse]])
async def list_circuit_breakers(
    db: AsyncSession = Depends(get_db),
    admin: Administrator = Depends(get_current_admin),
):
    """Lists all circuit breaker records and their real-time states (CLOSED, OPEN, HALF_OPEN)."""
    stmt = select(CircuitBreaker).order_by(CircuitBreaker.created_at.asc())
    result = await db.execute(stmt)
    breakers = result.scalars().all()
    return APIResponse(data=[CircuitBreakerResponse.model_validate(cb) for cb in breakers])


@router.post("/{scope_type}/{scope_id}/reset", response_model=APIResponse[CircuitBreakerResponse])
async def reset_circuit_breaker(
    scope_type: str,
    scope_id: str,
    db: AsyncSession = Depends(get_db),
    admin: Administrator = Depends(get_current_admin),
):
    """Administrator manual override to force a circuit breaker back to CLOSED state."""
    clean_type = scope_type.strip().lower()
    clean_id = scope_id.strip()

    if clean_type not in ("provider", "quota_group"):
        raise APIException(
            code="INVALID_SCOPE_TYPE",
            message="Scope type must be 'provider' or 'quota_group'",
            status_code=status.HTTP_400_BAD_REQUEST,
        )

    cb = await CircuitBreakerManager.manual_reset(db, clean_type, clean_id)
    return APIResponse(
        data=CircuitBreakerResponse.model_validate(cb),
        message=f"Circuit breaker for {clean_type}:{clean_id} manually reset to CLOSED",
    )
