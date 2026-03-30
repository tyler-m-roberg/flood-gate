#!/usr/bin/env python3
"""
FloodGate — mock waveform loader.

Generates deterministic waveforms using the identical algorithm as
src/data/mockData.ts and uploads them to MinIO as FGW binary objects.

Object key schema:  {testId}/{eventId}/{channelId}.fgw

Run:
    python main.py                          # default env vars
    MINIO_ENDPOINT=localhost:9000 python main.py

The script is idempotent: existing objects are skipped unless --force is passed.
"""

import argparse
import io
import math
import os
import sys
import time

# ── MinIO client ───────────────────────────────────────────────────────────────
try:
    from minio import Minio
    from minio.error import S3Error
except ImportError:
    print("ERROR: minio package not installed. Run: pip install minio", file=sys.stderr)
    sys.exit(1)

# ── Shared FGW codec (copied into container via Dockerfile) ───────────────────
from fgw import encode_fgw  # noqa: E402

# ── Configuration ──────────────────────────────────────────────────────────────
MINIO_ENDPOINT  = os.getenv("MINIO_ENDPOINT",  "localhost:9000")
MINIO_ACCESS    = os.getenv("MINIO_ACCESS_KEY", "minioadmin")
MINIO_SECRET    = os.getenv("MINIO_SECRET_KEY", "minioadmin")
MINIO_BUCKET    = os.getenv("MINIO_BUCKET",     "floodgate-waveforms")
MINIO_USE_TLS   = os.getenv("MINIO_USE_TLS",    "false").lower() == "true"

# ── Constants — must stay in sync with src/data/mockData.ts ───────────────────
N_SAMPLES = 2048  # fixed sample count per waveform (display-optimised)
SAMPLE_RATES = [400_000, 500_000, 1_000_000]  # cycles with event index % 3


# ── Seeded LCG random ─────────────────────────────────────────────────────────
# Mirrors seededRand() in mockData.ts exactly (same multiplier and increment).
def seeded_rand(seed: int):
    s = seed & 0xFFFFFFFF
    def _next() -> float:
        nonlocal s
        s = (s * 1664525 + 1013904223) & 0xFFFFFFFF
        return s / 0xFFFFFFFF
    return _next


# ── Waveform profiles ─────────────────────────────────────────────────────────
def _impulse(n, dt, amp, noise, rand):
    out = [0.0] * n
    peak = int(n * 0.15)
    decay = 800 * dt
    for i in range(n):
        t = i * dt
        t_peak = peak * dt
        env = amp * math.exp(-(t - t_peak) / decay) if t >= t_peak else amp * (t / t_peak if t_peak else 0)
        osc = math.sin(2 * math.pi * 80_000 * t + rand() * 0.1)
        out[i] = env * osc + (rand() - 0.5) * noise
    return out


def _sine_burst(n, dt, amp, noise, rand):
    out = [0.0] * n
    start, end = int(n * 0.1), int(n * 0.6)
    for i in range(n):
        t = i * dt
        if start <= i < end:
            env = math.sin(math.pi * (i - start) / (end - start))
            out[i] = amp * env * math.sin(2 * math.pi * 25_000 * t) + (rand() - 0.5) * noise
        else:
            out[i] = (rand() - 0.5) * noise
    return out


def _ramp_hold(n, dt, amp, noise, rand):
    out = [0.0] * n
    ramp_end, hold_end = int(n * 0.3), int(n * 0.75)
    for i in range(n):
        if i < ramp_end:
            base = amp * (i / ramp_end)
        elif i < hold_end:
            base = amp
        else:
            tail = n - hold_end
            base = amp * (1 - (i - hold_end) / tail) if tail else 0.0
        out[i] = base + (rand() - 0.5) * noise
    return out


def _ae_burst(n, dt, amp, noise, rand):
    out = [0.0] * n
    for h in range(6):
        hit = int(n * (0.05 + (h / 6) * 0.85 + rand() * 0.05))
        h_amp = amp * (0.4 + rand() * 0.6)
        decay = 200 * dt
        freq = 150_000 + rand() * 200_000
        end = min(hit + int(0.002 / dt) if dt else hit + 1, n)
        for i in range(hit, end):
            t = (i - hit) * dt
            out[i] += h_amp * math.exp(-t / decay) * math.sin(2 * math.pi * freq * t)
    for i in range(n):
        out[i] += (rand() - 0.5) * noise
    return out


