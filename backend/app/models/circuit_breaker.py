import uuid
from datetime import datetime
from typing import List, Optional
from sqlalchemy import DateTime, Integer, JSON, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDMixin, utc_now


class CircuitBreaker(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "circuit_breakers"
    __table_args__ = (
        UniqueConstraint("scope_type", "scope_id", name="uq_circuit_breaker_scope"),
    )

    scope_type: Mapped[str] = mapped_column(
        String(32),
        nullable=False,
        index=True,
        comment="provider or quota_group",
    )
    scope_id: Mapped[str] = mapped_column(
        String(128),
        nullable=False,
        index=True,
        comment="provider name or quota_group UUID",
    )
    state: Mapped[str] = mapped_column(
        String(16),
        default="CLOSED",
        nullable=False,
        comment="CLOSED, OPEN, HALF_OPEN",
    )
    failure_threshold: Mapped[int] = mapped_column(Integer, default=5, nullable=False)
    recovery_timeout_seconds: Mapped[int] = mapped_column(Integer, default=60, nullable=False)
    half_open_probes_allowed: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    current_failures: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    current_half_open_probes: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    last_state_change: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        nullable=False,
    )
    last_failure_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    last_success_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    last_error_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    history: Mapped[Optional[List[dict]]] = mapped_column(JSON, nullable=True, default=list)

    def __repr__(self) -> str:
        return f"<CircuitBreaker scope={self.scope_type}:{self.scope_id} state={self.state}>"
