from datetime import datetime
from typing import Any, Dict, Generic, List, Optional, TypeVar
from pydantic import BaseModel, Field

DataT = TypeVar("DataT")


class APIResponse(BaseModel, Generic[DataT]):
    success: bool = True
    data: Optional[DataT] = None
    message: Optional[str] = None
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class ErrorDetail(BaseModel):
    code: str
    message: str
    details: Optional[Any] = None


class ErrorResponse(BaseModel):
    success: bool = False
    error: ErrorDetail
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class HealthResponse(BaseModel):
    status: str = "ok"
    version: str
    environment: str
    uptime_seconds: float
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class ReadyComponentCheck(BaseModel):
    status: str
    latency_ms: Optional[float] = None
    message: Optional[str] = None


class ReadyResponse(BaseModel):
    ready: bool
    status: str
    checks: Dict[str, ReadyComponentCheck]
    timestamp: datetime = Field(default_factory=datetime.utcnow)
