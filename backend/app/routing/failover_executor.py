import logging
import time
import uuid
from typing import Any, Dict, List, Optional, Set, Tuple
from fastapi import Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.base import utc_now
from app.models.routing_history import RoutingHistory
from app.providers.exceptions import (
    ProviderError,
    ProviderUnavailableError,
    QuotaExceededError,
)
from app.providers.registry import get_provider_registry
from app.providers.schemas import ChatCompletionRequest, ChatCompletionResponse
from app.routing.candidate_selector import CandidateSelector
from app.routing.circuit_breaker import CircuitBreakerManager
from app.routing.credential_selector import CredentialSelector
from app.routing.error_classifier import ErrorClassifier
from app.routing.health_tracker import HealthTracker
from app.routing.resolver import ResolvedRoutingTarget
from app.routing.retry_controller import RetryController
from app.routing.schemas import (
    AttemptRecord,
    ErrorCategory,
    RoutingCandidate,
    RoutingDecision,
)

logger = logging.getLogger("axly.routing.executor")


class FailoverExecutor:
    """
    Coordinates bounded multi-candidate attempts and cross-provider failover.
    Enforces candidate de-duplication, quota-group exclusions, circuit breaker checks,
    error classification, cooldown application, and auditable history logging.
    """

    @classmethod
    async def execute_chat(
        cls,
        db: AsyncSession,
        resolved: ResolvedRoutingTarget,
        request: ChatCompletionRequest,
        request_id: str,
        raw_request: Optional[Request] = None,
        ip_address: Optional[str] = None,
    ) -> Tuple[ChatCompletionResponse, RoutingDecision]:
        """
        Executes non-streaming request with automatic failover across eligible candidates.
        """
        start_mono = time.monotonic()
        start_time = utc_now()
        attempt_records: List[AttemptRecord] = []
        attempted_pairs: Set[str] = set()
        attempted_credential_ids: Set[uuid.UUID] = set()
        attempt_number = 0

        # Filter and order candidates according to profile strategy
        ordered_candidates = CandidateSelector.filter_and_order_candidates(
            resolved.candidates,
            strategy=resolved.strategy,
            required_capabilities=resolved.required_capabilities,
        )

        last_exception: Optional[Exception] = None

        for cand in ordered_candidates:
            pair_key = f"{cand.provider_name}:{cand.model_identifier}".lower()
            if pair_key in attempted_pairs:
                continue

            # 1. Circuit breaker check on provider
            cb_allowed, cb_reason = await CircuitBreakerManager.can_execute(
                db, "provider", cand.provider_name
            )
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
                logger.info(f"Skipping candidate {pair_key}: {cb_reason}")
                continue

            # 2. Select eligible credential (respects priority, cooldowns, and shared quota groups)
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
                logger.info(f"Skipping candidate {pair_key}: no eligible credential ({exclusion_reasons})")
                continue

            # 3. Candidate & Credential ready for attempt!
            attempt_number += 1
            attempted_pairs.add(pair_key)
            attempted_credential_ids.add(credential.credential_id)

            attempt_start_mono = time.monotonic()
            attempt_start_dt = utc_now()

            registry = get_provider_registry()
            adapter = registry.get(cand.provider_name)

            # Build upstream request pointing to provider's model identifier
            upstream_request = request.model_copy(update={"model": cand.model_identifier})

            logger.info(
                f"[req:{request_id}] Attempt {attempt_number}: routing to {cand.provider_name} "
                f"({cand.model_identifier}) using credential '{credential.label}'"
            )

            try:
                response = await adapter.complete_chat(upstream_request, credential.decrypted_api_key)
                attempt_latency = (time.monotonic() - attempt_start_mono) * 1000.0

                # Upstream success! Update circuit breaker and health tracker
                await CircuitBreakerManager.record_success(db, "provider", cand.provider_name)
                tokens_count = response.usage.total_tokens if response.usage else 0
                await HealthTracker.record_attempt_result(
                    db=db,
                    credential_id=credential.credential_id,
                    provider_name=cand.provider_name,
                    quota_group_id=credential.quota_group_id,
                    success=True,
                    latency_ms=attempt_latency,
                    tokens_count=tokens_count,
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
                        result="success",
                        status_code=200,
                        retry_decision="none",
                        circuit_breaker_state="CLOSED",
                    )
                )

                total_latency = (time.monotonic() - start_mono) * 1000.0
                decision = RoutingDecision(
                    request_id=request_id,
                    requested_model_or_alias=resolved.requested_name,
                    resolved_profile=resolved.profile_name,
                    routing_strategy=resolved.strategy,
                    selected_provider=cand.provider_name,
                    selected_model=cand.model_identifier,
                    selected_credential_id=credential.credential_id,
                    selected_credential_label=credential.label,
                    attempts=attempt_records,
                    total_latency_ms=round(total_latency, 2),
                    success=True,
                    final_status_code=200,
                )

                # Persist routing history
                await cls._persist_history(db, decision)

                # Format response model field to preserve requested model/alias if needed
                if resolved.is_alias:
                    response.model = resolved.requested_name

                return response, decision

            except Exception as exc:
                last_exception = exc
                attempt_latency = (time.monotonic() - attempt_start_mono) * 1000.0

                # 4. Classify provider failure
                classification = ErrorClassifier.classify(
                    exc, provider_name=cand.provider_name
                )

                # 5. Record failure in Circuit Breaker & Health Tracker (updates cooldowns)
                await CircuitBreakerManager.record_failure(
                    db, "provider", cand.provider_name, classification.reason
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

                # 6. Check client disconnection
                client_disconnected = False
                if raw_request is not None:
                    try:
                        client_disconnected = await raw_request.is_disconnected()
                    except Exception:
                        pass

                # 7. Decide whether to retry next candidate
                should_retry, retry_reason = RetryController.should_retry(
                    attempt=attempt_number,
                    max_attempts=resolved.max_attempts,
                    start_monotonic=start_mono,
                    overall_deadline_seconds=resolved.timeout_seconds,
                    classification=classification,
                    client_disconnected=client_disconnected,
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

                logger.warning(
                    f"[req:{request_id}] Attempt {attempt_number} ({cand.provider_name}) failed: "
                    f"[{classification.category.value}] {classification.reason}. Retry decision: {retry_reason}"
                )

                if not should_retry:
                    total_latency = (time.monotonic() - start_mono) * 1000.0
                    decision = RoutingDecision(
                        request_id=request_id,
                        requested_model_or_alias=resolved.requested_name,
                        resolved_profile=resolved.profile_name,
                        routing_strategy=resolved.strategy,
                        attempts=attempt_records,
                        total_latency_ms=round(total_latency, 2),
                        success=False,
                        failure_reason=classification.reason,
                        final_status_code=classification.status_code,
                    )
                    await cls._persist_history(db, decision)
                    raise

                # Controlled bounded delay before next candidate
                await RetryController.apply_bounded_backoff(
                    attempt_number, retry_after=classification.retry_after_seconds
                )

        # All candidates exhausted or none eligible
        total_latency = (time.monotonic() - start_mono) * 1000.0
        failure_summary = (
            f"All {len(ordered_candidates)} routing candidates for '{resolved.requested_name}' were exhausted."
        )
        if last_exception:
            failure_summary += f" Last error: {last_exception}"

        decision = RoutingDecision(
            request_id=request_id,
            requested_model_or_alias=resolved.requested_name,
            resolved_profile=resolved.profile_name,
            routing_strategy=resolved.strategy,
            attempts=attempt_records,
            total_latency_ms=round(total_latency, 2),
            success=False,
            failure_reason=failure_summary,
            final_status_code=503,
        )
        await cls._persist_history(db, decision)

        raise ProviderUnavailableError(
            failure_summary,
            provider="gateway",
            details={
                "attempts_count": attempt_number,
                "history": [
                    {
                        "attempt": a.attempt_number,
                        "provider": a.provider_name,
                        "model": a.model_identifier,
                        "result": a.result,
                        "exclusion_reason": a.exclusion_reason,
                        "error": a.error_message,
                    }
                    for a in attempt_records
                ],
            },
        )

    @classmethod
    async def _persist_history(cls, db: AsyncSession, decision: RoutingDecision) -> None:
        """Saves detailed auditable routing history records into PostgreSQL."""
        try:
            for att in decision.attempts:
                rec = RoutingHistory(
                    request_id=decision.request_id,
                    requested_model_or_alias=decision.requested_model_or_alias,
                    resolved_profile=decision.resolved_profile,
                    routing_strategy=decision.routing_strategy,
                    attempt_number=att.attempt_number,
                    provider_name=att.provider_name,
                    model_identifier=att.model_identifier,
                    credential_id=att.credential_id,
                    credential_label=att.credential_label,
                    started_at=att.started_at,
                    ended_at=att.ended_at,
                    latency_ms=att.latency_ms,
                    result=att.result,
                    status_code=att.status_code,
                    error_category=att.error_category,
                    error_message=att.error_message,
                    retry_decision=att.retry_decision,
                    exclusion_reason=att.exclusion_reason,
                    cooldown_applied=att.cooldown_applied,
                    cooldown_seconds=att.cooldown_seconds,
                    circuit_breaker_state=att.circuit_breaker_state,
                )
                db.add(rec)
            await db.commit()
        except Exception as exc:
            logger.error(f"Failed to persist routing history for request {decision.request_id}: {exc}")
