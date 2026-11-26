import json
import logging
import time
from collections import deque
import uuid
from typing import AsyncGenerator, Optional, Tuple
from fastapi import Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.base import utc_now
from app.models.gateway_key import GatewayApiKey
from app.models.routing_history import RoutingHistory
from app.providers.exceptions import (
    ProviderError,
    ProviderUnavailableError,
)
from app.providers.registry import get_provider_registry
from app.providers.schemas import (
    ChatCompletionChunk,
    ChatCompletionRequest,
    ChatCompletionResponse,
)
from app.routing.candidate_selector import CandidateSelector
from app.routing.circuit_breaker import CircuitBreakerManager
from app.routing.credential_selector import CredentialSelector
from app.routing.error_classifier import ErrorClassifier
from app.routing.failover_executor import FailoverExecutor
from app.routing.health_tracker import HealthTracker
from app.routing.resolver import ModelResolver, ResolvedRoutingTarget
from app.routing.retry_controller import RetryController
from app.routing.schemas import AttemptRecord, RoutingDecision

logger = logging.getLogger("axly.routing.engine")


class RoutingEngine:
    """
    Intelligent routing and automatic failover engine for AXLY Gateway.
    Coordinates model resolution, candidate prioritization, credential selection,
    health tracking, circuit breakers, bounded retry/fallback, and streaming resilience.
    """

    @classmethod
    async def complete_chat(
        cls,
        db: AsyncSession,
        request: ChatCompletionRequest,
        gateway_key: Optional[GatewayApiKey] = None,
        request_id: Optional[str] = None,
        raw_request: Optional[Request] = None,
        ip_address: Optional[str] = None,
    ) -> Tuple[ChatCompletionResponse, RoutingDecision]:
        """
        Executes a non-streaming chat completion request through the intelligent routing engine.
        """
        req_id = request_id or str(uuid.uuid4())

        # 1. Resolve requested model or alias
        resolved: ResolvedRoutingTarget = await ModelResolver.resolve(db, request.model)

        # 2. Execute bounded failover workflow
        response, decision = await FailoverExecutor.execute_chat(
            db=db,
            resolved=resolved,
            request=request,
            request_id=req_id,
            raw_request=raw_request,
            ip_address=ip_address,
        )

        return response, decision

    @classmethod
    async def stream_chat(
        cls,
        db: AsyncSession,
        request: ChatCompletionRequest,
        gateway_key: Optional[GatewayApiKey] = None,
        request_id: Optional[str] = None,
        raw_request: Optional[Request] = None,
        ip_address: Optional[str] = None,
    ) -> AsyncGenerator[str, None]:
        """
        Executes a streaming chat completion with pre-first-chunk failover resilience.
        
        STREAMING BEHAVIOR GUARANTEE:
        - Before the first response chunk reaches the client, candidate failover is permitted
          if upstream connection or authorization fails.
        - Once chunks start reaching the client, the provider stream is strictly locked to prevent
          token duplication or incoherent switching. If mid-stream failure occurs, the stream terminates
          safely with an SSE error chunk and [DONE].
        """
        req_id = request_id or str(uuid.uuid4())
        start_mono = time.monotonic()
        start_time = utc_now()

        # 1. Resolve requested model or alias
        resolved: ResolvedRoutingTarget = await ModelResolver.resolve(db, request.model)
        ordered_candidates = CandidateSelector.filter_and_order_candidates(
            resolved.candidates,
            strategy=resolved.strategy,
            required_capabilities=resolved.required_capabilities,
        )

        attempt_records = []
        attempted_credential_ids = set()
        attempt_number = 0

        first_chunk_emitted = False
        active_candidate = None
        active_credential = None
        prompt_tokens = 0
        completion_tokens = 0
        total_tokens = 0

        # Try sibling credentials before moving to the next provider/model candidate.
        queue = deque(ordered_candidates)
        while queue:
            cand = queue.popleft()
            pair_key = f"{cand.provider_name}:{cand.model_identifier}".lower()

            # Circuit breaker check
            cb_allowed, cb_reason = await CircuitBreakerManager.can_execute(db, "provider", cand.provider_name)
            if not cb_allowed:
                attempt_records.append(
                    AttemptRecord(
                        attempt_number=attempt_number + 1,
                        provider_name=cand.provider_name,
                        model_identifier=cand.model_identifier,
                        started_at=utc_now(),
                        ended_at=utc_now(),
                        result="circuit_broken",
                        exclusion_reason=cb_reason,
                        circuit_breaker_state="OPEN",
                    )
                )
                continue

            # Credential selection
            credential, exclusion_log = await CredentialSelector.select_eligible_credential(
                db, cand.provider_id, excluded_credential_ids=attempted_credential_ids
            )
            if not credential:
                exclusion_reasons = "; ".join(e["reason"] for e in exclusion_log)
                attempt_records.append(
                    AttemptRecord(
                        attempt_number=attempt_number + 1,
                        provider_name=cand.provider_name,
                        model_identifier=cand.model_identifier,
                        started_at=utc_now(),
                        ended_at=utc_now(),
                        result="skipped",
                        exclusion_reason=f"No eligible credentials: {exclusion_reasons}",
                    )
                )
                continue

            attempt_number += 1
            attempted_credential_ids.add(credential.credential_id)
            active_candidate = cand
            active_credential = credential

            attempt_start_mono = time.monotonic()
            attempt_start_dt = utc_now()

            registry = get_provider_registry()
            adapter = registry.get(cand.provider_name, base_url=cand.base_url)
            upstream_request = request.model_copy(update={"model": cand.model_identifier})

            # Attempt stream initialization
            stream_iter = None
            try:
                stream_iter = adapter.stream_chat(upstream_request, credential.decrypted_api_key)

                # Fetch initial chunk to verify upstream stream connectivity prior to yielding to client
                first_chunk = await stream_iter.__anext__()

                # Pre-first chunk succeeded! Lock stream to this candidate
                first_chunk_emitted = True
                try:
                    await CircuitBreakerManager.record_success(db, "provider", cand.provider_name)
                    await db.commit()
                except Exception:
                    logger.exception("[req:%s] Breaker success bookkeeping failed for %s", req_id, cand.provider_name)
                    try:
                        await db.rollback()
                    except Exception:
                        logger.exception("[req:%s] Database rollback failed", req_id)

                # Yield initial chunk (preserve requested model name for alias requests)
                if resolved.is_alias:
                    first_chunk.model = resolved.requested_name
                if first_chunk.usage:
                    prompt_tokens = first_chunk.usage.prompt_tokens or prompt_tokens
                    completion_tokens = first_chunk.usage.completion_tokens or completion_tokens
                    total_tokens = first_chunk.usage.total_tokens or total_tokens

                yield f"data: {first_chunk.model_dump_json(exclude_none=True)}\n\n"

                # Yield subsequent chunks
                try:
                    async for chunk in stream_iter:
                        if resolved.is_alias:
                            chunk.model = resolved.requested_name
                        if chunk.usage:
                            prompt_tokens = chunk.usage.prompt_tokens or prompt_tokens
                            completion_tokens = chunk.usage.completion_tokens or completion_tokens
                            total_tokens = chunk.usage.total_tokens or total_tokens
                        yield f"data: {chunk.model_dump_json(exclude_none=True)}\n\n"

                    yield "data: [DONE]\n\n"

                except Exception as stream_err:
                    logger.error(f"[req:{req_id}] Mid-stream failure on {cand.provider_name}: {stream_err}")
                    classification = ErrorClassifier.classify(
                        stream_err, provider_name=cand.provider_name
                    )
                    attempt_latency = (time.monotonic() - attempt_start_mono) * 1000.0
                    cooldown_sec = None
                    try:
                        await CircuitBreakerManager.record_failure(
                            db,
                            "provider",
                            cand.provider_name,
                            classification.reason,
                            classification=classification,
                        )
                        cooldown_sec = await HealthTracker.record_attempt_result(
                            db=db,
                            credential_id=credential.credential_id,
                            provider_name=cand.provider_name,
                            quota_group_id=credential.quota_group_id,
                            success=False,
                            latency_ms=attempt_latency,
                            classification=classification,
                        )
                        await db.commit()
                    except Exception:
                        logger.exception("[req:%s] Mid-stream failure bookkeeping failed", req_id)
                        try:
                            await db.rollback()
                        except Exception:
                            logger.exception("[req:%s] Database rollback failed", req_id)
                    attempt_records.append(
                        AttemptRecord(
                            attempt_number=attempt_number,
                            provider_name=cand.provider_name,
                            model_identifier=cand.model_identifier,
                            credential_id=credential.credential_id,
                            credential_label=credential.label,
                            started_at=attempt_start_dt,
                            ended_at=utc_now(),
                            latency_ms=round(attempt_latency, 2),
                            result="failure",
                            status_code=classification.status_code,
                            error_category=classification.category.value,
                            error_message=classification.reason,
                            retry_decision="none",
                            cooldown_applied=bool(cooldown_sec and cooldown_sec > 0),
                            cooldown_seconds=cooldown_sec,
                        )
                    )
                    decision = RoutingDecision(
                        request_id=req_id,
                        requested_model_or_alias=resolved.requested_name,
                        resolved_profile=resolved.profile_name,
                        routing_strategy=resolved.strategy,
                        selected_provider=cand.provider_name,
                        selected_provider_id=cand.provider_id,
                        selected_model=cand.model_identifier,
                        selected_credential_id=credential.credential_id,
                        selected_credential_label=credential.label,
                        attempts=attempt_records,
                        total_latency_ms=round((time.monotonic() - start_mono) * 1000.0, 2),
                        success=False,
                        failure_reason=classification.reason,
                        final_status_code=classification.status_code,
                    )
                    await FailoverExecutor._persist_history(db, decision)
                    error_payload = {
                        "error": {
                            "message": f"Stream interrupted mid-generation: {stream_err}",
                            "type": "upstream_stream_error",
                            "code": "STREAM_INTERRUPTED",
                        }
                    }
                    yield f"data: {json.dumps(error_payload)}\n\n"
                    yield "data: [DONE]\n\n"
                    return

                # Record attempt success
                attempt_latency = (time.monotonic() - attempt_start_mono) * 1000.0
                try:
                    await HealthTracker.record_attempt_result(
                        db=db,
                        credential_id=credential.credential_id,
                        provider_name=cand.provider_name,
                        quota_group_id=credential.quota_group_id,
                        success=True,
                        latency_ms=attempt_latency,
                        tokens_count=total_tokens,
                    )
                    await db.commit()
                except Exception:
                    logger.exception("[req:%s] Stream success bookkeeping failed for %s", req_id, cand.provider_name)
                    try:
                        await db.rollback()
                    except Exception:
                        logger.exception("[req:%s] Database rollback failed", req_id)
                attempt_records.append(
                    AttemptRecord(
                        attempt_number=attempt_number,
                        provider_name=cand.provider_name,
                        model_identifier=cand.model_identifier,
                        credential_id=credential.credential_id,
                        credential_label=credential.label,
                        started_at=attempt_start_dt,
                        ended_at=utc_now(),
                        latency_ms=round(attempt_latency, 2),
                        result="success",
                        status_code=200,
                        retry_decision="none",
                    )
                )

                decision = RoutingDecision(
                    request_id=req_id,
                    requested_model_or_alias=resolved.requested_name,
                    resolved_profile=resolved.profile_name,
                    routing_strategy=resolved.strategy,
                    selected_provider=cand.provider_name,
                    selected_provider_id=cand.provider_id,
                    selected_model=cand.model_identifier,
                    selected_credential_id=credential.credential_id,
                    selected_credential_label=credential.label,
                    attempts=attempt_records,
                    total_latency_ms=round((time.monotonic() - start_mono) * 1000.0, 2),
                    success=True,
                    final_status_code=200,
                )
                await FailoverExecutor._persist_history(db, decision)
                return

            except Exception as pre_stream_exc:
                # Upstream connection failed BEFORE first chunk reached the client!
                # We can safely fallback to the next candidate!
                attempt_latency = (time.monotonic() - attempt_start_mono) * 1000.0
                if isinstance(pre_stream_exc, StopAsyncIteration):
                    pre_stream_exc = ProviderUnavailableError(
                        "Upstream stream ended before the first chunk",
                        provider=cand.provider_name,
                    )
                classification = ErrorClassifier.classify(pre_stream_exc, provider_name=cand.provider_name)

                cooldown_sec = None
                try:
                    await CircuitBreakerManager.record_failure(
                        db,
                        "provider",
                        cand.provider_name,
                        classification.reason,
                        classification=classification,
                    )
                    cooldown_sec = await HealthTracker.record_attempt_result(
                        db=db,
                        credential_id=credential.credential_id,
                        provider_name=cand.provider_name,
                        quota_group_id=credential.quota_group_id,
                        success=False,
                        latency_ms=attempt_latency,
                        classification=classification,
                    )
                    await db.commit()
                except Exception:
                    logger.exception("[req:%s] Pre-stream failure bookkeeping failed", req_id)
                    try:
                        await db.rollback()
                    except Exception:
                        logger.exception("[req:%s] Database rollback failed", req_id)

                should_retry, _ = RetryController.should_retry(
                    attempt=attempt_number,
                    max_attempts=resolved.max_attempts,
                    start_monotonic=start_mono,
                    overall_deadline_seconds=resolved.timeout_seconds,
                    classification=classification,
                )

                attempt_records.append(
                    AttemptRecord(
                        attempt_number=attempt_number,
                        provider_name=cand.provider_name,
                        model_identifier=cand.model_identifier,
                        credential_id=credential.credential_id,
                        credential_label=credential.label,
                        started_at=attempt_start_dt,
                        ended_at=utc_now(),
                        latency_ms=round(attempt_latency, 2),
                        result="failure",
                        status_code=classification.status_code,
                        error_category=classification.category.value,
                        error_message=classification.reason,
                        retry_decision="retry_next_candidate" if should_retry else "abort_non_retryable",
                        cooldown_applied=bool(cooldown_sec and cooldown_sec > 0),
                        cooldown_seconds=cooldown_sec,
                    )
                )

                if not should_retry:
                    break

                if RetryController.should_try_next_credential(
                    classification, credential.quota_group_id
                ):
                    queue.appendleft(cand)

                await RetryController.apply_bounded_backoff(
                    attempt_number, retry_after=classification.retry_after_seconds
                )
            finally:
                if stream_iter is not None:
                    close_stream = getattr(stream_iter, "aclose", None)
                    if close_stream is not None:
                        try:
                            await close_stream()
                        except Exception:
                            logger.debug("[req:%s] Upstream stream close failed", req_id, exc_info=True)

        # If loop finishes without successfully starting stream
        error_chunk = {
            "error": {
                "message": f"All routing candidates exhausted for streaming '{resolved.requested_name}'",
                "type": "provider_unavailable",
                "code": "CANDIDATES_EXHAUSTED",
            }
        }
        yield f"data: {json.dumps(error_chunk)}\n\n"
        yield "data: [DONE]\n\n"

        decision = RoutingDecision(
            request_id=req_id,
            requested_model_or_alias=resolved.requested_name,
            resolved_profile=resolved.profile_name,
            routing_strategy=resolved.strategy,
            attempts=attempt_records,
            total_latency_ms=round((time.monotonic() - start_mono) * 1000.0, 2),
            success=False,
            failure_reason="All candidates exhausted prior to first streaming chunk",
            final_status_code=503,
        )
        await FailoverExecutor._persist_history(db, decision)
