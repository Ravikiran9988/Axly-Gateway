import uuid
from datetime import datetime
from typing import List, Optional
from sqlalchemy import DateTime, Float, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDMixin


class QuotaGroup(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "quota_groups"

    name: Mapped[str] = mapped_column(String(128), unique=True, index=True, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    provider_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("providers.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    scope_type: Mapped[str] = mapped_column(
        String(32),
        default="project",
        nullable=False,
        comment="project, organization, provider, model_family, credential",
    )
    status: Mapped[str] = mapped_column(
        String(32),
        default="healthy",
        nullable=False,
        comment="healthy, cooldown, exhausted, degraded",
    )
    tier_level: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    monthly_budget_usd: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    reset_day_of_month: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    cooldown_until: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    last_quota_error_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    last_error_category: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    last_error_details: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True, default=dict)
    reset_info: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True, default=dict)
    policy: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True, default=dict)
    associated_models: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True, default=dict)
    consecutive_failures: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Relationships
    provider: Mapped[Optional["Provider"]] = relationship("Provider")
    credentials: Mapped[List["ProviderCredential"]] = relationship(
        "ProviderCredential", back_populates="quota_group"
    )

    def __repr__(self) -> str:
        return f"<QuotaGroup name={self.name} scope={self.scope_type} status={self.status}>"
