import pytest
import uuid
from httpx import AsyncClient
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token
from app.models.admin import Administrator
from app.models.gateway_key import GatewayApiKey
from app.models.logs import RequestLog
from app.models.provider import Provider
from app.models.routing_history import RoutingHistory
from app.services.auth import create_initial_admin


@pytest.mark.asyncio
async def test_admin_logs_and_analytics_endpoints(client: AsyncClient, db_session: AsyncSession):
    # 1. Setup Admin & Token
    await db_session.execute(delete(Administrator))
    await db_session.commit()
    admin = await create_initial_admin(db_session, "analytics_admin@axly.test", "Pass#123456")
    await db_session.commit()
    token = create_access_token(str(admin.id))
    auth_header = {"Authorization": f"Bearer {token}"}

    # 2. Setup Provider & Gateway Key
    provider = Provider(name="openai", display_name="OpenAI Platform", is_enabled=True)
    db_session.add(provider)
    await db_session.flush()

    gw_key = GatewayApiKey(
        key_hash="hash123",
        key_preview="axly...k1",
        label="Test Web Client",
        is_active=True,
    )
    db_session.add(gw_key)
    await db_session.flush()

    # 3. Add sample RequestLogs
    req_1 = RequestLog(
        request_id="req-test-001",
        gateway_key_id=gw_key.id,
        provider_id=provider.id,
        model_identifier="gpt-4o-mini",
        status_code=200,
        latency_ms=250.0,
        prompt_tokens=15,
        completion_tokens=25,
        total_tokens=40,
        estimated_cost_usd=0.0001,
    )
    req_2 = RequestLog(
        request_id="req-test-002",
        gateway_key_id=gw_key.id,
        provider_id=provider.id,
        model_identifier="gpt-4o-mini",
        status_code=500,
        latency_ms=800.0,
        prompt_tokens=10,
        completion_tokens=0,
        total_tokens=10,
        estimated_cost_usd=0.0,
        error_message="Upstream 500 error",
    )
    db_session.add_all([req_1, req_2])

    # Add sample RoutingHistory
    rh_1 = RoutingHistory(
        request_id="req-test-001",
        requested_model_or_alias="fast",
        routing_strategy="priority",
        attempt_number=1,
        provider_name="openai",
        model_identifier="gpt-4o-mini",
        latency_ms=250.0,
        result="success",
        status_code=200,
    )
    rh_2_att1 = RoutingHistory(
        request_id="req-test-002",
        requested_model_or_alias="fast",
        routing_strategy="priority",
        attempt_number=1,
        provider_name="groq",
        model_identifier="llama-3.1-8b-instant",
        latency_ms=400.0,
        result="failure",
        status_code=503,
        error_category="service_unavailable",
    )
    rh_2_att2 = RoutingHistory(
        request_id="req-test-002",
        requested_model_or_alias="fast",
        routing_strategy="priority",
        attempt_number=2,
        provider_name="openai",
        model_identifier="gpt-4o-mini",
        latency_ms=400.0,
        result="failure",
        status_code=500,
        error_category="service_unavailable",
    )
    db_session.add_all([rh_1, rh_2_att1, rh_2_att2])
    await db_session.commit()

    # 4. Test GET /api/admin/logs
    logs_res = await client.get("/api/admin/logs?page=1&page_size=10", headers=auth_header)
    assert logs_res.status_code == 200
    data = logs_res.json()["data"]
    assert data["total_count"] == 2
    assert len(data["items"]) == 2
    # Verify fallback indicator on req-test-002
    req2_item = next(i for i in data["items"] if i["request_id"] == "req-test-002")
    assert req2_item["has_fallback"] is True
    assert req2_item["attempt_count"] == 2

    # 5. Test GET /api/admin/logs/{request_id}
    detail_res = await client.get("/api/admin/logs/req-test-002", headers=auth_header)
    assert detail_res.status_code == 200
    detail_data = detail_res.json()["data"]
    assert detail_data["log"]["request_id"] == "req-test-002"
    assert len(detail_data["attempts"]) == 2
    assert detail_data["attempts"][0]["provider_name"] == "groq"
    assert detail_data["attempts"][1]["provider_name"] == "openai"

    # 6. Test GET /api/admin/logs/export/csv
    csv_res = await client.get("/api/admin/logs/export/csv", headers=auth_header)
    assert csv_res.status_code == 200
    assert "Request ID,Timestamp" in csv_res.text
    assert "req-test-001" in csv_res.text

    # 7. Test GET /api/admin/analytics/overview
    overview_res = await client.get("/api/admin/analytics/overview?time_range=24h", headers=auth_header)
    assert overview_res.status_code == 200
    ov = overview_res.json()["data"]
    assert ov["total_requests"] == 2
    assert ov["successful_requests"] == 1
    assert ov["failed_requests"] == 1
    assert ov["success_rate"] == 50.0
    assert ov["total_tokens"] == 50
    assert ov["failover_count"] == 1

    # 8. Test GET /api/admin/analytics/timeseries
    ts_res = await client.get("/api/admin/analytics/timeseries?time_range=24h&interval=hour", headers=auth_header)
    assert ts_res.status_code == 200
    assert isinstance(ts_res.json()["data"], list)

    # 9. Test GET /api/admin/analytics/breakdown
    bd_res = await client.get("/api/admin/analytics/breakdown?time_range=24h", headers=auth_header)
    assert bd_res.status_code == 200
    bd = bd_res.json()["data"]
    assert len(bd["by_provider"]) >= 1
    assert len(bd["by_model"]) >= 1
    assert len(bd["by_status"]) >= 2