def _step_decay(n, dt, amp, noise, rand):
    out = [0.0] * n
    step = int(n * 0.2)
    for i in range(n):
        t = i * dt
        t_step = step * dt
        base = 0.0 if i < step else amp * (1 - math.exp(-(t - t_step) / (50 * dt)))
        out[i] = base + (rand() - 0.5) * noise
    return out


def _noise_floor(n, dt, amp, noise, rand):
    return [(rand() - 0.5) * noise for _ in range(n)]


_GENERATORS = {
    "impulse":    _impulse,
    "sine_burst": _sine_burst,
    "ramp_hold":  _ramp_hold,
    "ae_burst":   _ae_burst,
    "step_decay": _step_decay,
    "noise_floor": _noise_floor,
}

# Mirrors CHANNEL_PROFILES in mockData.ts
CHANNEL_PROFILES: dict[str, list[str]] = {
    "voltage":      ["ae_burst",   "impulse",    "sine_burst"],
    "strain":       ["ramp_hold",  "step_decay", "ramp_hold"],
    "pressure":     ["ramp_hold",  "step_decay", "ramp_hold"],
    "acceleration": ["impulse",    "sine_burst", "impulse"],
    "current":      ["ramp_hold",  "ramp_hold",  "step_decay"],
    "temperature":  ["step_decay", "ramp_hold",  "step_decay"],
}


def generate_waveform(n: int, dt: float, profile: str, amp: float, noise: float, seed: int) -> list[float]:
    rand = seeded_rand(seed)
    fn = _GENERATORS.get(profile, _noise_floor)
    return fn(n, dt, amp, noise, rand)


def compute_seed(event_id: str, channel_id: str, event_index: int) -> int:
    """Mirrors the seed formula in generateChannelData() in mockData.ts."""
    ev_char = ord(event_id[4]) if len(event_id) > 4 else 1
    ch_char = ord(channel_id[2]) if len(channel_id) > 2 else 7
    return ev_char * 31 + ch_char * 17 + event_index * 97


# ── Test / channel / event definitions — mirror mockData.ts ───────────────────
TESTS_CHANNELS: dict[str, list[dict]] = {
    "TEST-2024-001": [
        {"id": "CH1", "unit": "kN",  "sensor_type": "voltage",      "range": [-100, 100]},
        {"id": "CH2", "unit": "µε",  "sensor_type": "strain",       "range": [-5000, 5000]},
        {"id": "CH3", "unit": "µε",  "sensor_type": "strain",       "range": [-5000, 5000]},
        {"id": "CH4", "unit": "V",   "sensor_type": "voltage",      "range": [-5, 5]},
        {"id": "CH5", "unit": "V",   "sensor_type": "voltage",      "range": [-5, 5]},
        {"id": "CH6", "unit": "mm",  "sensor_type": "voltage",      "range": [-25, 25]},
    ],
    "TEST-2024-002": [
        {"id": "CH1", "unit": "MPa", "sensor_type": "pressure",     "range": [0, 50]},
        {"id": "CH2", "unit": "MPa", "sensor_type": "pressure",     "range": [0, 50]},
        {"id": "CH3", "unit": "µε",  "sensor_type": "strain",       "range": [-8000, 8000]},
        {"id": "CH4", "unit": "µε",  "sensor_type": "strain",       "range": [-8000, 8000]},
        {"id": "CH5", "unit": "µε",  "sensor_type": "strain",       "range": [-4000, 4000]},
        {"id": "CH6", "unit": "V",   "sensor_type": "voltage",      "range": [-5, 5]},
        {"id": "CH7", "unit": "°C",  "sensor_type": "temperature",  "range": [15, 80]},
    ],
    "TEST-2025-001": [
        {"id": "CH1", "unit": "kN",  "sensor_type": "voltage",      "range": [0, 30]},
        {"id": "CH2", "unit": "g",   "sensor_type": "acceleration", "range": [-500, 500]},
        {"id": "CH3", "unit": "g",   "sensor_type": "acceleration", "range": [-500, 500]},
        {"id": "CH4", "unit": "µε",  "sensor_type": "strain",       "range": [-3000, 3000]},
        {"id": "CH5", "unit": "µε",  "sensor_type": "strain",       "range": [-3000, 3000]},
        {"id": "CH6", "unit": "V",   "sensor_type": "voltage",      "range": [-5, 5]},
        {"id": "CH7", "unit": "V",   "sensor_type": "voltage",      "range": [-5, 5]},
        {"id": "CH8", "unit": "m/s", "sensor_type": "voltage",      "range": [-10, 10]},
    ],
    "TEST-2025-002": [
        {"id": "CH1", "unit": "kN",  "sensor_type": "voltage",      "range": [-20, 20]},
        {"id": "CH2", "unit": "kN",  "sensor_type": "voltage",      "range": [-5, 5]},
        {"id": "CH3", "unit": "mV",  "sensor_type": "voltage",      "range": [0, 500]},
        {"id": "CH4", "unit": "mm",  "sensor_type": "voltage",      "range": [-2, 2]},
    ],
}

