"""
In-memory mock data store for prototype / local development.

Mirrors the four test campaigns defined in the React frontend so the UI can
exercise real API calls without a database.  Swap for the real repository
layer by setting USE_MOCK_DATA=false and providing DATABASE_URL.
"""

from __future__ import annotations

import math
from datetime import UTC, datetime

from app.models.domain import (
    ChannelCreate,
    ChannelOut,
    EventCreate,
    EventOut,
    EventStatus,
    SensorType,
    TestCreate,
    TestOut,
    TestStatus,
    TestUpdate,
)

# ── Channel colour palette ─────────────────────────────────────────────────────
_COLORS = [
    "#58a6ff", "#3fb950", "#d29922", "#f85149",
    "#bc8cff", "#39c5cf", "#ff7b72", "#ffa657",
    "#79c0ff", "#56d364",
]

# ── Channel definitions by test ────────────────────────────────────────────────

def _ch(idx: int, id: str, name: str, unit: str, sensor_type: str,
        rmin: float, rmax: float, desc: str = "") -> ChannelOut:
    return ChannelOut(
        id=id,
        name=name,
        unit=unit,
        sensor_type=SensorType(sensor_type),
        range_min=rmin,
        range_max=rmax,
        color=_COLORS[idx % len(_COLORS)],
        description=desc,
    )


_CHANNELS: dict[str, list[ChannelOut]] = {
    "TEST-2024-001": [
        _ch(0, "CH1", "Load Cell",      "kN",  "voltage",      -100,  100),
        _ch(1, "CH2", "Strain Gauge 1", "µε",  "strain",      -5000, 5000),
        _ch(2, "CH3", "Strain Gauge 2", "µε",  "strain",      -5000, 5000),
        _ch(3, "CH4", "AE Sensor 1",    "V",   "voltage",        -5,    5),
        _ch(4, "CH5", "AE Sensor 2",    "V",   "voltage",        -5,    5),
        _ch(5, "CH6", "Displacement",   "mm",  "voltage",       -25,   25),
    ],
    "TEST-2024-002": [
        _ch(0, "CH1", "Pressure (Inlet)",  "MPa", "pressure",     0,   50),
        _ch(1, "CH2", "Pressure (Vessel)", "MPa", "pressure",     0,   50),
        _ch(2, "CH3", "Hoop Strain 1",     "µε",  "strain",   -8000, 8000),
        _ch(3, "CH4", "Hoop Strain 2",     "µε",  "strain",   -8000, 8000),
        _ch(4, "CH5", "Axial Strain",      "µε",  "strain",   -4000, 4000),
        _ch(5, "CH6", "AE Wideband",       "V",   "voltage",     -5,    5),
        _ch(6, "CH7", "Temperature",       "°C",  "temperature",  15,   80),
    ],
    "TEST-2025-001": [
        _ch(0, "CH1", "Impactor Force",   "kN",  "voltage",        0,   30),
        _ch(1, "CH2", "Accel Z (top)",    "g",   "acceleration", -500,  500),
        _ch(2, "CH3", "Accel Z (btm)",    "g",   "acceleration", -500,  500),
        _ch(3, "CH4", "Strain Rosette X", "µε",  "strain",      -3000, 3000),
        _ch(4, "CH5", "Strain Rosette Y", "µε",  "strain",      -3000, 3000),
        _ch(5, "CH6", "AE Piezo 1",       "V",   "voltage",        -5,    5),
        _ch(6, "CH7", "AE Piezo 2",       "V",   "voltage",        -5,    5),
        _ch(7, "CH8", "Velocity (DIC)",   "m/s", "voltage",       -10,   10),
    ],
    "TEST-2025-002": [
        _ch(0, "CH1", "Shear Load",   "kN", "voltage",  -20,  20),
        _ch(1, "CH2", "Peel Load",    "kN", "voltage",   -5,   5),
        _ch(2, "CH3", "AE RMS",       "mV", "voltage",    0,  500),
        _ch(3, "CH4", "Extensometer", "mm", "voltage",   -2,   2),
    ],
}

# ── Helper: build events for a test ────────────────────────────────────────────

_EVENT_LABELS: dict[str, list[str]] = {
    "TEST-2024-001": [
        "Pre-crack baseline", "Crack initiation", "Crack growth phase 1",
        "Crack growth phase 2", "Rapid propagation", "Near-failure",
        "Fracture event", "Post-fracture", "Repeat specimen A",
        "Repeat specimen B", "High-amplitude cycle", "Final fracture",
    ],
    "TEST-2024-002": [
        "Hydrostatic proof", "Pre-burst slow ramp", "Pre-burst fast ramp",
        "Burst attempt 1", "Burst attempt 2", "Acoustic emission onset",
        "Ligament teardown", "Final burst",
    ],
    "TEST-2025-001": [
        f"Impact shot {i+1:02d} — {[5,10,15,20,25,30][i%6]}J"
        for i in range(24)
    ],
    "TEST-2025-002": [
        "Weld set A — shear", "Weld set A — peel",
        "Weld set B — shear", "Weld set B — peel",
        "Weld set C — mixed", "Final pull-out",
    ],
}

