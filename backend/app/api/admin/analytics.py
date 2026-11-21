from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_admin
from app.db.dependencies import get_db
from app.models.admin import Administrator
from app.models.credential import ProviderCredential
from app.models.health import CredentialHealth
from app.models.logs import RequestLog
from app.models.provider import Provider
from app.models.routing_history import RoutingHistory
from app.schemas.common import APIResponse

router = APIRouter(prefix="/analytics", tags=["Analytics & Metrics"])


def get_time_cutoff(time_range: str) -> Optional[datetime]:
    now = datetime.now(timezone.utc)
    if time_range == "24h":
        return now - timedelta(hours=24)
    elif time_range == "7d":
        return now - timedelta(days=7)
    elif time_range == "30d":
        return now - timedelta(days=30)
    elif time_range == "90d":
        return now - timedelta(days=90)
    return None


class AnalyticsOverview(BaseModel):
    total_requests: int = 0
    successful_requests: int = 0
    failed_requests: int = 0
    success_rate: float = 100.0
    total_tokens: int = 0
    prompt_tokens: int = 0
    completion_tokens: int = 0
    estimated_cost_usd: float = 0.0
    avg_latency_ms: float = 0.0
    p50_latency_ms: float = 0.0
    p95_latency_ms: float = 0.0
    p99_latency_ms: float = 0.0
    failover_count: int = 0
    active_providers: int = 0
    healthy_credentials: int = 0
    cooldown_credentials: int = 0
    time_range: str = "24h"


class TimeseriesPoint(BaseModel):
    timestamp: str
    requests: int = 0
    successful: int = 0
    failed: int = 0
    tokens: int = 0
    cost_usd: float = 0.0
    avg_latency_ms: float = 0.0
    failovers: int = 0


class BreakdownResponse(BaseModel):
    by_provider: List[dict]
    by_model: List[dict]
    by_status: List[dict]
    by_error_category: List[dict]


