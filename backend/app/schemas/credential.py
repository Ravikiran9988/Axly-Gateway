import uuid
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field


class CredentialCreate(BaseModel):
    provider_id: Optional[uuid.UUID] = None
    quota_group_id: Optional[uuid.UUID] = None
    label: str = Field(min_length=1, max_length=128)
    api_key: str = Field(min_length=1, description="Raw provider API key to encrypt at rest")
    priority: int = Field(default=1, ge=1)
    rate_limit_rpm: Optional[int] = Field(default=None, ge=1)
    rate_limit_tpm: Optional[int] = Field(default=None, ge=1)


class CredentialUpdate(BaseModel):
    label: Optional[str] = Field(default=None, max_length=128)
    quota_group_id: Optional[uuid.UUID] = None
    api_key: Optional[str] = Field(default=None, min_length=1)
    is_active: Optional[bool] = None
    priority: Optional[int] = Field(default=None, ge=1)
    rate_limit_rpm: Optional[int] = Field(default=None, ge=1)
    rate_limit_tpm: Optional[int] = Field(default=None, ge=1)


class CredentialHealthResponse(BaseModel):
    id: uuid.UUID
    credential_id: uuid.UUID
    status: str
    consecutive_failures: int
    consecutive_cooldowns: int = 0
    response_time_ms: Optional[float] = None
    last_checked_at: Optional[datetime] = None
    last_success_at: Optional[datetime] = None
    last_failure_at: Optional[datetime] = None
    last_error_category: Optional[str] = None
    last_error_code: Optional[str] = None
    last_error_message: Optional[str] = None
    cooldown_until: Optional[datetime] = None
    cooldown_reason: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class CredentialResponse(BaseModel):
    id: uuid.UUID
    provider_id: uuid.UUID
    quota_group_id: Optional[uuid.UUID] = None
    label: str
    key_preview: str
    priority: int = 1
    is_active: bool
    rate_limit_rpm: Optional[int] = None
    rate_limit_tpm: Optional[int] = None
    requests_count: int = 0
    tokens_count: int = 0
    errors_count: int = 0
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class CredentialCooldownRequest(BaseModel):
    duration_seconds: float = Field(ge=1.0, le=86400.0, default=60.0)
    reason: str = Field(default="Administrator manual cooldown", min_length=1)


class CredentialRecoverRequest(BaseModel):
    validate_upstream: bool = Field(default=True, description="Execute upstream connectivity test before clearing health errors")
