"""
PostgreSQL-backed metadata repository.

Implements the same interface as MockMetadataRepository using
async SQLAlchemy queries.  event_count and channel_count are
computed via correlated subqueries — never stored.
"""

from __future__ import annotations

import re
from datetime import UTC, datetime

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import ChannelModel, EventModel, TestModel
from app.models.domain import (
    ChannelCreate,
    ChannelOut,
    EventCreate,
    EventOut,
    EventStatus,
    TestCreate,
    TestOut,
    TestStatus,
    TestUpdate,
)

_COLORS = [
    "#58a6ff", "#3fb950", "#d29922", "#f85149",
    "#bc8cff", "#39c5cf", "#ff7b72", "#ffa657",
    "#79c0ff", "#56d364",
]


class PgMetadataRepository:
    """Async repository backed by PostgreSQL via SQLAlchemy."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    # ── helpers ────────────────────────────────────────────────────────────────

    @staticmethod
    def _event_count_subq():
        """Correlated scalar subquery: count of events per test."""
        return (
            select(func.count(EventModel.id))
            .where(EventModel.test_id == TestModel.id)
            .correlate(TestModel)
            .scalar_subquery()
            .label("event_count")
        )

    @staticmethod
    def _channel_count_subq(test_id_col):
        """Correlated scalar subquery: count of channels for the test."""
        return (
            select(func.count(ChannelModel.id))
            .where(ChannelModel.test_id == test_id_col)
            .correlate(EventModel)
            .scalar_subquery()
            .label("channel_count")
        )

    @staticmethod
    def _test_to_out(row) -> TestOut:
        t = row[0]  # TestModel instance
        return TestOut(
            id=t.id,
            name=t.name,
            description=t.description,
            facility=t.facility,
            operator=t.operator,
            created_at=t.created_at,
            status=t.status,
            event_count=row.event_count,
            tags=list(t.tags) if t.tags else [],
        )

    @staticmethod
    def _event_to_out(row) -> EventOut:
        e = row[0]  # EventModel instance
        return EventOut(
            id=e.id,
            test_id=e.test_id,
            name=e.name,
            description=e.description,
            timestamp=e.timestamp,
            duration=e.duration,
            sample_rate=e.sample_rate,
            sample_count=e.sample_count,
            status=e.status,
            trigger_condition=e.trigger_condition,
            channel_count=row.channel_count,
        )

    # ── Tests ──────────────────────────────────────────────────────────────────

    async def list_tests(
        self,
        *,
        status_filter: str | None = None,
        tag: str | None = None,
        search: str | None = None,
        offset: int = 0,
        limit: int = 50,
    ) -> tuple[list[TestOut], int]:
        event_count = self._event_count_subq()
        base = select(TestModel, event_count)

        if status_filter:
            base = base.where(TestModel.status == status_filter)
        if tag:
            base = base.where(TestModel.tags.any(tag))
        if search:
            q = f"%{search}%"
            base = base.where(
                or_(
                    TestModel.name.ilike(q),
                    TestModel.description.ilike(q),
                    TestModel.facility.ilike(q),
                    TestModel.operator.ilike(q),
                )
            )

        # Total count (before pagination)
        count_q = select(func.count()).select_from(base.subquery())
        total = (await self._session.execute(count_q)).scalar_one()

        # Paginated results
        rows = (
            await self._session.execute(
                base.order_by(TestModel.created_at.desc()).offset(offset).limit(limit)
            )
        ).all()

        return [self._test_to_out(r) for r in rows], total

    async def get_test(self, test_id: str) -> TestOut | None:
        event_count = self._event_count_subq()
        row = (
            await self._session.execute(
                select(TestModel, event_count).where(TestModel.id == test_id)
            )
        ).first()
        if row is None:
            return None
        return self._test_to_out(row)

    # ── Events ─────────────────────────────────────────────────────────────────

    async def list_events(
        self,
        test_id: str,
        *,
        status_filter: str | None = None,
        search: str | None = None,
        offset: int = 0,
        limit: int = 50,
    ) -> tuple[list[EventOut], int]:
        channel_count = self._channel_count_subq(EventModel.test_id)
        base = (
            select(EventModel, channel_count)
            .where(EventModel.test_id == test_id)
        )

        if status_filter:
            base = base.where(EventModel.status == status_filter)
        if search:
            q = f"%{search}%"
            base = base.where(
                or_(
                    EventModel.name.ilike(q),
                    EventModel.id.ilike(q),
                    EventModel.trigger_condition.ilike(q),
                )
            )

        count_q = select(func.count()).select_from(base.subquery())
        total = (await self._session.execute(count_q)).scalar_one()

        rows = (
            await self._session.execute(
                base.order_by(EventModel.timestamp.asc()).offset(offset).limit(limit)
            )
        ).all()

        return [self._event_to_out(r) for r in rows], total

    async def get_event(self, test_id: str, event_id: str) -> EventOut | None:
        channel_count = self._channel_count_subq(EventModel.test_id)
        row = (
            await self._session.execute(
                select(EventModel, channel_count).where(
                    EventModel.test_id == test_id,
                    EventModel.id == event_id,
                )
            )
        ).first()
        if row is None:
            return None
        return self._event_to_out(row)

    # ── Channels ───────────────────────────────────────────────────────────────

    async def list_channels(
        self,
        test_id: str,
        *,
        sensor_type: str | None = None,
    ) -> tuple[list[ChannelOut], int]:
        base = select(ChannelModel).where(ChannelModel.test_id == test_id)
        if sensor_type:
            base = base.where(ChannelModel.sensor_type == sensor_type)

        rows = (await self._session.execute(base.order_by(ChannelModel.id))).scalars().all()
        items = [
            ChannelOut(
                id=c.id,
                name=c.name,
                unit=c.unit,
                sensor_type=c.sensor_type,
                range_min=c.range_min,
                range_max=c.range_max,
                color=c.color,
                description=c.description,
            )
            for c in rows
        ]
        return items, len(items)

    async def get_channel(self, test_id: str, channel_id: str) -> ChannelOut | None:
        row = (
            await self._session.execute(
                select(ChannelModel).where(
                    ChannelModel.test_id == test_id,
                    ChannelModel.id == channel_id,
                )
            )
        ).scalars().first()
        if row is None:
            return None
        return ChannelOut(
            id=row.id,
            name=row.name,
            unit=row.unit,
            sensor_type=row.sensor_type,
            range_min=row.range_min,
            range_max=row.range_max,
            color=row.color,
            description=row.description,
        )

    # ── Writes ────────────────────────────────────────────────────────────────

    async def _next_test_id(self) -> str:
        year = datetime.now(UTC).year
        prefix = f"TEST-{year}-"
        row = (
            await self._session.execute(
                select(TestModel.id)
                .where(TestModel.id.like(f"{prefix}%"))
                .order_by(TestModel.id.desc())
                .limit(1)
            )
        ).scalar_one_or_none()
        if row:
            m = re.search(r"(\d+)$", row)
            seq = int(m.group(1)) + 1 if m else 1
        else:
            seq = 1
        return f"{prefix}{seq:03d}"

    async def _next_event_id(self, test_id: str) -> str:
        row = (
            await self._session.execute(
                select(EventModel.id)
                .where(EventModel.test_id == test_id)
                .order_by(EventModel.id.desc())
                .limit(1)
            )
        ).scalar_one_or_none()
        if row:
            m = re.search(r"(\d+)$", row)
            seq = int(m.group(1)) + 1 if m else 1
        else:
            seq = 1
        return f"EVT-{seq:03d}"

    async def update_test(self, test_id: str, update: TestUpdate) -> TestOut | None:
        row = (
            await self._session.execute(
                select(TestModel).where(TestModel.id == test_id)
            )
        ).scalars().first()
        if row is None:
            return None
        patch = {k: v for k, v in update.model_dump().items() if v is not None}
        for key, value in patch.items():
            setattr(row, key, value)
        await self._session.flush()
        return await self.get_test(test_id)

    async def create_test(self, test: TestCreate) -> TestOut:
        test_id = await self._next_test_id()
        model = TestModel(
            id=test_id,
            name=test.name,
            description=test.description,
            facility=test.facility,
            operator=test.operator,
            created_at=datetime.now(UTC),
            status=TestStatus.ACTIVE,
            tags=test.tags,
        )
        self._session.add(model)
        await self._session.flush()
        return TestOut(
            id=model.id,
            name=model.name,
            description=model.description,
            facility=model.facility,
            operator=model.operator,
            created_at=model.created_at,
            status=model.status,
            event_count=0,
            tags=list(model.tags) if model.tags else [],
        )

    async def create_event(
        self,
        test_id: str,
        event: EventCreate,
        *,
        sample_rate: int,
        sample_count: int,
        duration: float,
        channel_count: int,
    ) -> EventOut:
        event_id = await self._next_event_id(test_id)
        model = EventModel(
            test_id=test_id,
            id=event_id,
            name=event.name,
            description=event.description,
            timestamp=datetime.now(UTC),
            duration=duration,
            sample_rate=sample_rate,
            sample_count=sample_count,
            status=EventStatus.COMPLETE,
            trigger_condition=event.trigger_condition,
        )
        self._session.add(model)
        await self._session.flush()
        return EventOut(
            id=model.id,
            test_id=model.test_id,
            name=model.name,
            description=model.description,
            timestamp=model.timestamp,
            duration=model.duration,
            sample_rate=model.sample_rate,
            sample_count=model.sample_count,
            status=model.status,
            trigger_condition=model.trigger_condition,
            channel_count=channel_count,
        )

    async def create_channels(
        self, test_id: str, channels: list[ChannelCreate]
    ) -> list[ChannelOut]:
        out: list[ChannelOut] = []
        for idx, ch in enumerate(channels):
            existing = (
                await self._session.execute(
                    select(ChannelModel).where(
                        ChannelModel.test_id == test_id,
                        ChannelModel.id == ch.id,
                    )
                )
            ).scalars().first()
            if existing:
                out.append(ChannelOut(
                    id=existing.id, name=existing.name, unit=existing.unit,
                    sensor_type=existing.sensor_type, range_min=existing.range_min,
                    range_max=existing.range_max, color=existing.color,
                    description=existing.description,
                ))
                continue
            color = _COLORS[idx % len(_COLORS)]
            model = ChannelModel(
                test_id=test_id, id=ch.id, name=ch.name, unit=ch.unit,
                sensor_type=ch.sensor_type, range_min=ch.range_min,
                range_max=ch.range_max, color=color, description=ch.description,
            )
            self._session.add(model)
            await self._session.flush()
            out.append(ChannelOut(
                id=model.id, name=model.name, unit=model.unit,
                sensor_type=model.sensor_type, range_min=model.range_min,
                range_max=model.range_max, color=model.color,
                description=model.description,
            ))
        return out
