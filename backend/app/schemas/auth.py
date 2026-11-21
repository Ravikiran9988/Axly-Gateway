import uuid
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, EmailStr, Field


class SetupStatusResponse(BaseModel):
    is_setup_required: bool
    app_name: str
    version: str


class SetupRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, description="Admin password must be at least 8 characters")


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in_seconds: int


class AdminProfileResponse(BaseModel):
    id: uuid.UUID
    email: EmailStr
    is_active: bool
    last_login_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
