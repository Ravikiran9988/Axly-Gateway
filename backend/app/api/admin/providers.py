import time
import uuid
from urllib.parse import urlsplit
from typing import List
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
from app.models.model import Model
from app.models.provider import Provider
from app.providers.exceptions import ProviderError
from app.providers.registry import get_provider_registry
from app.schemas.common import APIResponse
from app.schemas.credential import CredentialCreate, CredentialResponse
from app.schemas.model import ModelResponse
from app.schemas.provider import ProviderCreate, ProviderResponse, ProviderUpdate
from app.services.encryption import CredentialEncryptionService, get_encryption_service

router = APIRouter(prefix="/providers", tags=["Providers"])


@router.get("", response_model=APIResponse[List[ProviderResponse]])
async def list_providers(
    db: AsyncSession = Depends(get_db),
    admin: Administrator = Depends(get_current_admin),
):
    """Lists configured LLM providers."""
    stmt = select(Provider).order_by(Provider.display_name.asc())
    result = await db.execute(stmt)
    providers = result.scalars().all()
    return APIResponse(data=[ProviderResponse.model_validate(p) for p in providers])


@router.post("", response_model=APIResponse[ProviderResponse], status_code=status.HTTP_201_CREATED)
async def create_provider(
    payload: ProviderCreate,
    db: AsyncSession = Depends(get_db),
    admin: Administrator = Depends(get_current_admin),
):
    """Registers a new LLM provider definition."""
    stmt = select(Provider).where(Provider.name == payload.name.lower())
    existing = (await db.execute(stmt)).scalar_one_or_none()
    if existing:
        raise APIException(
            code="PROVIDER_EXISTS",
            message=f"Provider with name '{payload.name}' already exists",
            status_code=status.HTTP_409_CONFLICT,
        )

    provider = Provider(
        name=payload.name.lower(),
        display_name=payload.display_name,
        description=payload.description,
        base_url=payload.base_url,
        is_enabled=payload.is_enabled,
        config_schema=payload.config_schema or {},
    )
    db.add(provider)
    await db.flush()
    return APIResponse(
        data=ProviderResponse.model_validate(provider),
        message="Provider registered successfully",
    )


@router.get("/{provider_id}", response_model=APIResponse[ProviderResponse])
async def get_provider(
    provider_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    admin: Administrator = Depends(get_current_admin),
):
    """Retrieves a provider by ID."""
    stmt = select(Provider).where(Provider.id == provider_id)
    provider = (await db.execute(stmt)).scalar_one_or_none()
    if not provider:
        raise APIException(
            code="PROVIDER_NOT_FOUND",
            message="Provider not found",
            status_code=status.HTTP_404_NOT_FOUND,
        )
    return APIResponse(data=ProviderResponse.model_validate(provider))


@router.patch("/{provider_id}", response_model=APIResponse[ProviderResponse])
async def update_provider(
    provider_id: uuid.UUID,
    payload: ProviderUpdate,
    db: AsyncSession = Depends(get_db),
    admin: Administrator = Depends(get_current_admin),
):
    """Updates an existing provider definition."""
    stmt = select(Provider).where(Provider.id == provider_id)
    provider = (await db.execute(stmt)).scalar_one_or_none()
    if not provider:
        raise APIException(
            code="PROVIDER_NOT_FOUND",
            message="Provider not found",
            status_code=status.HTTP_404_NOT_FOUND,
        )

    if "base_url" in payload.model_fields_set and payload.base_url:
        parsed = urlsplit(payload.base_url)
        expected_hosts = {
            "gemini": "generativelanguage.googleapis.com",
            "groq": "api.groq.com",
            "openai": "api.openai.com",
        }
        if (
            parsed.scheme != "https"
            or parsed.hostname != expected_hosts.get(provider.name.lower())
            or parsed.username
            or parsed.password
            or parsed.query
            or parsed.fragment
            or parsed.port not in (None, 443)
        ):
            raise APIException(
                code="INVALID_PROVIDER_BASE_URL",
                message="base_url must use HTTPS and the official hostname for this provider",
                status_code=status.HTTP_400_BAD_REQUEST,
            )

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(provider, field, value)

    db.add(provider)
    await db.flush()
    return APIResponse(
        data=ProviderResponse.model_validate(provider),
        message="Provider updated successfully",
    )


@router.delete("/{provider_id}", response_model=APIResponse[dict])
async def delete_provider(
    provider_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    admin: Administrator = Depends(get_current_admin),
):
    """Permanently deletes a provider along with associated credentials and models."""
    stmt = select(Provider).where(Provider.id == provider_id)
    provider = (await db.execute(stmt)).scalar_one_or_none()
    if not provider:
        raise APIException(
            code="PROVIDER_NOT_FOUND",
            message="Provider not found",
            status_code=status.HTTP_404_NOT_FOUND,
        )

    await db.delete(provider)
    await db.flush()
    return APIResponse(message="Provider deleted successfully")


