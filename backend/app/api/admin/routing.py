import uuid
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_admin
from app.db.dependencies import get_db
from app.middleware.error_handler import APIException
from app.models.admin import Administrator
from app.models.model import Model
from app.models.provider import Provider
from app.models.routing import ModelAlias, ModelAliasCandidate, RoutingProfile, RoutingRule
from app.models.routing_history import RoutingHistory
from app.routing.health_tracker import HealthTracker
from app.routing.schemas import (
    ModelAliasCandidateCreate,
    ModelAliasCandidateResponse,
    ModelAliasCreate,
    ModelAliasResponse,
    ModelAliasUpdate,
    ProfilePatch,
    RoutingHistoryResponse,
)
from app.schemas.common import APIResponse
from app.schemas.routing import (
    RoutingProfileCreate,
    RoutingProfileResponse,
)

router = APIRouter(prefix="/routing", tags=["Routing"])


# ==============================================================================
# ROUTING PROFILES
# ==============================================================================

@router.get("/profiles", response_model=APIResponse[List[RoutingProfileResponse]])
async def list_routing_profiles(
    db: AsyncSession = Depends(get_db),
    admin: Administrator = Depends(get_current_admin),
):
    """Lists all routing profiles and their linked rules."""
    stmt = (
        select(RoutingProfile)
        .options(selectinload(RoutingProfile.rules))
        .order_by(RoutingProfile.created_at.asc())
    )
    result = await db.execute(stmt)
    profiles = result.scalars().all()
    return APIResponse(data=[RoutingProfileResponse.model_validate(p) for p in profiles])


@router.post(
    "/profiles",
    response_model=APIResponse[RoutingProfileResponse],
    status_code=status.HTTP_201_CREATED,
)
async def create_routing_profile(
    payload: RoutingProfileCreate,
    db: AsyncSession = Depends(get_db),
    admin: Administrator = Depends(get_current_admin),
):
    """Creates a reusable routing profile."""
    # Check duplicate name
    existing = (
        await db.execute(select(RoutingProfile).where(RoutingProfile.name == payload.name))
    ).scalar_one_or_none()
    if existing:
        raise APIException(
            code="PROFILE_ALREADY_EXISTS",
            message=f"Routing profile with name '{payload.name}' already exists",
            status_code=status.HTTP_409_CONFLICT,
        )

    profile = RoutingProfile(
        name=payload.name,
        description=payload.description,
        strategy=payload.strategy,
        is_default=payload.is_default,
        max_attempts=payload.max_attempts,
        retry_after_cooldown=payload.retry_after_cooldown,
    )
    db.add(profile)
    await db.flush()

    stmt = select(RoutingProfile).options(selectinload(RoutingProfile.rules)).where(RoutingProfile.id == profile.id)
    refetched = (await db.execute(stmt)).scalar_one()
    return APIResponse(
        data=RoutingProfileResponse.model_validate(refetched),
        message="Routing profile created successfully",
    )


@router.patch("/profiles/{profile_id}", response_model=APIResponse[RoutingProfileResponse])
async def update_routing_profile(
    profile_id: uuid.UUID,
    payload: ProfilePatch,
    db: AsyncSession = Depends(get_db),
    admin: Administrator = Depends(get_current_admin),
):
    """Updates a routing profile configuration."""
    stmt = (
        select(RoutingProfile)
        .options(selectinload(RoutingProfile.rules))
        .where(RoutingProfile.id == profile_id)
    )
    profile = (await db.execute(stmt)).scalar_one_or_none()
    if not profile:
        raise APIException(
            code="PROFILE_NOT_FOUND",
            message="Routing profile not found",
            status_code=status.HTTP_404_NOT_FOUND,
        )

    if payload.name is not None:
        profile.name = payload.name
    if payload.description is not None:
        profile.description = payload.description
    if payload.strategy is not None:
        profile.strategy = payload.strategy
    if payload.is_default is not None:
        profile.is_default = payload.is_default
    if payload.max_attempts is not None:
        profile.max_attempts = payload.max_attempts
    if payload.retry_after_cooldown is not None:
        profile.retry_after_cooldown = payload.retry_after_cooldown

    await db.flush()
    return APIResponse(
        data=RoutingProfileResponse.model_validate(profile),
        message="Routing profile updated successfully",
    )


@router.delete("/profiles/{profile_id}", response_model=APIResponse[dict])
async def delete_routing_profile(
    profile_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    admin: Administrator = Depends(get_current_admin),
):
    """Deletes a routing profile."""
    stmt = select(RoutingProfile).where(RoutingProfile.id == profile_id)
    profile = (await db.execute(stmt)).scalar_one_or_none()
    if not profile:
        raise APIException(
            code="PROFILE_NOT_FOUND",
            message="Routing profile not found",
            status_code=status.HTTP_404_NOT_FOUND,
        )

    await db.delete(profile)
    await db.flush()
    return APIResponse(message="Routing profile deleted successfully")


