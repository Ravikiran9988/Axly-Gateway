import json
import logging
import time
import uuid
from datetime import datetime, timezone
from typing import AsyncGenerator, Optional, Tuple
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.session import AsyncSessionLocal
from app.models.credential import ProviderCredential
from app.models.gateway_key import GatewayApiKey
from app.models.logs import RequestLog
from app.models.model import Model
from app.models.provider import Provider
from app.models.usage import UsageRecord
from app.providers.exceptions import (
    AuthenticationError,
    ModelNotFoundError,
    ProviderError,
    ProviderUnavailableError,
)
from app.providers.registry import get_provider_registry
from app.providers.schemas import (
    ChatCompletionChunk,
    ChatCompletionRequest,
    ChatCompletionResponse,
)
from app.services.encryption import get_encryption_service

logger = logging.getLogger("axly.gateway")


async def log_request_record(
    request_id: str,
    gateway_key_id: Optional[uuid.UUID],
    provider_id: Optional[uuid.UUID],
    model_identifier: str,
    status_code: int,
    latency_ms: float,
    prompt_tokens: int = 0,
    completion_tokens: int = 0,
    total_tokens: int = 0,
    error_message: Optional[str] = None,
    ip_address: Optional[str] = None,
) -> None:
    """Asynchronously logs request outcome to database."""
    try:
        async with AsyncSessionLocal() as session:
            record = RequestLog(
                request_id=request_id,
                gateway_key_id=gateway_key_id,
                provider_id=provider_id,
                model_identifier=model_identifier,
                status_code=status_code,
                latency_ms=latency_ms,
                prompt_tokens=prompt_tokens,
                completion_tokens=completion_tokens,
                total_tokens=total_tokens,
                error_message=error_message,
                ip_address=ip_address,
            )
            session.add(record)
            await session.commit()
    except Exception as e:
        logger.error(f"Failed to record request log [req_id:{request_id}]: {e}")


async def resolve_provider_and_credential(
    db: AsyncSession, model_name: str
) -> Tuple[Provider, ProviderCredential, str]:
    """
    Finds the active provider and decrypts an active credential for the requested model.
    """
    encryption_service = get_encryption_service()
    registry = get_provider_registry()

    # 1. First search in registered database models
    clean_model = model_name.strip()
    stmt = (
        select(Model)
        .options(selectinload(Model.provider))
        .where(
            func.lower(Model.model_identifier) == clean_model.lower(),
            Model.is_enabled == True,
        )
    )
    result = await db.execute(stmt)
    model_record = result.scalar_one_or_none()

    provider: Optional[Provider] = None
    if model_record and model_record.provider:
        provider = model_record.provider
    else:
        # 2. If not found as explicit model row, resolve via name prefix heuristic
        provider_name = registry.resolve_provider_for_model(clean_model)
        p_stmt = select(Provider).where(
            func.lower(Provider.name) == provider_name.lower(),
            Provider.is_enabled == True,
        )
        provider = (await db.execute(p_stmt)).scalar_one_or_none()

    if not provider:
        raise ModelNotFoundError(
            f"No enabled provider configured for model '{model_name}'.",
            provider="gateway",
        )

    # 3. Retrieve active credential for this provider
    c_stmt = (
        select(ProviderCredential)
        .where(
            ProviderCredential.provider_id == provider.id,
            ProviderCredential.is_active == True,
        )
        .order_by(ProviderCredential.created_at.asc())
    )
    c_result = await db.execute(c_stmt)
    credential = c_result.scalar_one_or_none()

    if not credential:
        raise AuthenticationError(
            f"No active credentials configured for provider '{provider.name}'. Please configure a credential in Settings.",
            provider=provider.name,
        )

    # 4. Decrypt the API key
    try:
        decrypted_api_key = encryption_service.decrypt(credential.encrypted_api_key)
    except Exception as exc:
        raise AuthenticationError(
            f"Failed to decrypt credentials for provider '{provider.name}'",
            provider=provider.name,
        ) from exc

    return provider, credential, decrypted_api_key


async def execute_chat_completion(
    db: AsyncSession,
    request: ChatCompletionRequest,
    gateway_key: GatewayApiKey,
    request_id: str,
    ip_address: Optional[str] = None,
) -> ChatCompletionResponse:
    """Executes a chat completion request through the intelligent routing and failover engine."""
    start_time = time.perf_counter()
    from app.routing.engine import RoutingEngine

    try:
        response, decision = await RoutingEngine.complete_chat(
            db=db,
            request=request,
            gateway_key=gateway_key,
            request_id=request_id,
            ip_address=ip_address,
        )
        latency_ms = (time.perf_counter() - start_time) * 1000.0
        usage = response.usage
        await log_request_record(
            request_id=request_id,
            gateway_key_id=gateway_key.id if gateway_key else None,
            provider_id=decision.selected_credential_id,
            model_identifier=decision.selected_model or request.model,
            status_code=200,
            latency_ms=round(latency_ms, 2),
            prompt_tokens=usage.prompt_tokens if usage else 0,
            completion_tokens=usage.completion_tokens if usage else 0,
            total_tokens=usage.total_tokens if usage else 0,
            ip_address=ip_address,
        )
        return response
    except ProviderError as pe:
        latency_ms = (time.perf_counter() - start_time) * 1000.0
        await log_request_record(
            request_id=request_id,
            gateway_key_id=gateway_key.id if gateway_key else None,
            provider_id=None,
            model_identifier=request.model,
            status_code=pe.status_code,
            latency_ms=round(latency_ms, 2),
            error_message=pe.message,
            ip_address=ip_address,
        )
        raise
    except Exception as exc:
        latency_ms = (time.perf_counter() - start_time) * 1000.0
        await log_request_record(
            request_id=request_id,
            gateway_key_id=gateway_key.id if gateway_key else None,
            provider_id=None,
            model_identifier=request.model,
            status_code=500,
            latency_ms=round(latency_ms, 2),
            error_message=str(exc),
            ip_address=ip_address,
        )
        raise ProviderUnavailableError(
            f"Unexpected gateway failure executing chat completion: {exc}",
            provider="gateway",
        ) from exc


async def execute_stream_completion(
    db: AsyncSession,
    request: ChatCompletionRequest,
    gateway_key: GatewayApiKey,
    request_id: str,
    ip_address: Optional[str] = None,
) -> AsyncGenerator[str, None]:
    """
    Executes a streaming chat completion request through the intelligent routing engine.
    Supports pre-first-chunk failover and adheres to strict mid-stream stability guarantees.
    """
    from app.routing.engine import RoutingEngine
    async for chunk_str in RoutingEngine.stream_chat(
        db=db,
        request=request,
        gateway_key=gateway_key,
        request_id=request_id,
        ip_address=ip_address,
    ):
        yield chunk_str
