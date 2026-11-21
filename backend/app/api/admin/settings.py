from typing import List
from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_admin
from app.db.dependencies import get_db
from app.models.admin import Administrator
from app.models.settings import SystemSetting
from app.schemas.common import APIResponse
from app.schemas.settings import SystemSettingResponse, SystemSettingUpdate

router = APIRouter(prefix="/settings", tags=["Settings"])


@router.get("", response_model=APIResponse[List[SystemSettingResponse]])
async def list_settings(
    db: AsyncSession = Depends(get_db),
    admin: Administrator = Depends(get_current_admin),
):
    """Lists system settings."""
    stmt = select(SystemSetting).order_by(SystemSetting.key.asc())
    result = await db.execute(stmt)
    settings = result.scalars().all()
    # Mask secret values
    output = []
    for s in settings:
        data = SystemSettingResponse.model_validate(s)
        if s.is_secret:
            data.value = {"masked": "********"}
        output.append(data)
    return APIResponse(data=output)


@router.put("/{key}", response_model=APIResponse[SystemSettingResponse])
async def update_setting(
    key: str,
    payload: SystemSettingUpdate,
    db: AsyncSession = Depends(get_db),
    admin: Administrator = Depends(get_current_admin),
):
    """Updates a system setting."""
    stmt = select(SystemSetting).where(SystemSetting.key == key)
    setting = (await db.execute(stmt)).scalar_one_or_none()
    if not setting:
        setting = SystemSetting(key=key, value=payload.value, description=payload.description)
        db.add(setting)
    else:
        setting.value = payload.value
        if payload.description is not None:
            setting.description = payload.description
        db.add(setting)

    await db.flush()
    return APIResponse(data=SystemSettingResponse.model_validate(setting), message="Setting saved")
