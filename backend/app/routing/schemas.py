import enum
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class ErrorCategory(str, enum.Enum):
    AUTHENTICATION = "authentication"
    PERMISSION = "permission"
    RATE_LIMIT = "rate_limit"
    QUOTA_EXHAUSTED = "quota_exhausted"
    MODEL_NOT_FOUND = "model_not_found"
    BAD_REQUEST = "bad_request"
    SAFETY_BLOCKED = "safety_blocked"
    TIMEOUT = "timeout"
    SERVICE_UNAVAILABLE = "service_unavailable"
    NETWORK_ERROR = "network_error"
    UNKNOWN = "unknown"


class QuotaScope(str, enum.Enum):
    CREDENTIAL = "credential"
    PROJECT = "project"
    ORGANIZATION = "organization"
    PROVIDER = "provider"
    MODEL_FAMILY = "model_family"


class CircuitBreakerStateEnum(str, enum.Enum):
    CLOSED = "CLOSED"
    OPEN = "OPEN"
    HALF_OPEN = "HALF_OPEN"


class HealthState(str, enum.Enum):
    HEALTHY = "healthy"
    RATE_LIMITED = "rate_limited"
    TEMPORARILY_UNAVAILABLE = "temporarily_unavailable"
    AUTHENTICATION_FAILURE = "authentication_failure"
    PERMISSION_FAILURE = "permission_failure"
    DISABLED = "disabled"
    RECOVERING = "recovering"


class RoutingStrategyEnum(str, enum.Enum):
    PRIORITY = "priority"
    MANUAL = "manual"
    ALIAS = "alias"
    COST = "cost"
    LATENCY = "latency"


# Internal Routing Structures
class RoutingCandidate(BaseModel):
    provider_name: str
    provider_id: uuid.UUID
    base_url: Optional[str] = None
    model_identifier: str
    model_id: uuid.UUID
    priority: int = 1
    weight: int = 100
    capabilities: Dict[str, Any] = Field(default_factory=dict)
    is_active: bool = True

    model_config = {"from_attributes": True}


class SelectedCredential(BaseModel):
    credential_id: uuid.UUID
    provider_id: uuid.UUID
    label: str
    key_preview: str
    priority: int = 1
    quota_group_id: Optional[uuid.UUID] = None
    decrypted_api_key: str = Field(exclude=True)  # Strictly never serialized
    health_status: str = "healthy"
    cooldown_until: Optional[datetime] = None

    model_config = {"from_attributes": True}


class ErrorClassification(BaseModel):
    category: ErrorCategory
    is_retryable: bool
    scope: QuotaScope
    retry_after_seconds: Optional[float] = None
    cooldown_seconds: float = 0.0
    status_code: int = 500
    reason: str = ""
    confidence: str = "certain"  # "certain" or "uncertain"
    details: Dict[str, Any] = Field(default_factory=dict)


class AttemptRecord(BaseModel):
    attempt_number: int
    provider_name: str
    model_identifier: str
    credential_id: Optional[uuid.UUID] = None
    credential_label: Optional[str] = None
    started_at: datetime
    ended_at: Optional[datetime] = None
    latency_ms: float = 0.0
    result: str  # "success", "failure", "skipped", "circuit_broken", "quota_exhausted"
    status_code: Optional[int] = None
    error_category: Optional[str] = None
    error_message: Optional[str] = None
    retry_decision: Optional[str] = None  # "retry_next_candidate", "exhausted", "abort_non_retryable", "none"
    exclusion_reason: Optional[str] = None
    cooldown_applied: bool = False
    cooldown_seconds: Optional[float] = None
    circuit_breaker_state: Optional[str] = None
    details: Dict[str, Any] = Field(default_factory=dict)


