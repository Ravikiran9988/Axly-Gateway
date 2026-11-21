import uuid
from typing import List
from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_admin
from app.db.dependencies import get_db
from app.middleware.error_handler import APIException
from app.models.admin import Administrator
from app.models.model import Model
from app.models.provider import Provider
from app.schemas.common import APIResponse
from app.schemas.model import ModelCreate, ModelResponse, ModelUpdate

router = APIRouter(prefix="/models", tags=["Models"])


@router.get("", response_model=APIResponse[List[ModelResponse]])
async def list_models(
    db: AsyncSession = Depends(get_db),
    admin: Administrator = Depends(get_current_admin),
):
    """Lists registered models."""
    stmt = select(Model).order_by(Model.display_name.asc())
    result = await db.execute(stmt)
    models = result.scalars().all()
    return APIResponse(data=[ModelResponse.model_validate(m) for m in models])


@router.post("", response_model=APIResponse[ModelResponse], status_code=status.HTTP_201_CREATED)
async def create_model(
    payload: ModelCreate,
    db: AsyncSession = Depends(get_db),
    admin: Administrator = Depends(get_current_admin),
):
    """Registers a new model under a provider."""
    provider = (await db.execute(select(Provider).where(Provider.id == payload.provider_id))).scalar_one_or_none()
    if not provider:
        raise APIException(
            code="PROVIDER_NOT_FOUND",
            message="Provider not found",
            status_code=status.HTTP_404_NOT_FOUND,
        )

    model = Model(
        provider_id=payload.provider_id,
        model_identifier=payload.model_identifier,
        display_name=payload.display_name,
        context_window=payload.context_window,
        is_enabled=payload.is_enabled,
        input_price_per_million=payload.input_price_per_million,
        output_price_per_million=payload.output_price_per_million,
        capabilities=payload.capabilities or {},
    )
    db.add(model)
    await db.flush()
    return APIResponse(
        data=ModelResponse.model_validate(model),
        message="Model registered successfully",
    )


@router.get("/{model_id}", response_model=APIResponse[ModelResponse])
async def get_model(
    model_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    admin: Administrator = Depends(get_current_admin),
):
    """Retrieves model by ID."""
    stmt = select(Model).where(Model.id == model_id)
    model = (await db.execute(stmt)).scalar_one_or_none()
    if not model:
        raise APIException(
            code="MODEL_NOT_FOUND",
            message="Model not found",
            status_code=status.HTTP_404_NOT_FOUND,
        )
    return APIResponse(data=ModelResponse.model_validate(model))


@router.patch("/{model_id}", response_model=APIResponse[ModelResponse])
async def update_model(
    model_id: uuid.UUID,
    payload: ModelUpdate,
    db: AsyncSession = Depends(get_db),
    admin: Administrator = Depends(get_current_admin),
):
    """Updates model parameters, enabled status, pricing, and capabilities."""
    stmt = select(Model).where(Model.id == model_id)
    model = (await db.execute(stmt)).scalar_one_or_none()
    if not model:
        raise APIException(
            code="MODEL_NOT_FOUND",
            message="Model not found",
            status_code=status.HTTP_404_NOT_FOUND,
        )

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(model, field, value)

    db.add(model)
    await db.flush()
    return APIResponse(
        data=ModelResponse.model_validate(model),
        message="Model updated successfully",
    )


@router.delete("/{model_id}", response_model=APIResponse[dict])
async def delete_model(
    model_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    admin: Administrator = Depends(get_current_admin),
):
    """Deletes model from catalog."""
    stmt = select(Model).where(Model.id == model_id)
    model = (await db.execute(stmt)).scalar_one_or_none()
    if not model:
        raise APIException(
            code="MODEL_NOT_FOUND",
            message="Model not found",
            status_code=status.HTTP_404_NOT_FOUND,
        )

    await db.delete(model)
    await db.flush()
    return APIResponse(message="Model removed successfully")
