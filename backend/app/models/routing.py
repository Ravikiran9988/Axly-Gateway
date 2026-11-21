import uuid
from typing import List, Optional
from sqlalchemy import Boolean, Float, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDMixin


class RoutingProfile(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "routing_profiles"

    name: Mapped[str] = mapped_column(String(128), unique=True, index=True, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    strategy: Mapped[str] = mapped_column(
        String(64),
        default="priority",
        nullable=False,
        comment="priority, fallback, latency, cost",
    )
    is_default: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    max_attempts: Mapped[int] = mapped_column(Integer, default=3, nullable=False)
    retry_after_cooldown: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Relationships
    rules: Mapped[List["RoutingRule"]] = relationship(
        "RoutingRule", back_populates="profile", cascade="all, delete-orphan", order_by="RoutingRule.priority"
    )
    aliases: Mapped[List["ModelAlias"]] = relationship(
        "ModelAlias", back_populates="profile"
    )

    def __repr__(self) -> str:
        return f"<RoutingProfile name={self.name} strategy={self.strategy} default={self.is_default}>"


class RoutingRule(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "routing_rules"

    profile_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("routing_profiles.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    priority: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    source_model: Mapped[str] = mapped_column(
        String(128),
        default="*",
        nullable=False,
        comment="Model pattern to match or * for wildcard",
    )
    target_model_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("models.id", ondelete="SET NULL"),
        nullable=True,
    )
    provider_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("providers.id", ondelete="SET NULL"),
        nullable=True,
    )
    weight: Mapped[int] = mapped_column(Integer, default=100, nullable=False)
    conditions: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True, default=dict)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Relationships
    profile: Mapped["RoutingProfile"] = relationship("RoutingProfile", back_populates="rules")
    target_model: Mapped[Optional["Model"]] = relationship("Model")
    provider: Mapped[Optional["Provider"]] = relationship("Provider")

    def __repr__(self) -> str:
        return f"<RoutingRule priority={self.priority} source={self.source_model} active={self.is_active}>"


class ModelAlias(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "model_aliases"

    alias_name: Mapped[str] = mapped_column(String(128), unique=True, index=True, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    profile_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("routing_profiles.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    max_attempts: Mapped[int] = mapped_column(Integer, default=3, nullable=False)
    timeout_seconds: Mapped[float] = mapped_column(Float, default=30.0, nullable=False)
    required_capabilities: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True, default=dict)

    # Relationships
    profile: Mapped[Optional["RoutingProfile"]] = relationship("RoutingProfile", back_populates="aliases")
    candidates: Mapped[List["ModelAliasCandidate"]] = relationship(
        "ModelAliasCandidate",
        back_populates="alias",
        cascade="all, delete-orphan",
        order_by="ModelAliasCandidate.priority",
    )

    def __repr__(self) -> str:
        return f"<ModelAlias alias={self.alias_name} enabled={self.is_enabled}>"


class ModelAliasCandidate(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "model_alias_candidates"

    alias_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("model_aliases.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    provider_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("providers.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    model_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("models.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    priority: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    weight: Mapped[int] = mapped_column(Integer, default=100, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Relationships
    alias: Mapped["ModelAlias"] = relationship("ModelAlias", back_populates="candidates")
    provider: Mapped["Provider"] = relationship("Provider")
    model: Mapped["Model"] = relationship("Model")

    def __repr__(self) -> str:
        return f"<ModelAliasCandidate priority={self.priority} active={self.is_active}>"
