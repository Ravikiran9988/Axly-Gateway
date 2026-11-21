import os
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

# Ensure test environment variables are loaded
os.environ["ENVIRONMENT"] = "testing"
os.environ["DEBUG"] = "true"

from app.core.config import get_settings
from app.db.dependencies import get_db
from app.main import app
from sqlalchemy import text

settings = get_settings()


@pytest_asyncio.fixture(scope="function")
async def db_session():
    """Provides a fresh transactional session with NullPool for test cases."""
    engine = create_async_engine(
        settings.DATABASE_URL,
        echo=False,
        poolclass=NullPool,
    )
    async with engine.begin() as conn:
        await conn.execute(text(
            "TRUNCATE TABLE gateway_api_keys, administrators, routing_history, "
            "model_alias_candidates, model_aliases, routing_rules, routing_profiles, "
            "circuit_breakers, credential_health, provider_credentials, quota_groups, "
            "models, request_logs, usage_records, system_settings, providers CASCADE;"
        ))

    session_factory = async_sessionmaker(
        bind=engine,
        class_=AsyncSession,
        expire_on_commit=False,
        autocommit=False,
        autoflush=False,
    )
    async with session_factory() as session:
        yield session
        await session.rollback()

    await engine.dispose()


@pytest_asyncio.fixture(scope="function")
async def client(db_session: AsyncSession):
    """Provides an asynchronous test client with overridden database dependency."""
    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as ac:
        yield ac

    app.dependency_overrides.clear()
