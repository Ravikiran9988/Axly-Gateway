import uuid
from typing import Optional
from fastapi import Depends, HTTPException, Security, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import decode_access_token
from app.db.dependencies import get_db
from app.middleware.error_handler import APIException
from app.models.admin import Administrator
from app.models.gateway_key import GatewayApiKey
from app.services.auth import get_admin_by_id
from app.services.key_service import consume_gateway_key_rate_limit, verify_gateway_key

# Bearer token auth scheme
security_bearer = HTTPBearer(auto_error=False)


async def get_current_admin(
    credentials: Optional[HTTPAuthorizationCredentials] = Security(security_bearer),
    db: AsyncSession = Depends(get_db),
) -> Administrator:
    """Dependency to authenticate an administrator via JWT Bearer token."""
    if not credentials or not credentials.credentials:
        raise APIException(
            code="UNAUTHORIZED",
            message="Authentication credentials were not provided",
            status_code=status.HTTP_401_UNAUTHORIZED,
        )

    token = credentials.credentials
    payload = decode_access_token(token)
    if not payload:
        raise APIException(
            code="INVALID_TOKEN",
            message="Session token is invalid or expired",
            status_code=status.HTTP_401_UNAUTHORIZED,
        )

    try:
        admin_id = uuid.UUID(payload.get("sub"))
    except (ValueError, TypeError):
        raise APIException(
            code="INVALID_TOKEN_SUBJECT",
            message="Malformed subject claim in authentication token",
            status_code=status.HTTP_401_UNAUTHORIZED,
        )

    admin = await get_admin_by_id(db, admin_id)
    if not admin:
        raise APIException(
            code="ADMIN_NOT_FOUND",
            message="Administrator account no longer exists",
            status_code=status.HTTP_401_UNAUTHORIZED,
        )

    if not admin.is_active:
        raise APIException(
            code="ACCOUNT_DISABLED",
            message="Administrator account has been deactivated",
            status_code=status.HTTP_403_FORBIDDEN,
        )

    return admin


async def get_current_gateway_key(
    credentials: Optional[HTTPAuthorizationCredentials] = Security(security_bearer),
    db: AsyncSession = Depends(get_db),
) -> GatewayApiKey:
    """Dependency to authenticate requests with a valid AXLY Gateway API Key."""
    if not credentials or not credentials.credentials:
        raise APIException(
            code="GATEWAY_KEY_MISSING",
            message="Gateway API key required in Authorization header: Bearer <key>",
            status_code=status.HTTP_401_UNAUTHORIZED,
        )

    raw_key = credentials.credentials.strip()
    key_record = await verify_gateway_key(db, raw_key)
    if not key_record:
        raise APIException(
            code="INVALID_GATEWAY_KEY",
            message="Provided gateway API key is invalid, expired, or revoked",
            status_code=status.HTTP_401_UNAUTHORIZED,
        )

    request_count = await consume_gateway_key_rate_limit(db, key_record)
    # Persist and release the row lock before the potentially long provider call.
    await db.commit()
    if request_count > key_record.rate_limit_rpm:
        raise APIException(
            code="GATEWAY_RATE_LIMIT_EXCEEDED",
            message=f"Gateway API key limit exceeded ({key_record.rate_limit_rpm} requests per minute).",
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            details={"limit": key_record.rate_limit_rpm, "window": "60 seconds"},
        )

    return key_record
