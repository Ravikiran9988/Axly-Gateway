import sys
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_admin
from app.core.config import get_settings
from app.db.base import utc_now
from app.db.dependencies import get_db
from app.models.admin import Administrator
from app.models.circuit_breaker import CircuitBreaker
from app.models.credential import ProviderCredential
from app.models.provider import Provider
from app.schemas.common import APIResponse
from app.services.system_service import check_database_readiness

router = APIRouter(prefix="/health", tags=["Admin Health"])


@router.get("/diagnostics", response_model=APIResponse[dict])
async def get_admin_diagnostics(
    db: AsyncSession = Depends(get_db),
    admin: Administrator = Depends(get_current_admin),
):
    """Returns detailed infrastructure diagnostics for authenticated administrators."""
    settings = get_settings()
    db_ok, db_check = await check_database_readiness(db)

    # Upstream providers
    providers_stmt = select(Provider).options(selectinload(Provider.credentials))
    providers = (await db.execute(providers_stmt)).scalars().all()

    # Credentials
    creds_stmt = select(ProviderCredential).options(selectinload(ProviderCredential.health))
    credentials = (await db.execute(creds_stmt)).scalars().all()

    # Circuit breakers
    breakers_stmt = select(CircuitBreaker)
    breakers = (await db.execute(breakers_stmt)).scalars().all()

    now = utc_now()
    cooldown_count = 0
    healthy_count = 0
    degraded_count = 0
    for c in credentials:
        h = c.health
        if h and h.cooldown_until and h.cooldown_until > now:
            cooldown_count += 1
        elif h and h.status in ("degraded", "exhausted", "error"):
            degraded_count += 1
        else:
            healthy_count += 1

    return APIResponse(
        data={
            "database": db_check.model_dump(),
            "encryption_service": {
                "status": "operational",
                "algorithm": "AES-256-GCM",
                "key_configured": bool(settings.ENCRYPTION_MASTER_KEY),
            },
            "auth_service": {
                "status": "operational",
                "algorithm": "Argon2id + JWT",
                "jwt_algorithm": settings.JWT_ALGORITHM,
                "token_expire_minutes": settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES,
            },
            "system": {
                "version": settings.APP_VERSION,
                "environment": settings.ENVIRONMENT,
                "python_version": sys.version.split()[0],
                "platform": sys.platform,
            },
            "providers": {
                "total": len(providers),
                "active": sum(1 for p in providers if p.is_enabled),
                "items": [
                    {
                        "id": str(p.id),
                        "name": p.name,
                        "is_active": p.is_enabled,
                        "credentials_count": len(p.credentials) if p.credentials else 0,
                    }
                    for p in providers
                ],
            },
            "credentials": {
                "total": len(credentials),
                "healthy": healthy_count,
                "cooldown": cooldown_count,
                "degraded": degraded_count,
            },
            "circuit_breakers": {
                "total": len(breakers),
                "closed": sum(1 for b in breakers if b.state == "CLOSED"),
                "open": sum(1 for b in breakers if b.state == "OPEN"),
                "half_open": sum(1 for b in breakers if b.state == "HALF_OPEN"),
            },
        }
    )
