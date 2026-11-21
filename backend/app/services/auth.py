import uuid
from datetime import datetime, timezone
from typing import Optional
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password, verify_password
from app.models.admin import Administrator


class AdminServiceError(Exception):
    pass


async def is_setup_required(db: AsyncSession) -> bool:
    """Returns True if no administrator exists in the system."""
    stmt = select(func.count(Administrator.id))
    result = await db.execute(stmt)
    count = result.scalar_one_or_none() or 0
    return count == 0


async def create_initial_admin(db: AsyncSession, email: str, password: str) -> Administrator:
    """Creates the first-run administrator account. Fails if an admin already exists."""
    if not await is_setup_required(db):
        raise AdminServiceError("Administrator account already exists. Setup is locked.")

    hashed = hash_password(password)
    admin = Administrator(
        email=email.strip().lower(),
        hashed_password=hashed,
        is_active=True,
    )
    db.add(admin)
    await db.flush()
    return admin


async def authenticate_admin(
    db: AsyncSession, email: str, password: str
) -> Optional[Administrator]:
    """Authenticates an administrator with email and password."""
    stmt = select(Administrator).where(
        func.lower(Administrator.email) == email.strip().lower()
    )
    result = await db.execute(stmt)
    admin = result.scalar_one_or_none()

    if not admin or not admin.is_active:
        return None

    if not verify_password(password, admin.hashed_password):
        return None

    # Update last login timestamp
    admin.last_login_at = datetime.now(timezone.utc)
    db.add(admin)
    await db.flush()
    return admin


async def get_admin_by_id(db: AsyncSession, admin_id: uuid.UUID) -> Optional[Administrator]:
    """Retrieves an administrator by ID."""
    stmt = select(Administrator).where(Administrator.id == admin_id)
    result = await db.execute(stmt)
    return result.scalar_one_or_none()
