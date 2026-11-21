import uuid
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field


class ProviderBase(BaseModel):
    name: str = Field(min_length=2, max_length=64)
    display_name: str = Field(min_length=2, max_length=128)
    description: Optional[str] = None
    base_url: Optional[str] = None
    is_enabled: bool = True
    config_schema: Optional[dict] = None


class ProviderCreate(ProviderBase):
    pass


class ProviderUpdate(BaseModel):
    display_name: Optional[str] = None
    description: Optional[str] = None
    base_url: Optional[str] = None
    is_enabled: Optional[bool] = None
    config_schema: Optional[dict] = None


class ProviderResponse(ProviderBase):
    id: uuid.UUID
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
