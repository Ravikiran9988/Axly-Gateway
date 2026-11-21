from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.db.dependencies import get_db
from app.middleware.error_handler import APIException
from app.schemas.auth import SetupRequest, SetupStatusResponse
from app.schemas.common import APIResponse
from app.services.auth import AdminServiceError, create_initial_admin, is_setup_required

router = APIRouter(prefix="/setup", tags=["Setup"])


@router.get("/status", response_model=APIResponse[SetupStatusResponse])
async def get_setup_status(db: AsyncSession = Depends(get_db)):
    """Checks whether AXLY Gateway requires first-run administrator initialization."""
    settings = get_settings()
    required = await is_setup_required(db)
    return APIResponse(
        data=SetupStatusResponse(
            is_setup_required=required,
            app_name=settings.APP_NAME,
            version=settings.APP_VERSION,
        )
    )


@router.post("", response_model=APIResponse[dict], status_code=status.HTTP_201_CREATED)
async def complete_initial_setup(payload: SetupRequest, db: AsyncSession = Depends(get_db)):
    """Creates the primary administrator for AXLY Gateway during first-time setup."""
    try:
        admin = await create_initial_admin(db, email=payload.email, password=payload.password)
        return APIResponse(
            message="Administrator account initialized successfully",
            data={"admin_id": str(admin.id), "email": admin.email},
        )
    except AdminServiceError as exc:
        raise APIException(
            code="SETUP_LOCKED",
            message=str(exc),
            status_code=status.HTTP_400_BAD_REQUEST,
        )
