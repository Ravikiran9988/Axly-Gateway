import csv
import io
import uuid
from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, Query, Response, status
from pydantic import BaseModel
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_admin
from app.db.dependencies import get_db
from app.middleware.error_handler import APIException
from app.models.admin import Administrator
from app.models.gateway_key import GatewayApiKey
from app.models.logs import RequestLog
from app.models.provider import Provider
from app.models.routing_history import RoutingHistory
from app.schemas.common import APIResponse

router = APIRouter(prefix="/logs", tags=["Request Logs"])


class RequestLogItem(BaseModel):
    id: uuid.UUID
    request_id: str
    created_at: datetime
    gateway_key_id: Optional[uuid.UUID] = None
    gateway_key_label: Optional[str] = None
    provider_id: Optional[uuid.UUID] = None
    provider_name: Optional[str] = None
    provider_display_name: Optional[str] = None
    model_identifier: str
    status_code: int
    latency_ms: float
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0
    estimated_cost_usd: float = 0.0
    error_message: Optional[str] = None
    attempt_count: int = 1
    has_fallback: bool = False

    model_config = {"from_attributes": True}


class RequestLogDetail(BaseModel):
    log: RequestLogItem
    attempts: List[dict]


class PaginatedLogsResponse(BaseModel):
    items: List[RequestLogItem]
    total_count: int
    page: int
    page_size: int
    total_pages: int


@router.get("", response_model=APIResponse[PaginatedLogsResponse])
async def list_request_logs(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    search: Optional[str] = Query(default=None, description="Search by request ID or model"),
    provider_id: Optional[uuid.UUID] = Query(default=None),
    gateway_key_id: Optional[uuid.UUID] = Query(default=None),
    status_code: Optional[int] = Query(default=None),
    status_filter: Optional[str] = Query(default=None, description="success (2xx) or error (4xx/5xx)"),
    start_date: Optional[datetime] = Query(default=None),
    end_date: Optional[datetime] = Query(default=None),
    sort_by: str = Query(default="created_at"),
    sort_order: str = Query(default="desc"),
    db: AsyncSession = Depends(get_db),
    admin: Administrator = Depends(get_current_admin),
):
    """Lists request logs with pagination, search, and multi-criteria filtering."""
    stmt = (
        select(RequestLog)
        .options(
            selectinload(RequestLog.gateway_key),
            selectinload(RequestLog.provider),
        )
    )
    count_stmt = select(func.count(RequestLog.id))

    # Apply filters
    if search:
        search_filter = RequestLog.request_id.ilike(f"%{search}%") | RequestLog.model_identifier.ilike(f"%{search}%")
        stmt = stmt.where(search_filter)
        count_stmt = count_stmt.where(search_filter)

    if provider_id:
        stmt = stmt.where(RequestLog.provider_id == provider_id)
        count_stmt = count_stmt.where(RequestLog.provider_id == provider_id)

    if gateway_key_id:
        stmt = stmt.where(RequestLog.gateway_key_id == gateway_key_id)
        count_stmt = count_stmt.where(RequestLog.gateway_key_id == gateway_key_id)

    if status_code:
        stmt = stmt.where(RequestLog.status_code == status_code)
        count_stmt = count_stmt.where(RequestLog.status_code == status_code)

    if status_filter == "success":
        stmt = stmt.where(RequestLog.status_code < 400)
        count_stmt = count_stmt.where(RequestLog.status_code < 400)
    elif status_filter == "error":
        stmt = stmt.where(RequestLog.status_code >= 400)
        count_stmt = count_stmt.where(RequestLog.status_code >= 400)

    if start_date:
        stmt = stmt.where(RequestLog.created_at >= start_date)
        count_stmt = count_stmt.where(RequestLog.created_at >= start_date)

    if end_date:
        stmt = stmt.where(RequestLog.created_at <= end_date)
        count_stmt = count_stmt.where(RequestLog.created_at <= end_date)

    total_count = (await db.execute(count_stmt)).scalar() or 0

    # Sorting
    sort_col = getattr(RequestLog, sort_by, RequestLog.created_at)
    if sort_order.lower() == "asc":
        stmt = stmt.order_by(sort_col.asc())
    else:
        stmt = stmt.order_by(sort_col.desc())

    offset = (page - 1) * page_size
    stmt = stmt.offset(offset).limit(page_size)

    result = await db.execute(stmt)
    records = result.scalars().all()

    # Pre-fetch attempt counts for these request_ids
    req_ids = [r.request_id for r in records]
    attempt_map = {}
    if req_ids:
        att_stmt = (
            select(RoutingHistory.request_id, func.count(RoutingHistory.id))
            .where(RoutingHistory.request_id.in_(req_ids))
            .group_by(RoutingHistory.request_id)
        )
        att_res = await db.execute(att_stmt)
        for r_id, count in att_res.all():
            attempt_map[r_id] = count

    items: List[RequestLogItem] = []
    for r in records:
        attempts = attempt_map.get(r.request_id, 1)
        items.append(
            RequestLogItem(
                id=r.id,
                request_id=r.request_id,
                created_at=r.created_at,
                gateway_key_id=r.gateway_key_id,
                gateway_key_label=r.gateway_key.label if r.gateway_key else None,
                provider_id=r.provider_id,
                provider_name=r.provider.name if r.provider else None,
                provider_display_name=r.provider.display_name if r.provider else None,
                model_identifier=r.model_identifier,
                status_code=r.status_code,
                latency_ms=r.latency_ms,
                prompt_tokens=r.prompt_tokens,
                completion_tokens=r.completion_tokens,
                total_tokens=r.total_tokens,
                estimated_cost_usd=r.estimated_cost_usd,
                error_message=r.error_message,
                attempt_count=attempts,
                has_fallback=attempts > 1,
            )
        )

    total_pages = (total_count + page_size - 1) // page_size if page_size > 0 else 0

    return APIResponse(
        data=PaginatedLogsResponse(
            items=items,
            total_count=total_count,
            page=page,
            page_size=page_size,
            total_pages=total_pages,
        )
    )


