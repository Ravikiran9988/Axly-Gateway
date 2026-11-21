import pytest
from pydantic import ValidationError
from app.core.config import Settings


def test_settings_default_values():
    settings = Settings(
        ENCRYPTION_MASTER_KEY="0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        JWT_SECRET_KEY="test_jwt_secret_key_at_least_32_bytes_long",
    )
    assert settings.APP_NAME == "AXLY Gateway"
    assert settings.BACKEND_PORT == 8000
    assert settings.JWT_ALGORITHM == "HS256"


def test_encryption_key_validation_invalid_length():
    with pytest.raises(ValidationError):
        Settings(
            ENCRYPTION_MASTER_KEY="too_short_key",
            JWT_SECRET_KEY="test_jwt_secret_key_at_least_32_bytes_long",
        )


def test_encryption_key_validation_non_hex():
    with pytest.raises(ValidationError):
        Settings(
            # 64 chars but non-hex 'zzzz...'
            ENCRYPTION_MASTER_KEY="z" * 64,
            JWT_SECRET_KEY="test_jwt_secret_key_at_least_32_bytes_long",
        )


def test_cors_origins_parsing():
    settings = Settings(
        ENCRYPTION_MASTER_KEY="0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        JWT_SECRET_KEY="test_jwt_secret_key_at_least_32_bytes_long",
        CORS_ORIGINS="http://localhost:3000, http://example.com",
    )
    assert "http://localhost:3000" in settings.CORS_ORIGINS
    assert "http://example.com" in settings.CORS_ORIGINS