@router.get("/overview", response_model=APIResponse[AnalyticsOverview])
async def get_analytics_overview(
    time_range: str = Query(default="24h", regex="^(24h|7d|30d|90d|all)$"),
    db: AsyncSession = Depends(get_db),
    admin: Administrator = Depends(get_current_admin),
):
    """Calculates high-level KPI metrics across requests, tokens, cost, latency, and failovers."""
    cutoff = get_time_cutoff(time_range)

    # 1. Base Request Logs aggregations
    req_stmt = select(
        func.count(RequestLog.id).label("total_requests"),
        func.sum(RequestLog.prompt_tokens).label("prompt_tokens"),
        func.sum(RequestLog.completion_tokens).label("completion_tokens"),
        func.sum(RequestLog.total_tokens).label("total_tokens"),
        func.sum(RequestLog.estimated_cost_usd).label("estimated_cost_usd"),
        func.avg(RequestLog.latency_ms).label("avg_latency_ms"),
    )
    if cutoff:
        req_stmt = req_stmt.where(RequestLog.created_at >= cutoff)

    row = (await db.execute(req_stmt)).one()
    total_requests = row.total_requests or 0
    prompt_tokens = row.prompt_tokens or 0
    completion_tokens = row.completion_tokens or 0
    total_tokens = row.total_tokens or 0
    estimated_cost_usd = float(row.estimated_cost_usd or 0.0)
    avg_latency_ms = float(row.avg_latency_ms or 0.0)

    # Successful vs Failed
    succ_stmt = select(func.count(RequestLog.id)).where(RequestLog.status_code < 400)
    if cutoff:
        succ_stmt = succ_stmt.where(RequestLog.created_at >= cutoff)
    successful_requests = (await db.execute(succ_stmt)).scalar() or 0
    failed_requests = total_requests - successful_requests
    success_rate = round((successful_requests / total_requests * 100.0), 1) if total_requests > 0 else 100.0

    # 2. Latency percentiles (P50, P95, P99)
    p50_latency_ms = 0.0
    p95_latency_ms = 0.0
    p99_latency_ms = 0.0
    if total_requests > 0:
        lat_stmt = select(RequestLog.latency_ms).order_by(RequestLog.latency_ms.asc())
        if cutoff:
            lat_stmt = lat_stmt.where(RequestLog.created_at >= cutoff)
        latencies = (await db.execute(lat_stmt)).scalars().all()
        n = len(latencies)
        if n > 0:
            p50_latency_ms = round(float(latencies[int(n * 0.50)]), 2)
            p95_latency_ms = round(float(latencies[min(int(n * 0.95), n - 1)]), 2)
            p99_latency_ms = round(float(latencies[min(int(n * 0.99), n - 1)]), 2)

    # 3. Failover count (requests with attempt > 1)
    failover_stmt = (
        select(func.count(func.distinct(RoutingHistory.request_id)))
        .where(RoutingHistory.attempt_number > 1)
    )
    if cutoff:
        failover_stmt = failover_stmt.where(RoutingHistory.created_at >= cutoff)
    failover_count = (await db.execute(failover_stmt)).scalar() or 0

    # 4. Providers & Credentials Health status
    active_prov_stmt = select(func.count(Provider.id)).where(Provider.is_enabled == True)
    active_providers = (await db.execute(active_prov_stmt)).scalar() or 0

    healthy_cred_stmt = select(func.count(CredentialHealth.id)).where(CredentialHealth.status == "healthy")
    healthy_credentials = (await db.execute(healthy_cred_stmt)).scalar() or 0

    cooldown_cred_stmt = (
        select(func.count(CredentialHealth.id))
        .where(CredentialHealth.status.in_(["rate_limited", "temporarily_unavailable", "recovering"]))
    )
    cooldown_credentials = (await db.execute(cooldown_cred_stmt)).scalar() or 0

    return APIResponse(
        data=AnalyticsOverview(
            total_requests=total_requests,
            successful_requests=successful_requests,
            failed_requests=failed_requests,
            success_rate=success_rate,
            total_tokens=total_tokens,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            estimated_cost_usd=round(estimated_cost_usd, 6),
            avg_latency_ms=round(avg_latency_ms, 2),
            p50_latency_ms=p50_latency_ms,
            p95_latency_ms=p95_latency_ms,
            p99_latency_ms=p99_latency_ms,
            failover_count=failover_count,
            active_providers=active_providers,
            healthy_credentials=healthy_credentials,
            cooldown_credentials=cooldown_credentials,
            time_range=time_range,
        )
    )


@router.get("/timeseries", response_model=APIResponse[List[TimeseriesPoint]])
async def get_analytics_timeseries(
    time_range: str = Query(default="24h", regex="^(24h|7d|30d|90d|all)$"),
    interval: str = Query(default="hour", regex="^(hour|day)$"),
    db: AsyncSession = Depends(get_db),
    admin: Administrator = Depends(get_current_admin),
):
    """Aggregates request volume, success/failures, tokens, and latencies over time buckets."""
    cutoff = get_time_cutoff(time_range)
    if not cutoff:
        cutoff = datetime.now(timezone.utc) - timedelta(days=30)

    # Query all logs within cutoff
    stmt = (
        select(RequestLog)
        .where(RequestLog.created_at >= cutoff)
        .order_by(RequestLog.created_at.asc())
    )
    records = (await db.execute(stmt)).scalars().all()

    # Bucket format: hour ("YYYY-MM-DD HH:00") or day ("YYYY-MM-DD")
    buckets: Dict[str, dict] = {}

    for r in records:
        dt = r.created_at
        if interval == "hour":
            key = dt.strftime("%Y-%m-%d %H:00")
        else:
            key = dt.strftime("%Y-%m-%d")

        if key not in buckets:
            buckets[key] = {
                "timestamp": key,
                "requests": 0,
                "successful": 0,
                "failed": 0,
                "tokens": 0,
                "cost_usd": 0.0,
                "latencies": [],
                "failovers": 0,
            }

        b = buckets[key]
        b["requests"] += 1
        if r.status_code < 400:
            b["successful"] += 1
        else:
            b["failed"] += 1
        b["tokens"] += r.total_tokens
        b["cost_usd"] += r.estimated_cost_usd
        b["latencies"].append(r.latency_ms)

    # Query failovers per bucket
    hist_stmt = (
        select(RoutingHistory.created_at)
        .where(RoutingHistory.created_at >= cutoff, RoutingHistory.attempt_number > 1)
    )
    hist_rows = (await db.execute(hist_stmt)).scalars().all()
    for dt in hist_rows:
        key = dt.strftime("%Y-%m-%d %H:00") if interval == "hour" else dt.strftime("%Y-%m-%d")
        if key in buckets:
            buckets[key]["failovers"] += 1

    points: List[TimeseriesPoint] = []
    for key, b in sorted(buckets.items()):
        avg_lat = sum(b["latencies"]) / len(b["latencies"]) if b["latencies"] else 0.0
        points.append(
            TimeseriesPoint(
                timestamp=b["timestamp"],
                requests=b["requests"],
                successful=b["successful"],
                failed=b["failed"],
                tokens=b["tokens"],
                cost_usd=round(b["cost_usd"], 6),
                avg_latency_ms=round(avg_lat, 2),
                failovers=b["failovers"],
            )
        )

    return APIResponse(data=points)


