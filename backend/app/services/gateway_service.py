import asyncio
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
from app.models.routing_history import RoutingHistory
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
    estimated_cost_usd: float = 0.0,
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
                estimated_cost_usd=estimated_cost_usd,
                error_message=error_message,
                ip_address=ip_address,
            )
            session.add(record)
            await session.commit()
    except Exception as e:
        logger.error(f"Failed to record request log [req_id:{request_id}]: {e}")


async def estimate_request_cost(
    db: AsyncSession,
    provider_id: Optional[uuid.UUID],
    model_identifier: str,
    prompt_tokens: int,
    completion_tokens: int,
) -> float:
    """Estimate USD cost from configured per-million-token model prices.

    A zero estimate means pricing is not configured; it is not provider billing data.
    """
    if not provider_id or not model_identifier:
        return 0.0
    stmt = select(
        Model.input_price_per_million,
        Model.output_price_per_million,
    ).where(
        Model.provider_id == provider_id,
        func.lower(Model.model_identifier) == model_identifier.lower(),
    )
    row = (await db.execute(stmt)).one_or_none()
    if row is None:
        return 0.0
    input_price = float(row.input_price_per_million or 0.0)
    output_price = float(row.output_price_per_million or 0.0)
    return round(
        (prompt_tokens * input_price + completion_tokens * output_price) / 1_000_000,
        10,
    )


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
        prompt_tokens = usage.prompt_tokens if usage else 0
        completion_tokens = usage.completion_tokens if usage else 0
        try:
            estimated_cost = await estimate_request_cost(
                db,
                decision.selected_provider_id,
                decision.selected_model or request.model,
                prompt_tokens,
                completion_tokens,
            )
        except Exception:
            # Cost estimation is informational; it must not turn an upstream success into HTTP 500.
            logger.exception("Cost estimation failed [req_id:%s]", request_id)
            estimated_cost = 0.0
            try:
                await db.rollback()
            except Exception:
                logger.exception("Database rollback failed after cost estimation [req_id:%s]", request_id)

        await log_request_record(
            request_id=request_id,
            gateway_key_id=gateway_key.id if gateway_key else None,
            provider_id=decision.selected_provider_id,
            model_identifier=decision.selected_model or request.model,
            status_code=200,
            latency_ms=round(latency_ms, 2),
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            total_tokens=usage.total_tokens if usage else 0,
            estimated_cost_usd=estimated_cost,
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

    started = time.perf_counter()
    prompt_tokens = 0
    completion_tokens = 0
    total_tokens = 0
    stream_error: Optional[str] = None
    client_cancelled = False
    completed = False

    try:
        async for chunk_str in RoutingEngine.stream_chat(
            db=db,
            request=request,
            gateway_key=gateway_key,
            request_id=request_id,
            ip_address=ip_address,
        ):
            for line in chunk_str.splitlines():
                if not line.startswith("data:"):
                    continue
                payload = line[5:].strip()
                if not payload or payload == "[DONE]":
                    continue
                try:
                    event = json.loads(payload)
                except json.JSONDecodeError:
                    continue
                if event.get("error"):
                    stream_error = str(event["error"].get("message", "Upstream stream error"))
                usage = event.get("usage") or {}
                prompt_tokens = max(prompt_tokens, int(usage.get("prompt_tokens") or 0))
                completion_tokens = max(completion_tokens, int(usage.get("completion_tokens") or 0))
                total_tokens = max(total_tokens, int(usage.get("total_tokens") or 0))
            yield chunk_str
        completed = True
    except asyncio.CancelledError:
        client_cancelled = True
        raise
    finally:
        latency_ms = round((time.perf_counter() - started) * 1000.0, 2)
        route = None
        provider_id = None
        model_identifier = request.model
        status_code = 499 if client_cancelled else (502 if stream_error else 200)
        try:
            route_stmt = (
                select(RoutingHistory)
                .where(RoutingHistory.request_id == request_id)
                .order_by(RoutingHistory.attempt_number.desc(), RoutingHistory.created_at.desc())
            )
            route = (await db.execute(route_stmt)).scalars().first()
            if route:
                model_identifier = route.model_identifier
                provider_id = (
                    await db.execute(select(Provider.id).where(Provider.name == route.provider_name))
                ).scalar_one_or_none()
                if route.result != "success" and not client_cancelled and not stream_error:
                    status_code = 503
            elif not client_cancelled and not stream_error:
                status_code = 503

            estimated_cost = await estimate_request_cost(
                db, provider_id, model_identifier, prompt_tokens, completion_tokens
            )
            await log_request_record(
                request_id=request_id,
                gateway_key_id=gateway_key.id if gateway_key else None,
                provider_id=provider_id,
                model_identifier=model_identifier,
                status_code=status_code,
                latency_ms=latency_ms,
                prompt_tokens=prompt_tokens,
                completion_tokens=completion_tokens,
                total_tokens=total_tokens,
                estimated_cost_usd=estimated_cost,
                error_message=stream_error or ("Client cancelled stream" if client_cancelled else None),
                ip_address=ip_address,
            )
        except Exception:
            logger.exception("Failed to persist streaming request log [req_id:%s]", request_id)
