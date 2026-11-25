from datetime import datetime, timezone
import time
import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_admin
from app.db.dependencies import get_db
from app.middleware.error_handler import APIException
from app.models.admin import Administrator
from app.models.credential import ProviderCredential
from app.models.health import CredentialHealth
from app.models.provider import Provider
from app.providers.exceptions import ProviderError
from app.providers.registry import get_provider_registry
from app.routing.cooldown_manager import CooldownManager
from app.schemas.common import APIResponse
from app.schemas.credential import (
    CredentialCooldownRequest,
    CredentialCreate,
    CredentialHealthResponse,
    CredentialRecoverRequest,
    CredentialResponse,
    CredentialUpdate,
)
from app.services.encryption import CredentialEncryptionService, get_encryption_service

router = APIRouter(prefix="/credentials", tags=["Credentials"])


@router.get("", response_model=APIResponse[List[CredentialResponse]])
async def list_credentials(
    db: AsyncSession = Depends(get_db),
    admin: Administrator = Depends(get_current_admin),
):
    """Lists provider credentials with masked key previews. Raw secrets are NEVER returned."""
    stmt = (
        select(ProviderCredential)
        .options(selectinload(ProviderCredential.health))
        .order_by(ProviderCredential.priority.asc(), ProviderCredential.created_at.desc())
    )
    result = await db.execute(stmt)
    creds = result.scalars().all()
    return APIResponse(data=[CredentialResponse.model_validate(c) for c in creds])


@router.post("", response_model=APIResponse[CredentialResponse], status_code=status.HTTP_201_CREATED)
async def create_credential(
    payload: CredentialCreate,
    db: AsyncSession = Depends(get_db),
    admin: Administrator = Depends(get_current_admin),
):
    """
    Encrypts provider API key using authenticated AES-256-GCM and stores ciphertext.
    Initializes a linked CredentialHealth record.
    """
    if not payload.provider_id:
        raise APIException(
            code="PROVIDER_REQUIRED",
            message="provider_id is required",
            status_code=status.HTTP_400_BAD_REQUEST,
        )

    provider = (await db.execute(select(Provider).where(Provider.id == payload.provider_id))).scalar_one_or_none()
    if not provider:
        raise APIException(
            code="PROVIDER_NOT_FOUND",
            message="Specified provider does not exist",
            status_code=status.HTTP_404_NOT_FOUND,
        )

    encryption_service = get_encryption_service()
    encrypted_key = encryption_service.encrypt(payload.api_key)
    preview = CredentialEncryptionService.mask_secret(payload.api_key)

    credential = ProviderCredential(
        provider_id=payload.provider_id,
        quota_group_id=payload.quota_group_id,
        label=payload.label,
        encrypted_api_key=encrypted_key,
        key_preview=preview,
        priority=payload.priority,
        rate_limit_rpm=payload.rate_limit_rpm,
        rate_limit_tpm=payload.rate_limit_tpm,
        is_active=True,
    )
    db.add(credential)
    await db.flush()

    health = CredentialHealth(credential_id=credential.id, status="healthy")
    db.add(health)
    await db.flush()

    # Re-fetch with health
    stmt = select(ProviderCredential).options(selectinload(ProviderCredential.health)).where(ProviderCredential.id == credential.id)
    refetched = (await db.execute(stmt)).scalar_one()

    return APIResponse(
        data=CredentialResponse.model_validate(refetched),
        message="Credential securely encrypted and stored",
    )


