import uuid
from datetime import datetime
from typing import Optional
from sqlalchemy import Boolean, DateTime, Float, Integer, JSON, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, UUIDMixin, utc_now


class RoutingHistory(Base, UUIDMixin):
    __tablename__ = "routing_history"

    request_id: Mapped[str] = mapped_column(String(64), index=True, nullable=False)
    requested_model_or_alias: Mapped[str] = mapped_column(String(128), nullable=False)
    resolved_profile: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    routing_strategy: Mapped[str] = mapped_column(String(64), default="priority", nullable=False)
    attempt_number: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    provider_name: Mapped[str] = mapped_column(String(64), nullable=False)
    model_identifier: Mapped[str] = mapped_column(String(128), nullable=False)
    credential_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    credential_label: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    ended_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    latency_ms: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    result: Mapped[str] = mapped_column(
        String(32),
        nullable=False,
        comment="success, failure, skipped, circuit_broken, quota_exhausted",
    )
    status_code: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    error_category: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    retry_decision: Mapped[Optional[str]] = mapped_column(
        String(64),
        nullable=True,
        comment="retry_next_candidate, exhausted, abort_non_retryable, none",
    )
    exclusion_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    cooldown_applied: Mapped[Optional[bool]] = mapped_column(Boolean, default=False, nullable=True)
    cooldown_seconds: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    circuit_breaker_state: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    details: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        nullable=False,
        index=True,
    )

    def __repr__(self) -> str:
        return f"<RoutingHistory req_id={self.request_id} attempt={self.attempt_number} result={self.result}>"