_TRIGGER_CONDITIONS = [
    "threshold > 2.5 V",
    "manual",
    "AE rate > 100 hits/s",
]

_SAMPLE_RATES = [400_000, 500_000, 1_000_000]


def _build_events(test_id: str) -> list[EventOut]:
    labels = _EVENT_LABELS.get(test_id, [])
    channels = _CHANNELS.get(test_id, [])
    base = datetime(2024, 11, 15, 10, 0, 0, tzinfo=UTC)
    events: list[EventOut] = []
    for i, label in enumerate(labels):
        ts = datetime.fromtimestamp(
            base.timestamp() + i * 7200, tz=UTC
        )
        sr = _SAMPLE_RATES[i % 3]
        duration = round(0.5 + (i % 5) * 0.3, 2)
        events.append(EventOut(
            id=f"EVT-{i+1:03d}",
            test_id=test_id,
            name=label,
            description=f"Triggered at {ts.strftime('%H:%M:%S')} UTC",
            timestamp=ts,
            duration=duration,
            sample_rate=sr,
            sample_count=math.ceil(sr * duration),
            status=EventStatus.COMPLETE,
            trigger_condition=_TRIGGER_CONDITIONS[i % 3],
            channel_count=len(channels),
        ))
    return events


# ── Test catalogue ─────────────────────────────────────────────────────────────

_TESTS: list[TestOut] = [
    TestOut(
        id="TEST-2024-001",
        name="Structural Fatigue Campaign A",
        description=(
            "High-cycle fatigue testing on aluminum alloy specimens under axial "
            "loading with concurrent strain and AE monitoring."
        ),
        facility="Lab Bay 3 — Servo-Hydraulic Frame",
        operator="J. Martinez",
        created_at=datetime(2024, 11, 12, 9, 0, 0, tzinfo=UTC),
        status=TestStatus.ACTIVE,
        event_count=12,
        tags=["fatigue", "aluminum", "axial"],
    ),
    TestOut(
        id="TEST-2024-002",
        name="Pressure Vessel Burst Series",
        description=(
            "Quasi-static pressurization to burst with AE and strain gauge arrays. "
            "6061-T6 aluminum vessels."
        ),
        facility="High-Pressure Bay",
        operator="S. Chen",
        created_at=datetime(2024, 12, 3, 14, 30, 0, tzinfo=UTC),
        status=TestStatus.ACTIVE,
        event_count=8,
        tags=["pressure", "burst", "vessel"],
    ),
    TestOut(
        id="TEST-2025-001",
        name="Composite Impact Matrix",
        description=(
            "Drop-weight impact testing on CFRP panels, varying energy levels. "
            "Full-field strain and acceleration."
        ),
        facility="Impact Tower — Cell 2",
        operator="A. Patel",
        created_at=datetime(2025, 1, 22, 8, 15, 0, tzinfo=UTC),
        status=TestStatus.ACTIVE,
        event_count=24,
        tags=["composite", "impact", "CFRP"],
    ),
    TestOut(
        id="TEST-2025-002",
        name="Weld Integrity Survey",
        description=(
            "Ultrasonic and AE monitoring of resistance-spot welds under shear loading."
        ),
        facility="Lab Bay 1",
        operator="R. Thompson",
        created_at=datetime(2025, 2, 14, 11, 0, 0, tzinfo=UTC),
        status=TestStatus.ARCHIVED,
        event_count=6,
        tags=["weld", "ultrasonic", "shear"],
    ),
]

# Build event catalogue eagerly
_EVENTS: dict[str, list[EventOut]] = {t.id: _build_events(t.id) for t in _TESTS}
_TESTS_BY_ID: dict[str, TestOut] = {t.id: t for t in _TESTS}


# ── Repository interface ───────────────────────────────────────────────────────

