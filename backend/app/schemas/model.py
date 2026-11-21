import uuid
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field


class ModelBase(BaseModel):
    model_identifier: str = Field(min_length=1, max_length=128)
    display_name: str = Field(min_length=1, max_length=128)
    context_window: int = Field(default=8192, ge=512)
    is_enabled: bool = True
    input_price_per_million: float = Field(default=0.0, ge=0.0)
    output_price_per_million: float = Field(default=0.0, ge=0.0)
    capabilities: Optional[dict] = None


class ModelCreate(ModelBase):
    provider_id: uuid.UUID


class ModelUpdate(BaseModel):
    display_name: Optional[str] = None
    context_window: Optional[int] = Field(default=None, ge=512)
    is_enabled: Optional[bool] = None
    input_price_per_million: Optional[float] = Field(default=None, ge=0.0)
    output_price_per_million: Optional[float] = Field(default=None, ge=0.0)
    capabilities: Optional[dict] = None


class ModelResponse(ModelBase):
    id: uuid.UUID
    provider_id: uuid.UUID
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
