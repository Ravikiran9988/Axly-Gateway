import uuid
from typing import Optional
from sqlalchemy import Boolean, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDMixin


class ProviderCredential(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "provider_credentials"

    provider_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("providers.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    quota_group_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("quota_groups.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    label: Mapped[str] = mapped_column(String(128), nullable=False)
    encrypted_api_key: Mapped[str] = mapped_column(Text, nullable=False)
    key_preview: Mapped[str] = mapped_column(String(32), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    priority: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    rate_limit_rpm: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    rate_limit_tpm: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    requests_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    tokens_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    errors_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Relationships
    provider: Mapped["Provider"] = relationship("Provider", back_populates="credentials")
    quota_group: Mapped[Optional["QuotaGroup"]] = relationship("QuotaGroup", back_populates="credentials")
    health: Mapped[Optional["CredentialHealth"]] = relationship(
        "CredentialHealth", back_populates="credential", uselist=False, cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<ProviderCredential label={self.label} active={self.is_active}>"
