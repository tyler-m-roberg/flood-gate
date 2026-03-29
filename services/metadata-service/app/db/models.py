"""
SQLAlchemy ORM models for the metadata database.

Three tables: tests, events, channels.
- Events belong to a test (FK test_id).
- Channels belong to a test (FK test_id).
- event_count and channel_count are computed in the repository layer,
  not stored as columns.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    PrimaryKeyConstraint,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class TestModel(Base):
    __tablename__ = "tests"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, server_default="")
    facility: Mapped[str] = mapped_column(String(200), nullable=False)
    operator: Mapped[str] = mapped_column(String(100), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    status: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    tags: Mapped[list[str]] = mapped_column(
        ARRAY(Text), nullable=False, server_default="{}"
    )

    events: Mapped[list[EventModel]] = relationship(
        back_populates="test", cascade="all, delete-orphan"
    )
    channels: Mapped[list[ChannelModel]] = relationship(
        back_populates="test", cascade="all, delete-orphan"
    )

    __table_args__ = (
        Index("ix_tests_tags", "tags", postgresql_using="gin"),
    )


class EventModel(Base):
    __tablename__ = "events"

    test_id: Mapped[str] = mapped_column(
        String(32), ForeignKey("tests.id", ondelete="CASCADE"), nullable=False
    )
    id: Mapped[str] = mapped_column(String(32), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, server_default="")
    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    duration: Mapped[float] = mapped_column(Float, nullable=False)
    sample_rate: Mapped[int] = mapped_column(Integer, nullable=False)
    sample_count: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    trigger_condition: Mapped[str | None] = mapped_column(String(200), nullable=True)

    test: Mapped[TestModel] = relationship(back_populates="events")

    __table_args__ = (
        PrimaryKeyConstraint("test_id", "id"),
    )


class ChannelModel(Base):
    __tablename__ = "channels"

    test_id: Mapped[str] = mapped_column(
        String(32), ForeignKey("tests.id", ondelete="CASCADE"), nullable=False
    )
    id: Mapped[str] = mapped_column(String(32), nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    unit: Mapped[str] = mapped_column(String(20), nullable=False)
    sensor_type: Mapped[str] = mapped_column(String(20), nullable=False)
    range_min: Mapped[float] = mapped_column(Float, nullable=False)
    range_max: Mapped[float] = mapped_column(Float, nullable=False)
    color: Mapped[str] = mapped_column(String(10), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, server_default="")

    test: Mapped[TestModel] = relationship(back_populates="channels")

    __table_args__ = (
        PrimaryKeyConstraint("test_id", "id"),
    )
