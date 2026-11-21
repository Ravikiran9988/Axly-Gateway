import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class RoutingRuleCreate(BaseModel):
    priority: int = Field(default=1, ge=1)
    source_model: str = Field(default="*")
    target_model_id: Optional[uuid.UUID] = None
    provider_id: Optional[uuid.UUID] = None
    weight: int = Field(default=100, ge=1, le=100)
    conditions: Optional[dict] = None
    is_active: bool = True


class RoutingRuleResponse(RoutingRuleCreate):
    id: uuid.UUID
    profile_id: uuid.UUID
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class RoutingProfileCreate(BaseModel):
    name: str = Field(min_length=1, max_length=128)
    description: Optional[str] = None
    strategy: str = Field(default="priority", description="priority, fallback, latency, cost")
    is_default: bool = False
    max_attempts: int = Field(default=3, ge=1, le=10)
    retry_after_cooldown: bool = True


class RoutingProfilePatch(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=128)
    description: Optional[str] = None
    strategy: Optional[str] = None
    is_default: Optional[bool] = None
    max_attempts: Optional[int] = Field(default=None, ge=1, le=10)
    retry_after_cooldown: Optional[bool] = None


class RoutingProfileResponse(RoutingProfileCreate):
    id: uuid.UUID
    rules: List[RoutingRuleResponse] = []
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ModelAliasCandidateCreate(BaseModel):
    provider_id: uuid.UUID
    model_id: uuid.UUID
    priority: int = Field(default=1, ge=1)
    weight: int = Field(default=100, ge=1, le=100)
    is_active: bool = True


class ModelAliasCandidateResponse(BaseModel):
    id: uuid.UUID
    alias_id: uuid.UUID
    provider_id: uuid.UUID
    model_id: uuid.UUID
    priority: int
    weight: int
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ModelAliasCreate(BaseModel):
    alias_name: str = Field(min_length=1, max_length=128)
    description: Optional[str] = None
    profile_id: Optional[uuid.UUID] = None
    is_enabled: bool = True
    max_attempts: int = Field(default=3, ge=1, le=10)
    timeout_seconds: float = Field(default=30.0, ge=1.0, le=300.0)
    required_capabilities: Optional[Dict[str, Any]] = None
    candidates: List[ModelAliasCandidateCreate] = Field(default_factory=list)


class ModelAliasUpdate(BaseModel):
    alias_name: Optional[str] = Field(default=None, min_length=1, max_length=128)
    description: Optional[str] = None
    profile_id: Optional[uuid.UUID] = None
    is_enabled: Optional[bool] = None
    max_attempts: Optional[int] = Field(default=None, ge=1, le=10)
    timeout_seconds: Optional[float] = Field(default=None, ge=1.0, le=300.0)
    required_capabilities: Optional[Dict[str, Any]] = None


class ModelAliasResponse(BaseModel):
    id: uuid.UUID
    alias_name: str
    description: Optional[str] = None
    profile_id: Optional[uuid.UUID] = None
    is_enabled: bool
    max_attempts: int
    timeout_seconds: float
    required_capabilities: Optional[Dict[str, Any]] = None
    candidates: List[ModelAliasCandidateResponse] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
