"""Seed mock data — 4 tests, 50 events, 25 channels

Revision ID: 002
Revises: 001
Create Date: 2026-03-27

All data is hardcoded (not imported from mock.py) so the migration is
self-contained and stable even if mock.py changes later.
Uses INSERT ... ON CONFLICT DO NOTHING for idempotency.
"""
from __future__ import annotations

import math
from datetime import UTC, datetime
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "002"
down_revision: Union[str, None] = "001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# ── Color palette (matches frontend mockData.ts) ──────────────────────────────

COLORS = [
    "#58a6ff", "#3fb950", "#d29922", "#f85149",
    "#bc8cff", "#39c5cf", "#ff7b72", "#ffa657",
    "#79c0ff", "#56d364",
]

# ── Channel definitions per test ──────────────────────────────────────────────

CHANNELS: dict[str, list[dict]] = {
    "TEST-2024-001": [
        {"id": "CH1", "name": "Load Cell",      "unit": "kN",  "sensor_type": "voltage",  "range_min": -100,  "range_max": 100},
        {"id": "CH2", "name": "Strain Gauge 1", "unit": "µε",  "sensor_type": "strain",   "range_min": -5000, "range_max": 5000},
        {"id": "CH3", "name": "Strain Gauge 2", "unit": "µε",  "sensor_type": "strain",   "range_min": -5000, "range_max": 5000},
        {"id": "CH4", "name": "AE Sensor 1",    "unit": "V",   "sensor_type": "voltage",  "range_min": -5,    "range_max": 5},
        {"id": "CH5", "name": "AE Sensor 2",    "unit": "V",   "sensor_type": "voltage",  "range_min": -5,    "range_max": 5},
        {"id": "CH6", "name": "Displacement",   "unit": "mm",  "sensor_type": "voltage",  "range_min": -25,   "range_max": 25},
    ],
    "TEST-2024-002": [
        {"id": "CH1", "name": "Pressure (Inlet)",  "unit": "MPa", "sensor_type": "pressure",    "range_min": 0,     "range_max": 50},
        {"id": "CH2", "name": "Pressure (Vessel)", "unit": "MPa", "sensor_type": "pressure",    "range_min": 0,     "range_max": 50},
        {"id": "CH3", "name": "Hoop Strain 1",     "unit": "µε",  "sensor_type": "strain",      "range_min": -8000, "range_max": 8000},
        {"id": "CH4", "name": "Hoop Strain 2",     "unit": "µε",  "sensor_type": "strain",      "range_min": -8000, "range_max": 8000},
        {"id": "CH5", "name": "Axial Strain",      "unit": "µε",  "sensor_type": "strain",      "range_min": -4000, "range_max": 4000},
        {"id": "CH6", "name": "AE Wideband",       "unit": "V",   "sensor_type": "voltage",     "range_min": -5,    "range_max": 5},
        {"id": "CH7", "name": "Temperature",       "unit": "°C",  "sensor_type": "temperature", "range_min": 15,    "range_max": 80},
    ],
    "TEST-2025-001": [
        {"id": "CH1", "name": "Impactor Force",   "unit": "kN",  "sensor_type": "voltage",      "range_min": 0,     "range_max": 30},
        {"id": "CH2", "name": "Accel Z (top)",    "unit": "g",   "sensor_type": "acceleration", "range_min": -500,  "range_max": 500},
        {"id": "CH3", "name": "Accel Z (btm)",    "unit": "g",   "sensor_type": "acceleration", "range_min": -500,  "range_max": 500},
        {"id": "CH4", "name": "Strain Rosette X", "unit": "µε",  "sensor_type": "strain",       "range_min": -3000, "range_max": 3000},
        {"id": "CH5", "name": "Strain Rosette Y", "unit": "µε",  "sensor_type": "strain",       "range_min": -3000, "range_max": 3000},
        {"id": "CH6", "name": "AE Piezo 1",       "unit": "V",   "sensor_type": "voltage",      "range_min": -5,    "range_max": 5},
        {"id": "CH7", "name": "AE Piezo 2",       "unit": "V",   "sensor_type": "voltage",      "range_min": -5,    "range_max": 5},
        {"id": "CH8", "name": "Velocity (DIC)",   "unit": "m/s", "sensor_type": "voltage",      "range_min": -10,   "range_max": 10},
    ],
    "TEST-2025-002": [
        {"id": "CH1", "name": "Shear Load",   "unit": "kN", "sensor_type": "voltage", "range_min": -20, "range_max": 20},
        {"id": "CH2", "name": "Peel Load",    "unit": "kN", "sensor_type": "voltage", "range_min": -5,  "range_max": 5},
        {"id": "CH3", "name": "AE RMS",       "unit": "mV", "sensor_type": "voltage", "range_min": 0,   "range_max": 500},
        {"id": "CH4", "name": "Extensometer", "unit": "mm", "sensor_type": "voltage", "range_min": -2,  "range_max": 2},
    ],
}

