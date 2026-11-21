import json
import os
from functools import lru_cache
from typing import List, Union
from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=[".env", "../.env"],
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # Application
    APP_NAME: str = "AXLY Gateway"
    APP_VERSION: str = "0.1.0"
    ENVIRONMENT: str = "development"
    DEBUG: bool = False
    BACKEND_HOST: str = "0.0.0.0"
    BACKEND_PORT: int = 8000

    # Database
    DATABASE_URL: str = Field(
        default="postgresql+asyncpg://postgres:postgres@localhost:5432/axly_gateway",
        description="Async database connection string for SQLAlchemy async engine",
    )
    DATABASE_SYNC_URL: str = Field(
        default="postgresql+psycopg://postgres:postgres@localhost:5432/axly_gateway",
        description="Sync database connection string for Alembic migrations",
    )
    DB_POOL_SIZE: int = 10
    DB_MAX_OVERFLOW: int = 20
    DB_POOL_TIMEOUT: int = 30
    DB_POOL_RECYCLE: int = 1800

    # Cryptography & Security
    ENCRYPTION_MASTER_KEY: str = Field(
        default="0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        description="256-bit AES master key in hex format (64 hex characters)",
    )
    JWT_SECRET_KEY: str = Field(
        default="replace_with_a_secure_random_hex_jwt_secret_key_at_least_32_bytes",
        description="Secret key for signing JWT administrator session tokens",
    )
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440  # 24 hours

    # CORS
    CORS_ORIGINS: Union[List[str], str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]
    ALLOWED_HOSTS: Union[List[str], str] = ["*"]

    # Logging & Rate Limiting
    LOG_LEVEL: str = "INFO"
    MAX_REQUEST_SIZE_BYTES: int = 10 * 1024 * 1024  # 10 MB
    RATE_LIMIT_DEFAULT_RPM: int = 60

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def assemble_cors_origins(cls, v: Union[str, List[str]]) -> List[str]:
        if isinstance(v, str):
            try:
                parsed = json.loads(v)
                if isinstance(parsed, list):
                    return [str(item) for item in parsed]
            except json.JSONDecodeError:
                return [i.strip() for i in v.split(",") if i.strip()]
        return v

    @field_validator("ALLOWED_HOSTS", mode="before")
    @classmethod
    def assemble_allowed_hosts(cls, v: Union[str, List[str]]) -> List[str]:
        if isinstance(v, str):
            try:
                parsed = json.loads(v)
                if isinstance(parsed, list):
                    return [str(item) for item in parsed]
            except json.JSONDecodeError:
                return [i.strip() for i in v.split(",") if i.strip()]
        return v

    @field_validator("ENCRYPTION_MASTER_KEY")
    @classmethod
    def validate_encryption_key(cls, v: str) -> str:
        clean = v.strip()
        if len(clean) != 64:
            # Must be 32 bytes (64 hex characters)
            raise ValueError(
                f"ENCRYPTION_MASTER_KEY must be a 64-character hex string (32 bytes). Got length {len(clean)}"
            )
        try:
            bytes.fromhex(clean)
        except ValueError as exc:
            raise ValueError("ENCRYPTION_MASTER_KEY must be a valid hex string") from exc
        return clean


@lru_cache()
def get_settings() -> Settings:
    return Settings()
