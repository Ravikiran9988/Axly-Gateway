import uuid
from typing import Optional
from sqlalchemy import Boolean, Float, ForeignKey, Integer, JSON, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDMixin


class Model(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "models"
    __table_args__ = (
        UniqueConstraint("provider_id", "model_identifier", name="uq_provider_model_identifier"),
    )

    provider_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("providers.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    model_identifier: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    display_name: Mapped[str] = mapped_column(String(128), nullable=False)
    context_window: Mapped[int] = mapped_column(Integer, default=8192, nullable=False)
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    input_price_per_million: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    output_price_per_million: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    capabilities: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True, default=dict)

    # Relationships
    provider: Mapped["Provider"] = relationship("Provider", back_populates="models")

    def __repr__(self) -> str:
        return f"<Model identifier={self.model_identifier} enabled={self.is_enabled}>"