@router.get("/breakdown", response_model=APIResponse[BreakdownResponse])
async def get_analytics_breakdown(
    time_range: str = Query(default="24h", regex="^(24h|7d|30d|90d|all)$"),
    db: AsyncSession = Depends(get_db),
    admin: Administrator = Depends(get_current_admin),
):
    """Returns distributions across providers, models, status codes, and error categories."""
    cutoff = get_time_cutoff(time_range)

    # 1. By Provider
    prov_stmt = (
        select(
            Provider.display_name,
            func.count(RequestLog.id).label("requests"),
            func.sum(RequestLog.total_tokens).label("tokens"),
            func.sum(RequestLog.estimated_cost_usd).label("cost_usd"),
        )
        .join(Provider, RequestLog.provider_id == Provider.id, isouter=True)
    )
    if cutoff:
        prov_stmt = prov_stmt.where(RequestLog.created_at >= cutoff)
    prov_stmt = prov_stmt.group_by(Provider.display_name)
    prov_rows = (await db.execute(prov_stmt)).all()

    by_provider = [
        {
            "name": r.display_name or "Unknown / Unrouted",
            "requests": r.requests or 0,
            "tokens": r.tokens or 0,
            "cost_usd": round(float(r.cost_usd or 0.0), 6),
        }
        for r in prov_rows
    ]

    # 2. By Model
    model_stmt = (
        select(
            RequestLog.model_identifier,
            func.count(RequestLog.id).label("requests"),
            func.sum(RequestLog.total_tokens).label("tokens"),
        )
    )
    if cutoff:
        model_stmt = model_stmt.where(RequestLog.created_at >= cutoff)
    model_stmt = model_stmt.group_by(RequestLog.model_identifier).order_by(desc("requests")).limit(15)
    model_rows = (await db.execute(model_stmt)).all()

    by_model = [
        {
            "name": r.model_identifier,
            "requests": r.requests or 0,
            "tokens": r.tokens or 0,
        }
        for r in model_rows
    ]

    # 3. By Status Code
    status_stmt = select(RequestLog.status_code, func.count(RequestLog.id).label("count"))
    if cutoff:
        status_stmt = status_stmt.where(RequestLog.created_at >= cutoff)
    status_stmt = status_stmt.group_by(RequestLog.status_code)
    status_rows = (await db.execute(status_stmt)).all()

    by_status = [{"status": r.status_code, "count": r.count} for r in status_rows]

    # 4. By Error Category (from RoutingHistory)
    err_stmt = (
        select(RoutingHistory.error_category, func.count(RoutingHistory.id).label("count"))
        .where(RoutingHistory.error_category.isnot(None))
    )
    if cutoff:
        err_stmt = err_stmt.where(RoutingHistory.created_at >= cutoff)
    err_stmt = err_stmt.group_by(RoutingHistory.error_category)
    err_rows = (await db.execute(err_stmt)).all()

    by_error_category = [{"category": r.error_category, "count": r.count} for r in err_rows]

    return APIResponse(
        data=BreakdownResponse(
            by_provider=by_provider,
            by_model=by_model,
            by_status=by_status,
            by_error_category=by_error_category,
        )
    )
