import uuid
from typing import List
from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_admin
from app.db.dependencies import get_db
from app.middleware.error_handler import APIException
from app.models.admin import Administrator
from app.models.provider import Provider
from app.models.quota import QuotaGroup
from app.routing.quota_manager import QuotaManager
from app.routing.schemas import (
    CredentialCooldownRequest,
    QuotaGroupCreate,
    QuotaGroupResponse,
    QuotaGroupUpdate,
)
from app.schemas.common import APIResponse

router = APIRouter(prefix="/quota-groups", tags=["Quota Groups"])


@router.get("", response_model=APIResponse[List[QuotaGroupResponse]])
async def list_quota_groups(
    db: AsyncSession = Depends(get_db),
    admin: Administrator = Depends(get_current_admin),
):
    """Lists all configured shared quota groups."""
    stmt = select(QuotaGroup).order_by(QuotaGroup.created_at.asc())
    result = await db.execute(stmt)
    groups = result.scalars().all()
    return APIResponse(data=[QuotaGroupResponse.model_validate(g) for g in groups])


@router.post("", response_model=APIResponse[QuotaGroupResponse], status_code=status.HTTP_201_CREATED)
async def create_quota_group(
    payload: QuotaGroupCreate,
    db: AsyncSession = Depends(get_db),
    admin: Administrator = Depends(get_current_admin),
):
    """Creates a shared quota group (project, org, or provider level)."""
    existing = (
        await db.execute(select(QuotaGroup).where(QuotaGroup.name == payload.name))
    ).scalar_one_or_none()
    if existing:
        raise APIException(
            code="QUOTA_GROUP_EXISTS",
            message=f"Quota group '{payload.name}' already exists",
            status_code=status.HTTP_409_CONFLICT,
        )

    if payload.provider_id:
        prov = (await db.execute(select(Provider).where(Provider.id == payload.provider_id))).scalar_one_or_none()
        if not prov:
            raise APIException(code="PROVIDER_NOT_FOUND", message="Specified provider does not exist", status_code=status.HTTP_404_NOT_FOUND)

    qg = QuotaGroup(
        name=payload.name,
        description=payload.description,
        provider_id=payload.provider_id,
        scope_type=payload.scope_type,
        tier_level=payload.tier_level,
        monthly_budget_usd=payload.monthly_budget_usd,
        reset_day_of_month=payload.reset_day_of_month,
        policy=payload.policy or {},
        associated_models=payload.associated_models or {},
        status="healthy",
    )
    db.add(qg)
    await db.flush()

    return APIResponse(
        data=QuotaGroupResponse.model_validate(qg),
        message="Quota group created successfully",
    )


@router.patch("/{quota_group_id}", response_model=APIResponse[QuotaGroupResponse])
async def update_quota_group(
    quota_group_id: uuid.UUID,
    payload: QuotaGroupUpdate,
    db: AsyncSession = Depends(get_db),
    admin: Administrator = Depends(get_current_admin),
):
    """Updates shared quota group configuration or status."""
    stmt = select(QuotaGroup).where(QuotaGroup.id == quota_group_id)
    qg = (await db.execute(stmt)).scalar_one_or_none()
    if not qg:
        raise APIException(code="QUOTA_GROUP_NOT_FOUND", message="Quota group not found", status_code=status.HTTP_404_NOT_FOUND)

    if payload.name is not None:
        qg.name = payload.name
    if payload.description is not None:
        qg.description = payload.description
    if payload.provider_id is not None:
        qg.provider_id = payload.provider_id
    if payload.scope_type is not None:
        qg.scope_type = payload.scope_type
    if payload.tier_level is not None:
        qg.tier_level = payload.tier_level
    if payload.monthly_budget_usd is not None:
        qg.monthly_budget_usd = payload.monthly_budget_usd
    if payload.reset_day_of_month is not None:
        qg.reset_day_of_month = payload.reset_day_of_month
    if payload.status is not None:
        qg.status = payload.status
    if payload.policy is not None:
        qg.policy = payload.policy
    if payload.associated_models is not None:
        qg.associated_models = payload.associated_models

    await db.flush()
    return APIResponse(
        data=QuotaGroupResponse.model_validate(qg),
        message="Quota group updated successfully",
    )


@router.post("/{quota_group_id}/cooldown", response_model=APIResponse[QuotaGroupResponse])
async def apply_quota_group_cooldown(
    quota_group_id: uuid.UUID,
    payload: CredentialCooldownRequest,
    db: AsyncSession = Depends(get_db),
    admin: Administrator = Depends(get_current_admin),
):
    """Manually places a quota group into cooldown."""
    qg = await QuotaManager.manual_cooldown_quota_group(
        db, quota_group_id, payload.duration_seconds, payload.reason
    )
    return APIResponse(
        data=QuotaGroupResponse.model_validate(qg),
        message=f"Quota group placed into manual cooldown for {payload.duration_seconds}s",
    )


@router.post("/{quota_group_id}/recover", response_model=APIResponse[QuotaGroupResponse])
async def recover_quota_group(
    quota_group_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    admin: Administrator = Depends(get_current_admin),
):
    """Manually clears cooldown on a shared quota group."""
    qg = await QuotaManager.manual_recover_quota_group(db, quota_group_id)
    return APIResponse(
        data=QuotaGroupResponse.model_validate(qg),
        message="Quota group manually recovered to healthy status",
    )


@router.delete("/{quota_group_id}", response_model=APIResponse[dict])
async def delete_quota_group(
    quota_group_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    admin: Administrator = Depends(get_current_admin),
):
    """Deletes a quota group."""
    stmt = select(QuotaGroup).where(QuotaGroup.id == quota_group_id)
    qg = (await db.execute(stmt)).scalar_one_or_none()
    if not qg:
        raise APIException(code="QUOTA_GROUP_NOT_FOUND", message="Quota group not found", status_code=status.HTTP_404_NOT_FOUND)

    await db.delete(qg)
    await db.flush()
    return APIResponse(message="Quota group deleted successfully")