EVENT_COUNTS: dict[str, int] = {
    "TEST-2024-001": 12,
    "TEST-2024-002": 8,
    "TEST-2025-001": 24,
    "TEST-2025-002": 6,
}


def iter_waveforms():
    """Yield (key, fgw_bytes) for every event × channel combination."""
    for test_id, channels in TESTS_CHANNELS.items():
        count = EVENT_COUNTS[test_id]
        for ev_idx in range(count):
            event_id = f"EVT-{ev_idx + 1:03d}"
            sample_rate = SAMPLE_RATES[ev_idx % len(SAMPLE_RATES)]
            dt = 1.0 / sample_rate

            for ch in channels:
                profiles = CHANNEL_PROFILES.get(ch["sensor_type"], ["noise_floor"])
                profile = profiles[ev_idx % len(profiles)]
                r_min, r_max = ch["range"]
                amplitude  = (r_max - r_min) * 0.4
                noise_level = (r_max - r_min) * 0.015

                seed = compute_seed(event_id, ch["id"], ev_idx)
                values = generate_waveform(N_SAMPLES, dt, profile, amplitude, noise_level, seed)

                key = f"{test_id}/{event_id}/{ch['id']}.fgw"
                fgw_data = encode_fgw(
                    event_id=event_id,
                    channel_id=ch["id"],
                    test_id=test_id,
                    sample_rate=sample_rate,
                    n_samples=N_SAMPLES,
                    start_time=0.0,
                    unit=ch["unit"],
                    values=values,
                )
                yield key, fgw_data


# ── MinIO helpers ──────────────────────────────────────────────────────────────

def wait_for_minio(client: Minio, retries: int = 20, delay: float = 3.0) -> None:
    """Block until MinIO is reachable (compose startup race)."""
    for attempt in range(1, retries + 1):
        try:
            client.list_buckets()
            print(f"MinIO ready (attempt {attempt})")
            return
        except Exception as exc:
            print(f"Waiting for MinIO… ({attempt}/{retries}) — {exc}")
            time.sleep(delay)
    print("ERROR: MinIO not reachable after retries", file=sys.stderr)
    sys.exit(1)


def ensure_bucket(client: Minio, bucket: str) -> None:
    if not client.bucket_exists(bucket):
        client.make_bucket(bucket)
        print(f"Created bucket '{bucket}'")
    else:
        print(f"Bucket '{bucket}' already exists")


def object_exists(client: Minio, bucket: str, key: str) -> bool:
    try:
        client.stat_object(bucket, key)
        return True
    except S3Error:
        return False


def upload(client: Minio, bucket: str, key: str, data: bytes) -> None:
    client.put_object(
        bucket, key,
        data=io.BytesIO(data),
        length=len(data),
        content_type="application/x-floodgate-waveform",
    )


# ── Entry point ────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description="Load mock waveforms into MinIO")
    parser.add_argument("--force", action="store_true",
                        help="Re-upload even if the object already exists")
    args = parser.parse_args()

    client = Minio(
        MINIO_ENDPOINT,
        access_key=MINIO_ACCESS,
        secret_key=MINIO_SECRET,
        secure=MINIO_USE_TLS,
    )

    wait_for_minio(client)
    ensure_bucket(client, MINIO_BUCKET)

    uploaded = skipped = errors = 0

    for key, fgw_data in iter_waveforms():
        if not args.force and object_exists(client, MINIO_BUCKET, key):
            skipped += 1
            continue
        try:
            upload(client, MINIO_BUCKET, key, fgw_data)
            uploaded += 1
            print(f"  ✓ {key}")
        except Exception as exc:
            errors += 1
            print(f"  ✗ {key}: {exc}", file=sys.stderr)

    total = uploaded + skipped + errors
    print(f"\nDone — {total} objects: {uploaded} uploaded, {skipped} skipped, {errors} errors")
    if errors:
        sys.exit(1)


if __name__ == "__main__":
    main()