@router.get("/export/csv")
async def export_request_logs_csv(
    search: Optional[str] = Query(default=None),
    provider_id: Optional[uuid.UUID] = Query(default=None),
    status_filter: Optional[str] = Query(default=None),
    start_date: Optional[datetime] = Query(default=None),
    end_date: Optional[datetime] = Query(default=None),
    limit: int = Query(default=1000, le=5000),
    db: AsyncSession = Depends(get_db),
    admin: Administrator = Depends(get_current_admin),
):
    """Exports filtered request logs as a CSV attachment."""
    stmt = (
        select(RequestLog)
        .options(
            selectinload(RequestLog.gateway_key),
            selectinload(RequestLog.provider),
        )
        .order_by(desc(RequestLog.created_at))
        .limit(limit)
    )

    if search:
        stmt = stmt.where(RequestLog.request_id.ilike(f"%{search}%") | RequestLog.model_identifier.ilike(f"%{search}%"))
    if provider_id:
        stmt = stmt.where(RequestLog.provider_id == provider_id)
    if status_filter == "success":
        stmt = stmt.where(RequestLog.status_code < 400)
    elif status_filter == "error":
        stmt = stmt.where(RequestLog.status_code >= 400)
    if start_date:
        stmt = stmt.where(RequestLog.created_at >= start_date)
    if end_date:
        stmt = stmt.where(RequestLog.created_at <= end_date)

    result = await db.execute(stmt)
    records = result.scalars().all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Request ID",
        "Timestamp (UTC)",
        "Gateway Key",
        "Provider",
        "Model",
        "Status Code",
        "Latency (ms)",
        "Prompt Tokens",
        "Completion Tokens",
        "Total Tokens",
        "Estimated Cost (USD)",
        "Error Message",
    ])

    for r in records:
        writer.writerow([
            r.request_id,
            r.created_at.isoformat() if r.created_at else "",
            r.gateway_key.label if r.gateway_key else "None",
            r.provider.display_name if r.provider else (r.provider.name if r.provider else "None"),
            r.model_identifier,
            r.status_code,
            round(r.latency_ms, 2),
            r.prompt_tokens,
            r.completion_tokens,
            r.total_tokens,
            f"{r.estimated_cost_usd:.6f}",
            r.error_message or "",
        ])

    csv_data = output.getvalue()
    filename = f"axly_request_logs_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.csv"
    return Response(
        content=csv_data,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.get("/{request_id}", response_model=APIResponse[RequestLogDetail])
async def get_request_log_detail(
    request_id: str,
    db: AsyncSession = Depends(get_db),
    admin: Administrator = Depends(get_current_admin),
):
    """Retrieves full detail of a single request including all routing attempts and cooldown decisions."""
    stmt = (
        select(RequestLog)
        .options(
            selectinload(RequestLog.gateway_key),
            selectinload(RequestLog.provider),
        )
        .where(RequestLog.request_id == request_id)
    )
    log_rec = (await db.execute(stmt)).scalar_one_or_none()

    # Query routing attempts from RoutingHistory
    hist_stmt = (
        select(RoutingHistory)
        .where(RoutingHistory.request_id == request_id)
        .order_by(RoutingHistory.attempt_number.asc())
    )
    attempts = (await db.execute(hist_stmt)).scalars().all()

    attempts_data = [
        {
            "attempt_number": a.attempt_number,
            "provider_name": a.provider_name,
            "model_identifier": a.model_identifier,
            "credential_id": str(a.credential_id) if a.credential_id else None,
            "credential_label": a.credential_label,
            "latency_ms": a.latency_ms,
            "result": a.result,
            "status_code": a.status_code,
            "error_category": a.error_category,
            "error_message": a.error_message,
            "retry_decision": a.retry_decision,
            "exclusion_reason": a.exclusion_reason,
            "cooldown_applied": a.cooldown_applied,
            "cooldown_seconds": a.cooldown_seconds,
            "circuit_breaker_state": a.circuit_breaker_state,
            "started_at": a.started_at.isoformat() if a.started_at else None,
            "ended_at": a.ended_at.isoformat() if a.ended_at else None,
        }
        for a in attempts
    ]

    if not log_rec:
        # If no RequestLog entry, build synthesized entry from routing history if available
        if attempts:
            first_att = attempts[0]
            last_att = attempts[-1]
            log_item = RequestLogItem(
                id=uuid.uuid4(),
                request_id=request_id,
                created_at=first_att.created_at,
                model_identifier=last_att.model_identifier,
                status_code=last_att.status_code or 200,
                latency_ms=sum((a.latency_ms or 0.0) for a in attempts),
                attempt_count=len(attempts),
                has_fallback=len(attempts) > 1,
                error_message=last_att.error_message if last_att.result != "success" else None,
            )
            return APIResponse(data=RequestLogDetail(log=log_item, attempts=attempts_data))
        raise APIException(code="LOG_NOT_FOUND", message="Request log not found", status_code=status.HTTP_404_NOT_FOUND)

    log_item = RequestLogItem(
        id=log_rec.id,
        request_id=log_rec.request_id,
        created_at=log_rec.created_at,
        gateway_key_id=log_rec.gateway_key_id,
        gateway_key_label=log_rec.gateway_key.label if log_rec.gateway_key else None,
        provider_id=log_rec.provider_id,
        provider_name=log_rec.provider.name if log_rec.provider else None,
        provider_display_name=log_rec.provider.display_name if log_rec.provider else None,
        model_identifier=log_rec.model_identifier,
        status_code=log_rec.status_code,
        latency_ms=log_rec.latency_ms,
        prompt_tokens=log_rec.prompt_tokens,
        completion_tokens=log_rec.completion_tokens,
        total_tokens=log_rec.total_tokens,
        estimated_cost_usd=log_rec.estimated_cost_usd,
        error_message=log_rec.error_message,
        attempt_count=max(len(attempts), 1),
        has_fallback=len(attempts) > 1,
    )

    return APIResponse(data=RequestLogDetail(log=log_item, attempts=attempts_data))
