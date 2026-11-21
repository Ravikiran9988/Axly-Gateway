import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional
import jwt
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError, VerificationError, InvalidHashError

from app.core.config import get_settings

# Argon2id password hasher with secure production parameters
_ph = PasswordHasher(
    time_cost=2,
    memory_cost=65536,  # 64 MB
    parallelism=1,
    hash_len=32,
    salt_len=16,
)


def hash_password(password: str) -> str:
    """Hashes a plaintext password using Argon2id."""
    return _ph.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verifies a plaintext password against an Argon2id hash."""
    try:
        return _ph.verify(hashed_password, plain_password)
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False


def needs_rehash(hashed_password: str) -> bool:
    """Checks whether the password hash needs upgrading."""
    try:
        return _ph.check_needs_rehash(hashed_password)
    except Exception:
        return False


def create_access_token(
    subject: str,
    extra_claims: Optional[Dict[str, Any]] = None,
    expires_delta: Optional[timedelta] = None,
) -> str:
    """Generates a signed JWT session token for an authenticated administrator."""
    settings = get_settings()
    now = datetime.now(timezone.utc)
    if expires_delta:
        expire = now + expires_delta
    else:
        expire = now + timedelta(minutes=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES)

    to_encode: Dict[str, Any] = {
        "sub": str(subject),
        "iat": int(now.timestamp()),
        "exp": int(expire.timestamp()),
        "jti": secrets.token_hex(16),
    }
    if extra_claims:
        to_encode.update(extra_claims)

    encoded_jwt = jwt.encode(
        to_encode,
        settings.JWT_SECRET_KEY,
        algorithm=settings.JWT_ALGORITHM,
    )
    return encoded_jwt


def decode_access_token(token: str) -> Optional[Dict[str, Any]]:
    """Decodes and validates a JWT token. Returns claims dict or None if invalid/expired."""
    settings = get_settings()
    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM],
            options={"require": ["exp", "sub"]},
        )
        return payload
    except (jwt.PyJWTError, Exception):
        return None


def generate_gateway_key(prefix: str = "axly_live_") -> tuple[str, str, str]:
    """
    Generates a cryptographically secure gateway API key.
    Returns:
        (raw_key, key_hash, key_preview)
        - raw_key: Shown ONLY ONCE to user (e.g. axly_live_8f7b...)
        - key_hash: SHA-256 digest stored securely in database
        - key_preview: Masked identifier for UI listing (e.g. axly_live_...8f7b)
    """
    random_bytes = secrets.token_urlsafe(32)
    raw_key = f"{prefix}{random_bytes}"
    key_hash = hash_gateway_key(raw_key)
    # Preview displays prefix and last 6 chars
    preview = f"{raw_key[:10]}...{raw_key[-6:]}"
    return raw_key, key_hash, preview


def hash_gateway_key(raw_key: str) -> str:
    """Computes a SHA-256 hash of a raw gateway key for secure storage."""
    return hashlib.sha256(raw_key.encode("utf-8")).hexdigest()
