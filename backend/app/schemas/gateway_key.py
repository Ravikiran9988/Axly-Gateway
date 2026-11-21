import uuid
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field


class GatewayKeyCreate(BaseModel):
    label: str = Field(min_length=1, max_length=128, description="Human readable label for this API key")
    rate_limit_rpm: int = Field(default=60, ge=1, le=10000, description="Requests per minute limit")
    expires_at: Optional[datetime] = None


class GatewayKeyUpdate(BaseModel):
    label: Optional[str] = Field(default=None, max_length=128)
    is_active: Optional[bool] = None
    rate_limit_rpm: Optional[int] = Field(default=None, ge=1, le=10000)
    expires_at: Optional[datetime] = None


class GatewayKeyResponse(BaseModel):
    id: uuid.UUID
    label: str
    key_preview: str
    is_active: bool
    rate_limit_rpm: int
    expires_at: Optional[datetime] = None
    last_used_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class GatewayKeyCreatedResponse(GatewayKeyResponse):
    """Returned ONLY ONCE when key is created; contains the raw plaintext secret."""
    raw_key: str = Field(description="The full raw API key. Store this securely; it will NOT be shown again.")
