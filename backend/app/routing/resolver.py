import logging
import uuid
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.model import Model
from app.models.provider import Provider
from app.models.routing import ModelAlias, ModelAliasCandidate, RoutingProfile
from app.providers.exceptions import ModelNotFoundError
from app.providers.registry import get_provider_registry
from app.routing.schemas import RoutingCandidate

logger = logging.getLogger("axly.routing.resolver")


class ResolvedRoutingTarget(BaseModel):
    requested_name: str
    is_alias: bool
    alias_name: Optional[str] = None
    profile_name: Optional[str] = None
    strategy: str = "priority"
    max_attempts: int = 3
    timeout_seconds: float = 30.0
    required_capabilities: Dict[str, Any] = Field(default_factory=dict)
    candidates: List[RoutingCandidate] = Field(default_factory=list)


class ModelResolver:
    """
    Resolves a requested model name into an alias or explicit model configuration.
    Fetches candidate providers/models from the database catalog.
    """

    @classmethod
    async def resolve(
        cls,
        db: AsyncSession,
        requested_model: str,
    ) -> ResolvedRoutingTarget:
        """
        Resolves model or alias name against database models and aliases.
        Raises ModelNotFoundError if no enabled candidate or model exists.
        """
        clean_name = requested_model.strip()

        # 1. Check for configured Model Alias
        alias_stmt = (
            select(ModelAlias)
            .options(
                selectinload(ModelAlias.profile),
                selectinload(ModelAlias.candidates).selectinload(ModelAliasCandidate.provider),
                selectinload(ModelAlias.candidates).selectinload(ModelAliasCandidate.model),
            )
            .where(
                func.lower(ModelAlias.alias_name) == clean_name.lower(),
                ModelAlias.is_enabled == True,
            )
        )
        alias_result = await db.execute(alias_stmt)
        alias = alias_result.scalar_one_or_none()

        if alias:
            profile = alias.profile
            strategy = profile.strategy if profile else "priority"
            max_attempts = alias.max_attempts or (profile.max_attempts if profile else 3)
            candidates: List[RoutingCandidate] = []

            for cand_row in alias.candidates:
                if not cand_row.is_active:
                    continue
                provider = cand_row.provider
                model = cand_row.model
                if not provider or not provider.is_enabled:
                    continue
                if not model or not model.is_enabled:
                    continue

                candidates.append(
                    RoutingCandidate(
                        provider_name=provider.name,
                        provider_id=provider.id,
                        base_url=provider.base_url,
                        model_identifier=model.model_identifier,
                        model_id=model.id,
                        priority=cand_row.priority,
                        weight=cand_row.weight,
                        capabilities=model.capabilities or {},
                        is_active=True,
                    )
                )

            if not candidates:
                raise ModelNotFoundError(
                    f"Model alias '{clean_name}' has no active enabled candidates configured.",
                    provider="gateway",
                )

            return ResolvedRoutingTarget(
                requested_name=clean_name,
                is_alias=True,
                alias_name=alias.alias_name,
                profile_name=profile.name if profile else None,
                strategy=strategy,
                max_attempts=max_attempts,
                timeout_seconds=alias.timeout_seconds,
                required_capabilities=alias.required_capabilities or {},
                candidates=candidates,
            )

        # 2. Check for explicit Model in catalog
        model_stmt = (
            select(Model)
            .options(selectinload(Model.provider))
            .where(
                func.lower(Model.model_identifier) == clean_name.lower(),
                Model.is_enabled == True,
            )
        )
        model_row = (await db.execute(model_stmt)).scalar_one_or_none()

        if model_row and model_row.provider and model_row.provider.is_enabled:
            provider = model_row.provider
            candidate = RoutingCandidate(
                provider_name=provider.name,
                provider_id=provider.id,
                base_url=provider.base_url,
                model_identifier=model_row.model_identifier,
                model_id=model_row.id,
                priority=1,
                capabilities=model_row.capabilities or {},
                is_active=True,
            )
            return ResolvedRoutingTarget(
                requested_name=clean_name,
                is_alias=False,
                strategy="manual",
                max_attempts=1,
                timeout_seconds=30.0,
                candidates=[candidate],
            )

        # 3. Check via prefix/heuristic (e.g. 'gemini/gemini-1.5-flash' or standard model names)
        registry = get_provider_registry()
        inferred_provider_name = registry.resolve_provider_for_model(clean_name)
        p_stmt = select(Provider).where(
            func.lower(Provider.name) == inferred_provider_name.lower(),
            Provider.is_enabled == True,
        )
        prov = (await db.execute(p_stmt)).scalar_one_or_none()

        if prov:
            # Strip provider prefix if present for upstream call (e.g. 'groq/llama-3.1-8b-instant' -> 'llama-3.1-8b-instant')
            upstream_model = clean_name
            if "/" in clean_name:
                upstream_model = clean_name.split("/", 1)[1]

            candidate = RoutingCandidate(
                provider_name=prov.name,
                provider_id=prov.id,
                base_url=prov.base_url,
                model_identifier=upstream_model,
                model_id=uuid.uuid4(),  # Synthetic model ID for uncataloged explicit request
                priority=1,
                is_active=True,
            )
            return ResolvedRoutingTarget(
                requested_name=clean_name,
                is_alias=False,
                strategy="manual",
                max_attempts=1,
                timeout_seconds=30.0,
                candidates=[candidate],
            )

        raise ModelNotFoundError(
            f"Model or alias '{clean_name}' not found, disabled, or no matching provider enabled.",
            provider="gateway",
        )