# ==============================================================================
# MODEL ALIASES
# ==============================================================================

@router.get("/aliases", response_model=APIResponse[List[ModelAliasResponse]])
async def list_model_aliases(
    db: AsyncSession = Depends(get_db),
    admin: Administrator = Depends(get_current_admin),
):
    """Lists all configured model routing aliases and their candidate tiers."""
    stmt = (
        select(ModelAlias)
        .options(
            selectinload(ModelAlias.candidates).selectinload(ModelAliasCandidate.provider),
            selectinload(ModelAlias.candidates).selectinload(ModelAliasCandidate.model),
        )
        .order_by(ModelAlias.created_at.asc())
    )
    result = await db.execute(stmt)
    aliases = result.scalars().all()
    return APIResponse(data=[ModelAliasResponse.model_validate(a) for a in aliases])


@router.post(
    "/aliases",
    response_model=APIResponse[ModelAliasResponse],
    status_code=status.HTTP_201_CREATED,
)
async def create_model_alias(
    payload: ModelAliasCreate,
    db: AsyncSession = Depends(get_db),
    admin: Administrator = Depends(get_current_admin),
):
    """Creates a new model alias (e.g. fast, smart, coding, cheap) with candidate ordering."""
    existing = (
        await db.execute(select(ModelAlias).where(ModelAlias.alias_name == payload.alias_name))
    ).scalar_one_or_none()
    if existing:
        raise APIException(
            code="ALIAS_ALREADY_EXISTS",
            message=f"Model alias '{payload.alias_name}' already exists",
            status_code=status.HTTP_409_CONFLICT,
        )

    alias = ModelAlias(
        alias_name=payload.alias_name,
        description=payload.description,
        profile_id=payload.profile_id,
        is_enabled=payload.is_enabled,
        max_attempts=payload.max_attempts,
        timeout_seconds=payload.timeout_seconds,
        required_capabilities=payload.required_capabilities or {},
    )
    db.add(alias)
    await db.flush()

    # Add candidates
    for cand in payload.candidates:
        # Validate that provider and model exist
        prov = (await db.execute(select(Provider).where(Provider.id == cand.provider_id))).scalar_one_or_none()
        if not prov:
            raise APIException(
                code="PROVIDER_NOT_FOUND",
                message=f"Provider ID {cand.provider_id} not found in catalog",
                status_code=status.HTTP_404_NOT_FOUND,
            )
        mod = (await db.execute(select(Model).where(Model.id == cand.model_id))).scalar_one_or_none()
        if not mod:
            raise APIException(
                code="MODEL_NOT_FOUND",
                message=f"Model ID {cand.model_id} not found in catalog",
                status_code=status.HTTP_404_NOT_FOUND,
            )

        candidate_record = ModelAliasCandidate(
            alias_id=alias.id,
            provider_id=cand.provider_id,
            model_id=cand.model_id,
            priority=cand.priority,
            weight=cand.weight,
            is_active=cand.is_active,
        )
        db.add(candidate_record)

    await db.flush()

    # Re-fetch with loaded relationships
    stmt = (
        select(ModelAlias)
        .options(
            selectinload(ModelAlias.candidates).selectinload(ModelAliasCandidate.provider),
            selectinload(ModelAlias.candidates).selectinload(ModelAliasCandidate.model),
        )
        .where(ModelAlias.id == alias.id)
    )
    refetched = (await db.execute(stmt)).scalar_one()
    return APIResponse(
        data=ModelAliasResponse.model_validate(refetched),
        message=f"Model alias '{alias.alias_name}' created successfully",
    )


@router.patch("/aliases/{alias_id}", response_model=APIResponse[ModelAliasResponse])
async def update_model_alias(
    alias_id: uuid.UUID,
    payload: ModelAliasUpdate,
    db: AsyncSession = Depends(get_db),
    admin: Administrator = Depends(get_current_admin),
):
    """Updates model alias settings, profile binding, or enabled status."""
    stmt = (
        select(ModelAlias)
        .options(
            selectinload(ModelAlias.candidates).selectinload(ModelAliasCandidate.provider),
            selectinload(ModelAlias.candidates).selectinload(ModelAliasCandidate.model),
        )
        .where(ModelAlias.id == alias_id)
    )
    alias = (await db.execute(stmt)).scalar_one_or_none()
    if not alias:
        raise APIException(
            code="ALIAS_NOT_FOUND",
            message="Model alias not found",
            status_code=status.HTTP_404_NOT_FOUND,
        )

    if payload.alias_name is not None:
        alias.alias_name = payload.alias_name
    if payload.description is not None:
        alias.description = payload.description
    if payload.profile_id is not None:
        alias.profile_id = payload.profile_id
    if payload.is_enabled is not None:
        alias.is_enabled = payload.is_enabled
    if payload.max_attempts is not None:
        alias.max_attempts = payload.max_attempts
    if payload.timeout_seconds is not None:
        alias.timeout_seconds = payload.timeout_seconds
    if payload.required_capabilities is not None:
        alias.required_capabilities = payload.required_capabilities

    await db.flush()
    return APIResponse(
        data=ModelAliasResponse.model_validate(alias),
        message="Model alias updated successfully",
    )


