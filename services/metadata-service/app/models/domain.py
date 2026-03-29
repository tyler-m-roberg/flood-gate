"""
Pydantic response models for the metadata API.

These are the shapes the API returns — separate from ORM models so the DB
schema can evolve independently of the public contract.
"""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field

# ── Shared ─────────────────────────────────────────────────────────────────────

class TestStatus(StrEnum):
    ACTIVE = "active"
    ARCHIVED = "archived"
    PROCESSING = "processing"


class EventStatus(StrEnum):
    COMPLETE = "complete"
    PARTIAL = "partial"
    FAILED = "failed"


class SensorType(StrEnum):
    VOLTAGE = "voltage"
    CURRENT = "current"
    PRESSURE = "pressure"
    STRAIN = "strain"
    TEMPERATURE = "temperature"
    ACCELERATION = "acceleration"


# ── Channel ────────────────────────────────────────────────────────────────────

class ChannelOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    unit: str
    sensor_type: SensorType
    range_min: float
    range_max: float
    color: str
    description: str = ""


class ChannelListOut(BaseModel):
    items: list[ChannelOut]
    total: int


# ── Event ──────────────────────────────────────────────────────────────────────

class EventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    test_id: str
    name: str
    description: str
    timestamp: datetime
    duration: float = Field(description="Seconds")
    sample_rate: int = Field(description="Hz")
    sample_count: int
    status: EventStatus
    trigger_condition: str | None = None
    channel_count: int


class EventListOut(BaseModel):
    items: list[EventOut]
    total: int


# ── Test ───────────────────────────────────────────────────────────────────────

class TestOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    description: str
    facility: str
    operator: str
    created_at: datetime
    status: TestStatus
    event_count: int
    tags: list[str]


class TestListOut(BaseModel):
    items: list[TestOut]
    total: int


# ── Pagination ─────────────────────────────────────────────────────────────────

class PaginationParams(BaseModel):
    offset: Annotated[int, Field(ge=0)] = 0
    limit: Annotated[int, Field(ge=1, le=500)] = 50


# ── Input schemas (creation) ───────────────────────────────────────────────────

class TestCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str = ""
    facility: str = Field(min_length=1, max_length=200)
    operator: str = Field(min_length=1, max_length=100)
    tags: list[str] = []


class TestUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    facility: str | None = None
    operator: str | None = None
    tags: list[str] | None = None
    status: TestStatus | None = None


class EventCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str = ""
    trigger_condition: str | None = None


class ChannelCreate(BaseModel):
    id: str = Field(min_length=1, max_length=20)
    name: str = Field(min_length=1, max_length=100)
    unit: str = Field(min_length=1, max_length=20)
    sensor_type: SensorType
    range_min: float
    range_max: float
    description: str = ""


class UploadEventPayload(BaseModel):
    event: EventCreate
    channels: list[ChannelCreate] = Field(min_length=1)


# ── Health ─────────────────────────────────────────────────────────────────────

class HealthOut(BaseModel):
    status: str
    service: str
    version: str
    environment: str
