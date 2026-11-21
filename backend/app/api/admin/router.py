from fastapi import APIRouter

from app.api.admin.setup import router as setup_router
from app.api.admin.auth import router as auth_router
from app.api.admin.providers import router as providers_router
from app.api.admin.credentials import router as credentials_router
from app.api.admin.models import router as models_router
from app.api.admin.routing import router as routing_router
from app.api.admin.settings import router as settings_router
from app.api.admin.health import router as health_router
from app.api.admin.quota_groups import router as quota_groups_router
from app.api.admin.circuit_breakers import router as circuit_breakers_router
from app.api.admin.logs import router as logs_router
from app.api.admin.analytics import router as analytics_router

router = APIRouter(prefix="/admin")

router.include_router(setup_router)
router.include_router(auth_router)
router.include_router(providers_router)
router.include_router(credentials_router)
router.include_router(models_router)
router.include_router(routing_router)
router.include_router(settings_router)
router.include_router(health_router)
router.include_router(quota_groups_router)
router.include_router(circuit_breakers_router)
router.include_router(logs_router)
router.include_router(analytics_router)