@router.delete("/aliases/{alias_id}", response_model=APIResponse[dict])
async def delete_model_alias(
    alias_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    admin: Administrator = Depends(get_current_admin),
):
    """Permanently deletes a model alias and its candidate mappings."""
    stmt = select(ModelAlias).where(ModelAlias.id == alias_id)
    alias = (await db.execute(stmt)).scalar_one_or_none()
    if not alias:
        raise APIException(
            code="ALIAS_NOT_FOUND",
            message="Model alias not found",
            status_code=status.HTTP_404_NOT_FOUND,
        )

    await db.delete(alias)
    await db.flush()
    return APIResponse(message="Model alias deleted successfully")


@router.post(
    "/aliases/{alias_id}/candidates",
    response_model=APIResponse[ModelAliasCandidateResponse],
    status_code=status.HTTP_201_CREATED,
)
async def add_alias_candidate(
    alias_id: uuid.UUID,
    payload: ModelAliasCandidateCreate,
    db: AsyncSession = Depends(get_db),
    admin: Administrator = Depends(get_current_admin),
):
    """Appends a new candidate provider/model to an existing alias."""
    alias = (await db.execute(select(ModelAlias).where(ModelAlias.id == alias_id))).scalar_one_or_none()
    if not alias:
        raise APIException(code="ALIAS_NOT_FOUND", message="Model alias not found", status_code=status.HTTP_404_NOT_FOUND)

    cand = ModelAliasCandidate(
        alias_id=alias_id,
        provider_id=payload.provider_id,
        model_id=payload.model_id,
        priority=payload.priority,
        weight=payload.weight,
        is_active=payload.is_active,
    )
    db.add(cand)
    await db.flush()

    return APIResponse(
        data=ModelAliasCandidateResponse.model_validate(cand),
        message="Candidate added to alias",
    )


@router.delete("/aliases/{alias_id}/candidates/{candidate_id}", response_model=APIResponse[dict])
async def remove_alias_candidate(
    alias_id: uuid.UUID,
    candidate_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    admin: Administrator = Depends(get_current_admin),
):
    """Removes a candidate provider/model from an alias."""
    stmt = select(ModelAliasCandidate).where(
        ModelAliasCandidate.id == candidate_id,
        ModelAliasCandidate.alias_id == alias_id,
    )
    cand = (await db.execute(stmt)).scalar_one_or_none()
    if not cand:
        raise APIException(code="CANDIDATE_NOT_FOUND", message="Candidate not found", status_code=status.HTTP_404_NOT_FOUND)

    await db.delete(cand)
    await db.flush()
    return APIResponse(message="Candidate removed from alias")


# ==============================================================================
# ROUTING HEALTH & OBSERVABILITY
# ==============================================================================

@router.get("/health", response_model=APIResponse[Dict[str, Any]])
async def get_routing_health(
    db: AsyncSession = Depends(get_db),
    admin: Administrator = Depends(get_current_admin),
):
    """Returns real-time health overview across providers, credentials, circuit breakers, and quota groups."""
    overview = await HealthTracker.get_system_health_overview(db)
    return APIResponse(data=overview)


@router.get("/history", response_model=APIResponse[List[RoutingHistoryResponse]])
async def list_routing_history(
    request_id: Optional[str] = Query(default=None, description="Filter by client request ID"),
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
    admin: Administrator = Depends(get_current_admin),
):
    """
    Returns auditable routing history traces.
    Explains provider selection, failure reasons, cooldown applications, and circuit-breaker states.
    Strictly redacts sensitive keys and secrets.
    """
    stmt = select(RoutingHistory).order_by(desc(RoutingHistory.created_at)).limit(limit).offset(offset)
    if request_id:
        stmt = stmt.where(RoutingHistory.request_id == request_id)

    result = await db.execute(stmt)
    records = result.scalars().all()
    return APIResponse(data=[RoutingHistoryResponse.model_validate(r) for r in records])
