import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_root_endpoint(client: AsyncClient):
    response = await client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "AXLY Gateway"
    assert data["status"] == "online"
    assert "Intelligent Routing" in data["tagline"]


@pytest.mark.asyncio
async def test_health_liveness(client: AsyncClient):
    response = await client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert "version" in data
    assert "uptime_seconds" in data
    assert data["uptime_seconds"] >= 0.0


@pytest.mark.asyncio
async def test_ready_readiness(client: AsyncClient):
    response = await client.get("/ready")
    assert response.status_code == 200
    data = response.json()
    assert data["ready"] is True
    assert data["status"] == "ready"
    assert "database" in data["checks"]
    assert data["checks"]["database"]["status"] == "healthy"
    assert data["checks"]["database"]["latency_ms"] is not None


@pytest.mark.asyncio
async def test_request_id_middleware(client: AsyncClient):
    response = await client.get("/health")
    assert "X-Request-ID" in response.headers
    custom_id = "test-custom-req-id-12345"
    resp2 = await client.get("/health", headers={"X-Request-ID": custom_id})
    assert resp2.headers.get("X-Request-ID") == custom_id