class RoutingDecision(BaseModel):
    request_id: str
    requested_model_or_alias: str
    resolved_profile: Optional[str] = None
    routing_strategy: str = "priority"
    selected_provider: Optional[str] = None
    selected_provider_id: Optional[uuid.UUID] = None
    selected_model: Optional[str] = None
    selected_credential_id: Optional[uuid.UUID] = None
    selected_credential_label: Optional[str] = None
    attempts: List[AttemptRecord] = Field(default_factory=list)
    total_latency_ms: float = 0.0
    success: bool = False
    failure_reason: Optional[str] = None
    final_status_code: int = 200


# Admin API Schemas
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
    provider_name: Optional[str] = None
    model_identifier: Optional[str] = None
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


class ProfilePatch(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=128)
    description: Optional[str] = None
    strategy: Optional[str] = None
    is_default: Optional[bool] = None
    max_attempts: Optional[int] = Field(default=None, ge=1, le=10)
    retry_after_cooldown: Optional[bool] = None


class QuotaGroupCreate(BaseModel):
    name: str = Field(min_length=1, max_length=128)
    description: Optional[str] = None
    provider_id: Optional[uuid.UUID] = None
    scope_type: str = Field(default="project", description="credential, project, organization, provider, model_family")
    tier_level: int = Field(default=1, ge=1)
    monthly_budget_usd: Optional[float] = None
    reset_day_of_month: int = Field(default=1, ge=1, le=31)
    policy: Optional[Dict[str, Any]] = None
    associated_models: Optional[Dict[str, Any]] = None


class QuotaGroupUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=128)
    description: Optional[str] = None
    provider_id: Optional[uuid.UUID] = None
    scope_type: Optional[str] = None
    tier_level: Optional[int] = Field(default=None, ge=1)
    monthly_budget_usd: Optional[float] = None
    reset_day_of_month: Optional[int] = Field(default=None, ge=1, le=31)
    status: Optional[str] = None
    policy: Optional[Dict[str, Any]] = None
    associated_models: Optional[Dict[str, Any]] = None


class QuotaGroupResponse(BaseModel):
    id: uuid.UUID
    name: str
    description: Optional[str] = None
    provider_id: Optional[uuid.UUID] = None
    scope_type: str
    status: str
    tier_level: int
    monthly_budget_usd: Optional[float] = None
    reset_day_of_month: int
    cooldown_until: Optional[datetime] = None
    last_quota_error_at: Optional[datetime] = None
    last_error_category: Optional[str] = None
    last_error_details: Optional[Dict[str, Any]] = None
    reset_info: Optional[Dict[str, Any]] = None
    policy: Optional[Dict[str, Any]] = None
    associated_models: Optional[Dict[str, Any]] = None
    consecutive_failures: int = 0
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class CircuitBreakerResponse(BaseModel):
    id: uuid.UUID
    scope_type: str
    scope_id: str
    state: str
    failure_threshold: int
    recovery_timeout_seconds: int
    half_open_probes_allowed: int
    current_failures: int
    current_half_open_probes: int
    last_state_change: datetime
    last_failure_at: Optional[datetime] = None
    last_success_at: Optional[datetime] = None
    last_error_reason: Optional[str] = None
    history: Optional[List[Dict[str, Any]]] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class CredentialCooldownRequest(BaseModel):
    duration_seconds: float = Field(ge=1.0, le=86400.0, default=60.0)
    reason: str = Field(default="Manual administrator cooldown override", min_length=1)


class RoutingHistoryResponse(BaseModel):
    id: uuid.UUID
    request_id: str
    requested_model_or_alias: str
    resolved_profile: Optional[str] = None
    routing_strategy: str
    attempt_number: int
    provider_name: str
    model_identifier: str
    credential_id: Optional[uuid.UUID] = None
    credential_label: Optional[str] = None
    started_at: datetime
    ended_at: Optional[datetime] = None
    latency_ms: Optional[float] = None
    result: str
    status_code: Optional[int] = None
    error_category: Optional[str] = None
    error_message: Optional[str] = None
    retry_decision: Optional[str] = None
    exclusion_reason: Optional[str] = None
    cooldown_applied: Optional[bool] = None
    cooldown_seconds: Optional[float] = None
    circuit_breaker_state: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}
