"""
MinIO waveform fetcher.

Retrieves raw waveform JSON objects directly from the object store.
Object key schema: {testId}/{eventId}/{channelId}.json

The compute service reads waveforms from MinIO rather than calling the
waveform-service, avoiding inter-service auth round-trips and keeping
signal processing throughput close to storage bandwidth.
"""

from __future__ import annotations

import asyncio
import json
from dataclasses import dataclass

import numpy as np
import structlog
from minio import Minio
from minio.error import S3Error

from app.config import Settings

log = structlog.get_logger(__name__)


@dataclass(frozen=True)
class WaveformData:
    """Parsed waveform object as returned by the MinIO store."""

    event_id: str
    channel_id: str
    test_id: str
    sample_rate: float        # Hz
    n_samples: int
    start_time: float         # seconds from epoch (usually 0.0)
    unit: str
    values: np.ndarray        # shape (n_samples,), dtype float64


class WaveformNotFoundError(Exception):
    def __init__(self, key: str) -> None:
        self.key = key
        super().__init__(f"Waveform not found: {key!r}")


def _make_client(settings: Settings) -> Minio:
    return Minio(
        settings.minio_endpoint,
        access_key=settings.minio_access_key,
        secret_key=settings.minio_secret_key,
        secure=settings.minio_use_tls,
    )


async def fetch_waveform(
    test_id: str,
    event_id: str,
    channel_id: str,
    settings: Settings,
) -> WaveformData:
    """
    Fetch a single channel waveform from MinIO.

    Runs the blocking MinIO SDK call in the default thread-pool executor so
    the async event loop is not blocked during I/O.

    Raises
    ------
    WaveformNotFoundError  — when the object does not exist in the bucket.
    S3Error                — for other storage-layer failures.
    """
    key = f"{test_id}/{event_id}/{channel_id}.json"
    client = _make_client(settings)

    def _blocking_fetch() -> dict:
        try:
            response = client.get_object(settings.minio_bucket, key)
            raw = response.read()
            response.close()
            response.release_conn()
            return json.loads(raw)
        except S3Error as exc:
            if exc.code in ("NoSuchKey", "NoSuchBucket"):
                raise WaveformNotFoundError(key) from exc
            raise

    loop = asyncio.get_event_loop()
    data = await loop.run_in_executor(None, _blocking_fetch)

    log.debug(
        "storage.waveform.fetched",
        test_id=test_id,
        event_id=event_id,
        channel_id=channel_id,
        n_samples=data.get("n_samples"),
    )

    return WaveformData(
        event_id=data["event_id"],
        channel_id=data["channel_id"],
        test_id=data["test_id"],
        sample_rate=float(data["sample_rate"]),
        n_samples=int(data["n_samples"]),
        start_time=float(data["start_time"]),
        unit=str(data["unit"]),
        values=np.array(data["values"], dtype=np.float64),
    )
