"""
MinIO client singleton for waveform uploads.

Initialised once at startup via init_minio(); accessed via get_minio_client().
"""

from __future__ import annotations

import io
import sys
from pathlib import Path
from typing import Sequence

import structlog
from minio import Minio

from app.config import Settings
from fgw import encode_fgw

log = structlog.get_logger(__name__)

_client: Minio | None = None


def init_minio(settings: Settings) -> None:
    """Create the module-level MinIO client singleton."""
    global _client  # noqa: PLW0603
    _client = Minio(
        settings.minio_endpoint,
        access_key=settings.minio_access_key,
        secret_key=settings.minio_secret_key,
        secure=settings.minio_use_tls,
    )
    # Ensure bucket exists
    if not _client.bucket_exists(settings.minio_bucket):
        _client.make_bucket(settings.minio_bucket)
        log.info("minio.bucket_created", bucket=settings.minio_bucket)
    log.info("minio.initialised", endpoint=settings.minio_endpoint)


def get_minio_client() -> Minio:
    """Return the MinIO client singleton.  Raises if not initialised."""
    if _client is None:
        raise RuntimeError("MinIO client not initialised — call init_minio() first")
    return _client


def upload_waveform(
    client: Minio,
    bucket: str,
    test_id: str,
    event_id: str,
    channel_id: str,
    *,
    sample_rate: float,
    n_samples: int,
    start_time: float,
    unit: str,
    values: Sequence[float],
) -> None:
    """Encode waveform as FGW binary and upload to MinIO."""
    key = f"{test_id}/{event_id}/{channel_id}.fgw"
    data = encode_fgw(
        event_id=event_id,
        channel_id=channel_id,
        test_id=test_id,
        sample_rate=sample_rate,
        n_samples=n_samples,
        start_time=start_time,
        unit=unit,
        values=values,
    )
    client.put_object(
        bucket,
        key,
        data=io.BytesIO(data),
        length=len(data),
        content_type="application/x-floodgate-waveform",
    )
    log.info("minio.waveform_uploaded", key=key, size=len(data))