# ── Test definitions ──────────────────────────────────────────────────────────

TESTS = [
    {
        "id": "TEST-2024-001",
        "name": "Structural Fatigue Campaign A",
        "description": (
            "High-cycle fatigue testing on aluminum alloy specimens under axial "
            "loading with concurrent strain and AE monitoring."
        ),
        "facility": "Lab Bay 3 — Servo-Hydraulic Frame",
        "operator": "J. Martinez",
        "created_at": datetime(2024, 11, 12, 9, 0, 0, tzinfo=UTC),
        "status": "active",
        "tags": ["fatigue", "aluminum", "axial"],
    },
    {
        "id": "TEST-2024-002",
        "name": "Pressure Vessel Burst Series",
        "description": (
            "Quasi-static pressurization to burst with AE and strain gauge arrays. "
            "6061-T6 aluminum vessels."
        ),
        "facility": "High-Pressure Bay",
        "operator": "S. Chen",
        "created_at": datetime(2024, 12, 3, 14, 30, 0, tzinfo=UTC),
        "status": "active",
        "tags": ["pressure", "burst", "vessel"],
    },
    {
        "id": "TEST-2025-001",
        "name": "Composite Impact Matrix",
        "description": (
            "Drop-weight impact testing on CFRP panels, varying energy levels. "
            "Full-field strain and acceleration."
        ),
        "facility": "Impact Tower — Cell 2",
        "operator": "A. Patel",
        "created_at": datetime(2025, 1, 22, 8, 15, 0, tzinfo=UTC),
        "status": "active",
        "tags": ["composite", "impact", "CFRP"],
    },
    {
        "id": "TEST-2025-002",
        "name": "Weld Integrity Survey",
        "description": (
            "Ultrasonic and AE monitoring of resistance-spot welds under shear loading."
        ),
        "facility": "Lab Bay 1",
        "operator": "R. Thompson",
        "created_at": datetime(2025, 2, 14, 11, 0, 0, tzinfo=UTC),
        "status": "archived",
        "tags": ["weld", "ultrasonic", "shear"],
    },
]

# ── Event labels per test ─────────────────────────────────────────────────────

EVENT_LABELS: dict[str, list[str]] = {
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
        f"Impact shot {i + 1:02d} \u2014 {[5, 10, 15, 20, 25, 30][i % 6]}J"
        for i in range(24)
    ],
    "TEST-2025-002": [
        "Weld set A \u2014 shear", "Weld set A \u2014 peel",
        "Weld set B \u2014 shear", "Weld set B \u2014 peel",
        "Weld set C \u2014 mixed", "Final pull-out",
    ],
}

TRIGGER_CONDITIONS = [
    "threshold > 2.5 V",
    "manual",
    "AE rate > 100 hits/s",
]

SAMPLE_RATES = [400_000, 500_000, 1_000_000]