@router.patch("/{credential_id}", response_model=APIResponse[CredentialResponse])
async def update_credential(
    credential_id: uuid.UUID,
    payload: CredentialUpdate,
    db: AsyncSession = Depends(get_db),
    admin: Administrator = Depends(get_current_admin),
):
    """Updates credential label, rate limits, status, priority, or replaces the encrypted API key."""
    stmt = (
        select(ProviderCredential)
        .options(selectinload(ProviderCredential.health))
        .where(ProviderCredential.id == credential_id)
    )
    cred = (await db.execute(stmt)).scalar_one_or_none()
    if not cred:
        raise APIException(
            code="CREDENTIAL_NOT_FOUND",
            message="Credential not found",
            status_code=status.HTTP_404_NOT_FOUND,
        )

    if payload.label is not None:
        cred.label = payload.label
    if payload.quota_group_id is not None:
        cred.quota_group_id = payload.quota_group_id
    if payload.is_active is not None:
        cred.is_active = payload.is_active
    if payload.priority is not None:
        cred.priority = payload.priority
    if payload.rate_limit_rpm is not None:
        cred.rate_limit_rpm = payload.rate_limit_rpm
    if payload.rate_limit_tpm is not None:
        cred.rate_limit_tpm = payload.rate_limit_tpm

    if payload.api_key:
        encryption_service = get_encryption_service()
        cred.encrypted_api_key = encryption_service.encrypt(payload.api_key)
        cred.key_preview = CredentialEncryptionService.mask_secret(payload.api_key)

    db.add(cred)
    await db.flush()
    return APIResponse(
        data=CredentialResponse.model_validate(cred),
        message="Credential updated successfully",
    )


@router.get("/{credential_id}/health", response_model=APIResponse[CredentialHealthResponse])
async def get_credential_health(
    credential_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    admin: Administrator = Depends(get_current_admin),
):
    """Retrieves detailed real-time health, failure counters, and cooldown state for a credential."""
    stmt = select(CredentialHealth).where(CredentialHealth.credential_id == credential_id)
    health = (await db.execute(stmt)).scalar_one_or_none()
    if not health:
        cred_stmt = select(ProviderCredential).where(ProviderCredential.id == credential_id)
        cred = (await db.execute(cred_stmt)).scalar_one_or_none()
        if not cred:
            raise APIException(
                code="HEALTH_NOT_FOUND",
                message="Health record not found for credential",
                status_code=status.HTTP_404_NOT_FOUND,
            )
        health = CredentialHealth(
            credential_id=cred.id,
            status="healthy" if cred.is_active else "disabled",
        )
        db.add(health)
        await db.commit()
        await db.refresh(health)

    return APIResponse(data=CredentialHealthResponse.model_validate(health))


@router.post("/{credential_id}/cooldown", response_model=APIResponse[CredentialHealthResponse])
async def apply_manual_cooldown(
    credential_id: uuid.UUID,
    payload: CredentialCooldownRequest,
    db: AsyncSession = Depends(get_db),
    admin: Administrator = Depends(get_current_admin),
):
    """Manually places a credential into cooldown with a custom duration and reason."""
    health = await CooldownManager.manual_override_cooldown(
        db, credential_id, payload.duration_seconds, payload.reason
    )
    return APIResponse(
        data=CredentialHealthResponse.model_validate(health),
        message=f"Credential placed in manual cooldown for {payload.duration_seconds}s",
    )


@router.post("/{credential_id}/recover", response_model=APIResponse[CredentialHealthResponse])
async def recover_credential(
    credential_id: uuid.UUID,
    payload: Optional[CredentialRecoverRequest] = None,
    db: AsyncSession = Depends(get_db),
    admin: Administrator = Depends(get_current_admin),
):
    """
    Manually recovers a credential from cooldown or failure status.
    SAFETY GUARD: If credential has authentication failure, requires successful upstream validation first.
    """
    validate_upstream = payload.validate_upstream if payload else True

    # Check existing health status
    stmt = (
        select(ProviderCredential)
        .options(
            selectinload(ProviderCredential.provider),
            selectinload(ProviderCredential.health),
        )
        .where(ProviderCredential.id == credential_id)
    )
    cred = (await db.execute(stmt)).scalar_one_or_none()
    if not cred:
        raise APIException(code="CREDENTIAL_NOT_FOUND", message="Credential not found", status_code=status.HTTP_404_NOT_FOUND)

    is_auth_failure = cred.health and cred.health.status == "authentication_failure"

    if is_auth_failure and validate_upstream:
        # Validate key against provider before clearing auth failure
        encryption_service = get_encryption_service()
        raw_key = encryption_service.decrypt(cred.encrypted_api_key)
        registry = get_provider_registry()
        adapter = registry.get(cred.provider.name, base_url=cred.provider.base_url)
        try:
            await adapter.validate_credentials(raw_key)
        except Exception as exc:
            raise APIException(
                code="AUTHENTICATION_FAILED",
                message=f"Cannot recover credential: upstream validation rejected key: {exc}",
                status_code=status.HTTP_400_BAD_REQUEST,
            )

    health = await CooldownManager.manual_recover_credential(
        db, credential_id, force_auth_reset=True
    )
    return APIResponse(
        data=CredentialHealthResponse.model_validate(health),
        message="Credential recovered to healthy status",
    )


