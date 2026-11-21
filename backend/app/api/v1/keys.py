import uuid
from typing import List
from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_admin
from app.db.dependencies import get_db
from app.middleware.error_handler import APIException
from app.models.admin import Administrator
from app.schemas.common import APIResponse
from app.schemas.gateway_key import (
    GatewayKeyCreate,
    GatewayKeyCreatedResponse,
    GatewayKeyResponse,
)
from app.services.key_service import (
    create_gateway_key,
    list_gateway_keys,
    revoke_gateway_key,
)

router = APIRouter(prefix="/keys", tags=["Gateway API Keys"])


@router.post("", response_model=APIResponse[GatewayKeyCreatedResponse], status_code=status.HTTP_201_CREATED)
async def generate_key(
    payload: GatewayKeyCreate,
    db: AsyncSession = Depends(get_db),
    admin: Administrator = Depends(get_current_admin),
):
    """
    Generates a cryptographically secure Gateway API Key.
    The raw secret key is returned ONLY ONCE in this response.
    Only the SHA-256 hash is retained on the server.
    """
    key_record, raw_key = await create_gateway_key(
        db,
        label=payload.label,
        rate_limit_rpm=payload.rate_limit_rpm,
        expires_at=payload.expires_at,
    )

    response_data = GatewayKeyCreatedResponse(
        id=key_record.id,
        label=key_record.label,
        key_preview=key_record.key_preview,
        is_active=key_record.is_active,
        rate_limit_rpm=key_record.rate_limit_rpm,
        expires_at=key_record.expires_at,
        last_used_at=key_record.last_used_at,
        created_at=key_record.created_at,
        updated_at=key_record.updated_at,
        raw_key=raw_key,
    )

    return APIResponse(
        data=response_data,
        message="Gateway API key created successfully. Store raw_key securely; it will not be displayed again.",
    )


@router.get("", response_model=APIResponse[List[GatewayKeyResponse]])
async def get_keys(
    db: AsyncSession = Depends(get_db),
    admin: Administrator = Depends(get_current_admin),
):
    """Lists all created gateway API keys with masked previews and usage states."""
    keys = await list_gateway_keys(db)
    return APIResponse(data=[GatewayKeyResponse.model_validate(k) for k in keys])


@router.delete("/{key_id}", response_model=APIResponse[dict])
async def revoke_key(
    key_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    admin: Administrator = Depends(get_current_admin),
):
    """Revokes a gateway API key, immediately preventing further access."""
    success = await revoke_gateway_key(db, key_id)
    if not success:
        raise APIException(
            code="KEY_NOT_FOUND",
            message="Gateway API key not found",
            status_code=status.HTTP_404_NOT_FOUND,
        )
    return APIResponse(message="Gateway API key revoked successfully")