class MockMetadataRepository:
    """
    Simple in-memory repository that mirrors the frontend mock data.

    All methods are async to match the signature of a real DB-backed
    repository, making it a drop-in substitute.
    """

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
        results = list(_TESTS)
        if status_filter:
            results = [t for t in results if t.status == status_filter]
        if tag:
            results = [t for t in results if tag in t.tags]
        if search:
            q = search.lower()
            results = [
                t for t in results
                if q in t.name.lower()
                or q in t.description.lower()
                or q in t.facility.lower()
                or q in t.operator.lower()
            ]
        total = len(results)
        return results[offset : offset + limit], total

    async def get_test(self, test_id: str) -> TestOut | None:
        return _TESTS_BY_ID.get(test_id)

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
        events = list(_EVENTS.get(test_id, []))
        if status_filter:
            events = [e for e in events if e.status == status_filter]
        if search:
            q = search.lower()
            events = [
                e for e in events
                if q in e.name.lower()
                or q in e.id.lower()
                or (e.trigger_condition and q in e.trigger_condition.lower())
            ]
        total = len(events)
        return events[offset : offset + limit], total

    async def get_event(self, test_id: str, event_id: str) -> EventOut | None:
        for e in _EVENTS.get(test_id, []):
            if e.id == event_id:
                return e
        return None

    # ── Channels ───────────────────────────────────────────────────────────────

    async def list_channels(
        self,
        test_id: str,
        *,
        sensor_type: str | None = None,
    ) -> tuple[list[ChannelOut], int]:
        channels = list(_CHANNELS.get(test_id, []))
        if sensor_type:
            channels = [c for c in channels if c.sensor_type == sensor_type]
        return channels, len(channels)

    async def get_channel(self, test_id: str, channel_id: str) -> ChannelOut | None:
        for c in _CHANNELS.get(test_id, []):
            if c.id == channel_id:
                return c
        return None

    # ── Writes ────────────────────────────────────────────────────────────────

    async def update_test(self, test_id: str, update: TestUpdate) -> TestOut | None:
        t = _TESTS_BY_ID.get(test_id)
        if t is None:
            return None
        patch = {k: v for k, v in update.model_dump().items() if v is not None}
        updated = t.model_copy(update=patch)
        _TESTS_BY_ID[test_id] = updated
        for i, tt in enumerate(_TESTS):
            if tt.id == test_id:
                _TESTS[i] = updated
                break
        return updated

    async def create_test(self, test: TestCreate) -> TestOut:
        year = datetime.now(UTC).year
        prefix = f"TEST-{year}-"
        existing = [t for t in _TESTS if t.id.startswith(prefix)]
        seq = len(existing) + 1
        test_id = f"{prefix}{seq:03d}"

        out = TestOut(
            id=test_id,
            name=test.name,
            description=test.description,
            facility=test.facility,
            operator=test.operator,
            created_at=datetime.now(UTC),
            status=TestStatus.ACTIVE,
            event_count=0,
            tags=test.tags,
        )
        _TESTS.append(out)
        _TESTS_BY_ID[test_id] = out
        _EVENTS[test_id] = []
        _CHANNELS[test_id] = []
        return out

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
        existing = _EVENTS.get(test_id, [])
        seq = len(existing) + 1
        event_id = f"EVT-{seq:03d}"

        out = EventOut(
            id=event_id,
            test_id=test_id,
            name=event.name,
            description=event.description,
            timestamp=datetime.now(UTC),
            duration=duration,
            sample_rate=sample_rate,
            sample_count=sample_count,
            status=EventStatus.COMPLETE,
            trigger_condition=event.trigger_condition,
            channel_count=channel_count,
        )
        _EVENTS.setdefault(test_id, []).append(out)
        # Update event_count on the test
        if test_id in _TESTS_BY_ID:
            t = _TESTS_BY_ID[test_id]
            updated = t.model_copy(update={"event_count": t.event_count + 1})
            _TESTS_BY_ID[test_id] = updated
            for i, tt in enumerate(_TESTS):
                if tt.id == test_id:
                    _TESTS[i] = updated
                    break
        return out

    async def create_channels(
        self, test_id: str, channels: list[ChannelCreate]
    ) -> list[ChannelOut]:
        existing_ids = {c.id for c in _CHANNELS.get(test_id, [])}
        out: list[ChannelOut] = []
        for idx, ch in enumerate(channels):
            if ch.id in existing_ids:
                for c in _CHANNELS[test_id]:
                    if c.id == ch.id:
                        out.append(c)
                        break
                continue
            channel_out = ChannelOut(
                id=ch.id,
                name=ch.name,
                unit=ch.unit,
                sensor_type=ch.sensor_type,
                range_min=ch.range_min,
                range_max=ch.range_max,
                color=_COLORS[idx % len(_COLORS)],
                description=ch.description,
            )
            _CHANNELS.setdefault(test_id, []).append(channel_out)
            existing_ids.add(ch.id)
            out.append(channel_out)
        return out
