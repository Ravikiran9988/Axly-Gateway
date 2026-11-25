import uuid
from datetime import datetime, timezone
from typing import List, Optional
from sqlalchemy import case, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import generate_gateway_key, hash_gateway_key
from app.models.gateway_key import GatewayApiKey


async def create_gateway_key(
    db: AsyncSession,
    label: str,
    rate_limit_rpm: int = 60,
    expires_at: Optional[datetime] = None,
) -> tuple[GatewayApiKey, str]:
    """
    Creates a new gateway API key.
    Stores the SHA-256 hash in the database, returns the model instance and the raw secret key.
    The raw secret key must ONLY be shown once to the user upon creation.
    """
    raw_key, key_hash, key_preview = generate_gateway_key()
    api_key_record = GatewayApiKey(
        label=label,
        key_hash=key_hash,
        key_preview=key_preview,
        rate_limit_rpm=rate_limit_rpm,
        expires_at=expires_at,
        is_active=True,
    )
    db.add(api_key_record)
    await db.flush()
    return api_key_record, raw_key


async def verify_gateway_key(
    db: AsyncSession, raw_key: str
) -> Optional[GatewayApiKey]:
    """
    Verifies a raw gateway API key by hashing it and looking up active records.
    Updates last_used_at on successful verification.
    """
    key_hash = hash_gateway_key(raw_key)
    now = datetime.now(timezone.utc)
    stmt = select(GatewayApiKey).where(
        GatewayApiKey.key_hash == key_hash,
        GatewayApiKey.is_active == True,
    )
    result = await db.execute(stmt)
    key_record = result.scalar_one_or_none()

    if not key_record:
        return None

    # Check expiration if set
    if key_record.expires_at and key_record.expires_at < now:
        return None

    key_record.last_used_at = now
    db.add(key_record)
    await db.flush()
    return key_record


async def consume_gateway_key_rate_limit(
    db: AsyncSession, key_record: GatewayApiKey
) -> int:
    """Atomically consumes one request from this key's fixed 60-second rate window.

    The counter is persisted in PostgreSQL and shared by application workers.
    Commit immediately after this function so no key-row lock is held while
    an upstream model request is running.
    """
    now = datetime.now(timezone.utc)
    window_start = now.replace(second=0, microsecond=0)
    reset_window = or_(
        GatewayApiKey.rate_limit_window_start.is_(None),
        GatewayApiKey.rate_limit_window_start < window_start,
    )
    stmt = (
        update(GatewayApiKey)
        .where(GatewayApiKey.id == key_record.id)
        .values(
            rate_limit_window_start=case(
                (reset_window, window_start),
                else_=GatewayApiKey.rate_limit_window_start,
            ),
            rate_limit_window_count=case(
                (reset_window, 1),
                else_=GatewayApiKey.rate_limit_window_count + 1,
            ),
        )
        .returning(GatewayApiKey.rate_limit_window_count)
    )
    result = await db.execute(stmt)
    return int(result.scalar_one())


async def list_gateway_keys(db: AsyncSession) -> List[GatewayApiKey]:
    """Lists all gateway API keys in descending creation order."""
    stmt = select(GatewayApiKey).order_by(GatewayApiKey.created_at.desc())
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def revoke_gateway_key(db: AsyncSession, key_id: uuid.UUID) -> bool:
    """Revokes (deactivates) a gateway API key."""
    stmt = select(GatewayApiKey).where(GatewayApiKey.id == key_id)
    result = await db.execute(stmt)
    key_record = result.scalar_one_or_none()
    if not key_record:
        return False
    key_record.is_active = False
    db.add(key_record)
    await db.flush()
    return True
