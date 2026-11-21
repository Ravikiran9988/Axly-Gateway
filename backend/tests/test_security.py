from datetime import timedelta
import pytest
from app.core.security import (
    create_access_token,
    decode_access_token,
    generate_gateway_key,
    hash_gateway_key,
    hash_password,
    verify_password,
)


def test_argon2id_password_hashing():
    raw_pass = "SuperSecurePassword#2026"
    hashed = hash_password(raw_pass)

    assert hashed.startswith("$argon2id$")
    assert verify_password(raw_pass, hashed) is True
    assert verify_password("WrongPassword123", hashed) is False


def test_jwt_access_token_creation_and_verification():
    admin_id = "11111111-2222-3333-4444-555555555555"
    token = create_access_token(
        subject=admin_id,
        extra_claims={"email": "admin@axly.local"},
        expires_delta=timedelta(minutes=30),
    )

    payload = decode_access_token(token)
    assert payload is not None
    assert payload["sub"] == admin_id
    assert payload["email"] == "admin@axly.local"


def test_jwt_expired_token():
    admin_id = "11111111-2222-3333-4444-555555555555"
    # Create expired token
    token = create_access_token(
        subject=admin_id,
        expires_delta=timedelta(seconds=-10),
    )

    payload = decode_access_token(token)
    assert payload is None


def test_gateway_key_generation():
    raw_key, key_hash, preview = generate_gateway_key()

    assert raw_key.startswith("axly_live_")
    assert len(raw_key) > 40
    assert hash_gateway_key(raw_key) == key_hash
    assert preview.startswith("axly_live_")
    assert preview.endswith(raw_key[-6:])
