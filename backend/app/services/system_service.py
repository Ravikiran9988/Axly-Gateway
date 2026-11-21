import time
from typing import Dict, Tuple
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.common import ReadyComponentCheck


async def check_database_readiness(db: AsyncSession) -> Tuple[bool, ReadyComponentCheck]:
    """Pings database with a lightweight SELECT 1 to verify connectivity and measure latency."""
    start = time.perf_counter()
    try:
        await db.execute(text("SELECT 1"))
        latency = (time.perf_counter() - start) * 1000.0
        return True, ReadyComponentCheck(
            status="healthy",
            latency_ms=round(latency, 2),
            message="Database connection established",
        )
    except Exception as e:
        latency = (time.perf_counter() - start) * 1000.0
        return False, ReadyComponentCheck(
            status="unhealthy",
            latency_ms=round(latency, 2),
            message=f"Database unreachable: {e.__class__.__name__}",
        )
