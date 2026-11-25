"""Add atomic per-minute counters to gateway API keys.

Revision ID: b7a1d2c4e6f8
Revises: f525984bd9ef
Create Date: 2026-11-25
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "b7a1d2c4e6f8"
down_revision: Union[str, None] = "f525984bd9ef"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "gateway_api_keys",
        sa.Column("rate_limit_window_start", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "gateway_api_keys",
        sa.Column("rate_limit_window_count", sa.Integer(), nullable=False, server_default="0"),
    )
    op.alter_column("gateway_api_keys", "rate_limit_window_count", server_default=None)


def downgrade() -> None:
    op.drop_column("gateway_api_keys", "rate_limit_window_count")
    op.drop_column("gateway_api_keys", "rate_limit_window_start")
