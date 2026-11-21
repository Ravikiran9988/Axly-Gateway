from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from pydantic import BaseModel, Field

from app.api.deps import get_current_admin
from app.core.config import get_settings
from app.core.security import create_access_token, hash_password, verify_password
from app.db.dependencies import get_db
from app.middleware.error_handler import APIException
from app.models.admin import Administrator
from app.schemas.auth import AdminProfileResponse, LoginRequest, TokenResponse
from app.schemas.common import APIResponse
from app.services.auth import authenticate_admin

router = APIRouter(prefix="/auth", tags=["Admin Auth"])


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8)


@router.post("/login", response_model=APIResponse[TokenResponse])
async def login_admin(payload: LoginRequest, db: AsyncSession = Depends(get_db)):
    """Authenticates administrator credentials and returns a secure JWT bearer token."""
    admin = await authenticate_admin(db, email=payload.email, password=payload.password)
    if not admin:
        raise APIException(
            code="INVALID_CREDENTIALS",
            message="Invalid email or password",
            status_code=status.HTTP_401_UNAUTHORIZED,
        )

    settings = get_settings()
    token = create_access_token(
        subject=str(admin.id),
        extra_claims={"email": admin.email},
    )

    return APIResponse(
        data=TokenResponse(
            access_token=token,
            token_type="bearer",
            expires_in_seconds=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        ),
        message="Authentication successful",
    )


@router.get("/me", response_model=APIResponse[AdminProfileResponse])
async def get_current_admin_profile(
    current_admin: Administrator = Depends(get_current_admin),
):
    """Retrieves profile information for the currently authenticated administrator."""
    return APIResponse(data=AdminProfileResponse.model_validate(current_admin))


@router.post("/logout", response_model=APIResponse[dict])
async def logout_admin(
    current_admin: Administrator = Depends(get_current_admin),
):
    """Logs out the active administrator session."""
    return APIResponse(message="Successfully logged out")


@router.post("/change-password", response_model=APIResponse[dict])
async def change_admin_password(
    payload: ChangePasswordRequest,
    current_admin: Administrator = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Updates password for the currently logged-in administrator."""
    if not verify_password(payload.current_password, current_admin.hashed_password):
        raise APIException(
            code="INVALID_PASSWORD",
            message="Current password does not match",
            status_code=status.HTTP_400_BAD_REQUEST,
        )

    current_admin.hashed_password = hash_password(payload.new_password)
    db.add(current_admin)
    await db.commit()
    return APIResponse(message="Password changed successfully")