def _build_events(test_id: str) -> list[dict]:
    """Replicate the mock.py event generation algorithm exactly."""
    labels = EVENT_LABELS.get(test_id, [])
    base_ts = datetime(2024, 11, 15, 10, 0, 0, tzinfo=UTC).timestamp()
    events = []
    for i, label in enumerate(labels):
        ts = datetime.fromtimestamp(base_ts + i * 7200, tz=UTC)
        sr = SAMPLE_RATES[i % 3]
        duration = round(0.5 + (i % 5) * 0.3, 2)
        events.append({
            "test_id": test_id,
            "id": f"EVT-{i + 1:03d}",
            "name": label,
            "description": f"Triggered at {ts.strftime('%H:%M:%S')} UTC",
            "timestamp": ts,
            "duration": duration,
            "sample_rate": sr,
            "sample_count": math.ceil(sr * duration),
            "status": "complete",
            "trigger_condition": TRIGGER_CONDITIONS[i % 3],
        })
    return events


def upgrade() -> None:
    tests_table = sa.table(
        "tests",
        sa.column("id", sa.String),
        sa.column("name", sa.String),
        sa.column("description", sa.Text),
        sa.column("facility", sa.String),
        sa.column("operator", sa.String),
        sa.column("created_at", sa.DateTime(timezone=True)),
        sa.column("status", sa.String),
        sa.column("tags", sa.ARRAY(sa.Text)),
    )
    events_table = sa.table(
        "events",
        sa.column("test_id", sa.String),
        sa.column("id", sa.String),
        sa.column("name", sa.String),
        sa.column("description", sa.Text),
        sa.column("timestamp", sa.DateTime(timezone=True)),
        sa.column("duration", sa.Float),
        sa.column("sample_rate", sa.Integer),
        sa.column("sample_count", sa.Integer),
        sa.column("status", sa.String),
        sa.column("trigger_condition", sa.String),
    )
    channels_table = sa.table(
        "channels",
        sa.column("test_id", sa.String),
        sa.column("id", sa.String),
        sa.column("name", sa.String),
        sa.column("unit", sa.String),
        sa.column("sensor_type", sa.String),
        sa.column("range_min", sa.Float),
        sa.column("range_max", sa.Float),
        sa.column("color", sa.String),
        sa.column("description", sa.Text),
    )

    # Insert tests
    for t in TESTS:
        op.execute(
            tests_table.insert().values(**t).prefix_with("OR IGNORE")
            if op.get_bind().dialect.name == "sqlite"
            else sa.dialects.postgresql.insert(tests_table).values(**t).on_conflict_do_nothing()
        )

    # Insert events
    for t in TESTS:
        for evt in _build_events(t["id"]):
            op.execute(
                events_table.insert().values(**evt).prefix_with("OR IGNORE")
                if op.get_bind().dialect.name == "sqlite"
                else sa.dialects.postgresql.insert(events_table).values(**evt).on_conflict_do_nothing()
            )

    # Insert channels
    for test_id, chs in CHANNELS.items():
        for idx, ch in enumerate(chs):
            row = {
                "test_id": test_id,
                "id": ch["id"],
                "name": ch["name"],
                "unit": ch["unit"],
                "sensor_type": ch["sensor_type"],
                "range_min": ch["range_min"],
                "range_max": ch["range_max"],
                "color": COLORS[idx % len(COLORS)],
                "description": "",
            }
            op.execute(
                channels_table.insert().values(**row).prefix_with("OR IGNORE")
                if op.get_bind().dialect.name == "sqlite"
                else sa.dialects.postgresql.insert(channels_table).values(**row).on_conflict_do_nothing()
            )


def downgrade() -> None:
    # Delete seed data by known IDs (reverse order for FK safety)
    test_ids = [t["id"] for t in TESTS]
    op.execute(sa.text("DELETE FROM channels WHERE test_id = ANY(:ids)").bindparams(
        ids=test_ids
    ))
    op.execute(sa.text("DELETE FROM events WHERE test_id = ANY(:ids)").bindparams(
        ids=test_ids
    ))
    op.execute(sa.text("DELETE FROM tests WHERE id = ANY(:ids)").bindparams(
        ids=test_ids
    ))
