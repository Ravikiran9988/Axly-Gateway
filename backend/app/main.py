import time
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from fastapi import Depends, FastAPI, Response, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.admin.router import router as admin_router
from app.api.v1.router import router as v1_router
from app.core.config import get_settings
from app.core.logging import setup_logging
from app.db.dependencies import get_db
from app.middleware.error_handler import register_exception_handlers
from app.middleware.rate_limit import RateLimitMiddleware
from app.middleware.request_id import RequestIdMiddleware
from app.schemas.common import HealthResponse, ReadyResponse
from app.services.system_service import check_database_readiness

settings = get_settings()
logger = setup_logging(settings.LOG_LEVEL)

# Track application start time for uptime measurement
_app_start_time = time.time()


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info(
        f"Starting {settings.APP_NAME} v{settings.APP_VERSION} [environment: {settings.ENVIRONMENT}]"
    )
    yield
    logger.info(f"Shutting down {settings.APP_NAME}")


app = FastAPI(
    title=settings.APP_NAME,
    description="The unified LLM gateway for your AI apps. One API. Intelligent Routing. Reliable Failover.",
    version=settings.APP_VERSION,
    lifespan=lifespan,
    docs_url="/docs" if settings.DEBUG or settings.ENVIRONMENT != "production" else None,
    redoc_url="/redoc" if settings.DEBUG or settings.ENVIRONMENT != "production" else None,
)

# Register Exception Handlers
register_exception_handlers(app)

# Register Middlewares
app.add_middleware(RequestIdMiddleware)
app.add_middleware(RateLimitMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount API Routers
app.include_router(v1_router, prefix="/v1")
app.include_router(v1_router, prefix="/api/v1")
app.include_router(admin_router, prefix="/api")
app.include_router(admin_router, prefix="")


# ------------------------------------------------------------------------------
# Core System Endpoints
# ------------------------------------------------------------------------------
@app.get("/", tags=["Root"])
async def root():
    return {
        "name": settings.APP_NAME,
        "tagline": "One API. Intelligent Routing. Reliable Failover.",
        "description": "The unified LLM gateway for your AI apps.",
        "version": settings.APP_VERSION,
        "status": "online",
        "docs": "/docs" if settings.DEBUG or settings.ENVIRONMENT != "production" else None,
    }


@app.get("/health", response_model=HealthResponse, tags=["Health"])
async def health():
    """
    Liveness probe.
    Reports whether the application process is running and responsive.
    """
    uptime = time.time() - _app_start_time
    return HealthResponse(
        status="ok",
        version=settings.APP_VERSION,
        environment=settings.ENVIRONMENT,
        uptime_seconds=round(uptime, 2),
        timestamp=datetime.now(timezone.utc),
    )


@app.get("/ready", response_model=ReadyResponse, tags=["Health"])
async def readiness(response: Response, db: AsyncSession = Depends(get_db)):
    """
    Readiness probe.
    Verifies that required backing dependencies (specifically PostgreSQL connectivity)
    are reachable and responsive before accepting traffic.
    """
    db_ok, db_check = await check_database_readiness(db)
    is_ready = db_ok

    if not is_ready:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE

    return ReadyResponse(
        ready=is_ready,
        status="ready" if is_ready else "not_ready",
        checks={
            "database": db_check,
        },
        timestamp=datetime.now(timezone.utc),
    )
