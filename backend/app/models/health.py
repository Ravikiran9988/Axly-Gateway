import uuid
from datetime import datetime
from typing import Optional
from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDMixin


class CredentialHealth(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "credential_health"

    credential_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("provider_credentials.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
        index=True,
    )
    status: Mapped[str] = mapped_column(
        String(32),
        default="healthy",
        nullable=False,
        index=True,
        comment="healthy, degraded, exhausted, error",
    )
    consecutive_failures: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    response_time_ms: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    last_checked_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    last_success_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    last_failure_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    last_error_category: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    last_error_code: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    last_error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    cooldown_until: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    cooldown_reason: Mapped[Optional[str]] = mapped_column(String(256), nullable=True)
    consecutive_cooldowns: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Relationship
    credential: Mapped["ProviderCredential"] = relationship("ProviderCredential", back_populates="health")

    def __repr__(self) -> str:
        return f"<CredentialHealth credential_id={self.credential_id} status={self.status}>"
