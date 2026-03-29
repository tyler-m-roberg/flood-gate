"""Initial schema — tests, events, channels

Revision ID: 001
Revises: None
Create Date: 2026-03-27
"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── tests ──────────────────────────────────────────────────────────────────
    op.create_table(
        "tests",
        sa.Column("id", sa.String(32), primary_key=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("description", sa.Text(), nullable=False, server_default=""),
        sa.Column("facility", sa.String(200), nullable=False),
        sa.Column("operator", sa.String(100), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column(
            "tags",
            postgresql.ARRAY(sa.Text()),
            nullable=False,
            server_default="{}",
        ),
    )
    op.create_index("ix_tests_status", "tests", ["status"])
    op.create_index("ix_tests_tags", "tests", ["tags"], postgresql_using="gin")

    # ── events ─────────────────────────────────────────────────────────────────
    op.create_table(
        "events",
        sa.Column("test_id", sa.String(32), nullable=False),
        sa.Column("id", sa.String(32), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("description", sa.Text(), nullable=False, server_default=""),
        sa.Column("timestamp", sa.DateTime(timezone=True), nullable=False),
        sa.Column("duration", sa.Float(), nullable=False),
        sa.Column("sample_rate", sa.Integer(), nullable=False),
        sa.Column("sample_count", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("trigger_condition", sa.String(200), nullable=True),
        sa.PrimaryKeyConstraint("test_id", "id"),
        sa.ForeignKeyConstraint(
            ["test_id"], ["tests.id"], ondelete="CASCADE"
        ),
    )
    op.create_index("ix_events_test_id", "events", ["test_id"])
    op.create_index("ix_events_status", "events", ["status"])

    # ── channels ───────────────────────────────────────────────────────────────
    op.create_table(
        "channels",
        sa.Column("test_id", sa.String(32), nullable=False),
        sa.Column("id", sa.String(32), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("unit", sa.String(20), nullable=False),
        sa.Column("sensor_type", sa.String(20), nullable=False),
        sa.Column("range_min", sa.Float(), nullable=False),
        sa.Column("range_max", sa.Float(), nullable=False),
        sa.Column("color", sa.String(10), nullable=False),
        sa.Column("description", sa.Text(), nullable=False, server_default=""),
        sa.PrimaryKeyConstraint("test_id", "id"),
        sa.ForeignKeyConstraint(
            ["test_id"], ["tests.id"], ondelete="CASCADE"
        ),
    )
    op.create_index("ix_channels_test_id", "channels", ["test_id"])


def downgrade() -> None:
    op.drop_table("channels")
    op.drop_table("events")
    op.drop_table("tests")