@router.post("/{credential_id}/test", response_model=APIResponse[dict])
async def test_credential_connectivity(
    credential_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    admin: Administrator = Depends(get_current_admin),
):
    """
    Tests upstream connectivity for a credential by decrypting the API key in memory
    and invoking the corresponding provider adapter's validate_credentials method.
    Updates the linked CredentialHealth record.
    """
    stmt = (
        select(ProviderCredential)
        .options(
            selectinload(ProviderCredential.provider),
            selectinload(ProviderCredential.health),
        )
        .where(ProviderCredential.id == credential_id)
    )
    cred = (await db.execute(stmt)).scalar_one_or_none()
    if not cred:
        raise APIException(
            code="CREDENTIAL_NOT_FOUND",
            message="Credential not found",
            status_code=status.HTTP_404_NOT_FOUND,
        )

    encryption_service = get_encryption_service()
    raw_api_key = encryption_service.decrypt(cred.encrypted_api_key)

    registry = get_provider_registry()
    adapter = registry.get(cred.provider.name, base_url=cred.provider.base_url)

    health_record = cred.health
    if not health_record:
        health_record = CredentialHealth(credential_id=cred.id)
        db.add(health_record)

    start_time = time.perf_counter()
    try:
        await adapter.validate_credentials(raw_api_key)
        latency_ms = (time.perf_counter() - start_time) * 1000.0

        health_record.status = "healthy"
        health_record.consecutive_failures = 0
        health_record.consecutive_cooldowns = 0
        health_record.cooldown_until = None
        health_record.response_time_ms = round(latency_ms, 2)
        health_record.last_checked_at = datetime.now(timezone.utc)
        health_record.last_success_at = datetime.now(timezone.utc)
        health_record.last_error_code = None
        health_record.last_error_message = None
        db.add(health_record)
        await db.flush()

        return APIResponse(
            data={
                "status": "healthy",
                "latency_ms": round(latency_ms, 2),
                "provider": cred.provider.name,
                "label": cred.label,
            },
            message=f"Credential connected successfully to {cred.provider.display_name}",
        )
    except ProviderError as pe:
        latency_ms = (time.perf_counter() - start_time) * 1000.0
        health_record.status = "authentication_failure" if pe.status_code == 401 else "error"
        health_record.consecutive_failures += 1
        health_record.response_time_ms = round(latency_ms, 2)
        health_record.last_checked_at = datetime.now(timezone.utc)
        health_record.last_failure_at = datetime.now(timezone.utc)
        health_record.last_error_code = pe.code
        health_record.last_error_message = pe.message
        db.add(health_record)
        await db.flush()

        raise APIException(
            code=pe.code,
            message=f"Credential test failed: {pe.message}",
            status_code=pe.status_code,
            details={"latency_ms": round(latency_ms, 2), "provider": cred.provider.name},
        )


@router.delete("/{credential_id}", response_model=APIResponse[dict])
async def delete_credential(
    credential_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    admin: Administrator = Depends(get_current_admin),
):
    """Permanently removes a credential."""
    stmt = select(ProviderCredential).where(ProviderCredential.id == credential_id)
    cred = (await db.execute(stmt)).scalar_one_or_none()
    if not cred:
        raise APIException(
            code="CREDENTIAL_NOT_FOUND",
            message="Credential not found",
            status_code=status.HTTP_404_NOT_FOUND,
        )

    await db.delete(cred)
    await db.flush()
    return APIResponse(message="Credential removed successfully")