@router.get("/{provider_id}/credentials", response_model=APIResponse[List[CredentialResponse]])
async def list_provider_credentials(
    provider_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    admin: Administrator = Depends(get_current_admin),
):
    """Lists credentials associated with a specific provider."""
    stmt = (
        select(ProviderCredential)
        .where(ProviderCredential.provider_id == provider_id)
        .order_by(ProviderCredential.created_at.desc())
    )
    result = await db.execute(stmt)
    creds = result.scalars().all()
    return APIResponse(data=[CredentialResponse.model_validate(c) for c in creds])


@router.post(
    "/{provider_id}/credentials",
    response_model=APIResponse[CredentialResponse],
    status_code=status.HTTP_201_CREATED,
)
async def create_provider_credential(
    provider_id: uuid.UUID,
    payload: CredentialCreate,
    db: AsyncSession = Depends(get_db),
    admin: Administrator = Depends(get_current_admin),
):
    """Adds a new encrypted credential under the specified provider."""
    provider = (await db.execute(select(Provider).where(Provider.id == provider_id))).scalar_one_or_none()
    if not provider:
        raise APIException(
            code="PROVIDER_NOT_FOUND",
            message="Provider not found",
            status_code=status.HTTP_404_NOT_FOUND,
        )

    encryption_service = get_encryption_service()
    encrypted_key = encryption_service.encrypt(payload.api_key)
    preview = CredentialEncryptionService.mask_secret(payload.api_key)

    credential = ProviderCredential(
        provider_id=provider_id,
        quota_group_id=payload.quota_group_id,
        label=payload.label,
        encrypted_api_key=encrypted_key,
        key_preview=preview,
        rate_limit_rpm=payload.rate_limit_rpm,
        rate_limit_tpm=payload.rate_limit_tpm,
        is_active=True,
    )
    db.add(credential)
    await db.flush()

    health = CredentialHealth(credential_id=credential.id, status="healthy")
    db.add(health)
    await db.flush()

    return APIResponse(
        data=CredentialResponse.model_validate(credential),
        message="Provider credential encrypted and added successfully",
    )


@router.post("/{provider_id}/discover-models", response_model=APIResponse[List[ModelResponse]])
async def discover_provider_models(
    provider_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    admin: Administrator = Depends(get_current_admin),
):
    """
    Connects to the upstream provider, queries supported models, and populates the model catalog.
    """
    stmt = (
        select(Provider)
        .options(selectinload(Provider.credentials))
        .where(Provider.id == provider_id)
    )
    provider = (await db.execute(stmt)).scalar_one_or_none()
    if not provider:
        raise APIException(
            code="PROVIDER_NOT_FOUND",
            message="Provider not found",
            status_code=status.HTTP_404_NOT_FOUND,
        )

    # Find active credential
    active_cred = next((c for c in provider.credentials if c.is_active), None)
    if not active_cred:
        raise APIException(
            code="NO_ACTIVE_CREDENTIAL",
            message=f"No active credential configured for provider '{provider.name}' to discover models",
            status_code=status.HTTP_400_BAD_REQUEST,
        )

    encryption_service = get_encryption_service()
    api_key = encryption_service.decrypt(active_cred.encrypted_api_key)

    registry = get_provider_registry()
    adapter = registry.get(provider.name, base_url=provider.base_url)

    try:
        discovered_cards = await adapter.discover_models(api_key)
    except ProviderError as pe:
        raise APIException(
            code=pe.code,
            message=f"Upstream model discovery failed: {pe.message}",
            status_code=pe.status_code,
            details=pe.details,
        )

    updated_models: List[Model] = []
    for card in discovered_cards:
        # Check if already registered
        m_stmt = select(Model).where(
            Model.provider_id == provider.id,
            Model.model_identifier == card.id,
        )
        existing_model = (await db.execute(m_stmt)).scalar_one_or_none()

        if existing_model:
            if card.context_window:
                existing_model.context_window = card.context_window
            if card.capabilities:
                existing_model.capabilities = card.capabilities
            db.add(existing_model)
            updated_models.append(existing_model)
        else:
            new_model = Model(
                provider_id=provider.id,
                model_identifier=card.id,
                display_name=card.id,
                context_window=card.context_window or 8192,
                capabilities=card.capabilities or {},
                is_enabled=True,
            )
            db.add(new_model)
            updated_models.append(new_model)

    await db.flush()
    return APIResponse(
        data=[ModelResponse.model_validate(m) for m in updated_models],
        message=f"Discovered and registered {len(updated_models)} models from {provider.name}",
    )
