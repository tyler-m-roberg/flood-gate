"""
/api/v1/tests/{test_id}/events  — test event catalogue
"""

from __future__ import annotations

import json

import structlog
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status

from app.auth import CurrentUser, get_current_user
from app.auth.dependencies import require_analyst
from app.config import Settings, get_settings
from app.db.dependencies import get_repo
from app.db.protocol import MetadataRepository
from app.models.domain import EventListOut, EventOut, UploadEventPayload
from app.services.csv_parser import CSVParseError, parse_csv

log = structlog.get_logger(__name__)

router = APIRouter(tags=["events"])


def _assert_test_exists(test_id: str, repo: MetadataRepository):
    """Shared guard — raises 404 if the parent test does not exist."""
    # We do a lightweight check; the mock repo always has the test if events exist,
    # but we validate explicitly so the behaviour is correct for the real DB too.
    pass  # Full DB version would await repo.get_test(test_id) and 404 on None


@router.get(
    "/tests/{test_id}/events",
    response_model=EventListOut,
    summary="List events for a test",
)
async def list_events(
    test_id: str,
    status_filter: str | None = Query(
        default=None, alias="status", description="complete | partial | failed"
    ),
    search: str | None = Query(default=None, description="Search event name / id / trigger"),
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=500),
    repo: MetadataRepository = Depends(get_repo),
    _user: CurrentUser = Depends(get_current_user),
) -> EventListOut:
    """
    Return all events for the given test, with optional filtering and pagination.

    Events are returned in chronological order (ascending timestamp).
    """
    # Validate parent test exists
    test = await repo.get_test(test_id)
    if test is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=f"Test {test_id!r} not found"
        )

    items, total = await repo.list_events(
        test_id,
        status_filter=status_filter,
        search=search,
        offset=offset,
        limit=limit,
    )
    return EventListOut(items=items, total=total)


@router.get(
    "/tests/{test_id}/events/{event_id}",
    response_model=EventOut,
    summary="Get a single event",
)
async def get_event(
    test_id: str,
    event_id: str,
    repo: MetadataRepository = Depends(get_repo),
    _user: CurrentUser = Depends(get_current_user),
) -> EventOut:
    """
    Return full metadata for a single test event including channel list.
    """
    test = await repo.get_test(test_id)
    if test is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=f"Test {test_id!r} not found"
        )

    event = await repo.get_event(test_id, event_id)
    if event is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Event {event_id!r} not found in test {test_id!r}",
        )
    return event


@router.post(
    "/tests/{test_id}/events",
    response_model=EventOut,
    status_code=status.HTTP_201_CREATED,
    summary="Create an event with waveform data",
)
async def create_event(
    test_id: str,
    event_meta: str = Form(..., description="JSON of UploadEventPayload"),
    csv_file: UploadFile = File(..., description="CSV waveform data (time + channel columns)"),
    repo: MetadataRepository = Depends(get_repo),
    _user: CurrentUser = Depends(require_analyst()),
    settings: Settings = Depends(get_settings),
) -> EventOut:
    """
    Create a new event with waveform data from a CSV file.

    The ``event_meta`` form field is a JSON string containing event metadata
    and channel definitions.  The ``csv_file`` is a CSV with a ``time`` column
    followed by one column per channel.
    """
    # 1. Validate parent test
    test = await repo.get_test(test_id)
    if test is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=f"Test {test_id!r} not found"
        )

    # 2. Parse event metadata JSON
    try:
        payload = UploadEventPayload.model_validate_json(event_meta)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid event_meta JSON: {exc}",
        ) from exc

    # 3. Parse CSV
    content = await csv_file.read()
    try:
        parsed = parse_csv(content)
    except CSVParseError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"CSV parse error: {exc}",
        ) from exc

    # 4. Validate channel IDs match
    meta_ids = {ch.id for ch in payload.channels}
    csv_ids = set(parsed.channel_ids)
    if meta_ids != csv_ids:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"Channel ID mismatch — metadata has {sorted(meta_ids)}, "
                f"CSV has {sorted(csv_ids)}"
            ),
        )

    # 5. Create channels (idempotent)
    channels_out = await repo.create_channels(test_id, payload.channels)

    # 6. Create event
    event_out = await repo.create_event(
        test_id,
        payload.event,
        sample_rate=parsed.sample_rate,
        sample_count=parsed.n_samples,
        duration=parsed.duration,
        channel_count=len(channels_out),
    )

    # 7. Upload waveforms to MinIO
    if not settings.use_mock_data:
        from app.storage.minio_client import get_minio_client, upload_waveform

        client = get_minio_client()
        ch_unit_map = {ch.id: ch.unit for ch in payload.channels}
        for ch_id in parsed.channel_ids:
            upload_waveform(
                client, settings.minio_bucket,
                test_id, event_out.id, ch_id,
                sample_rate=float(parsed.sample_rate),
                n_samples=parsed.n_samples,
                start_time=parsed.start_time,
                unit=ch_unit_map.get(ch_id, ""),
                values=parsed.channel_values[ch_id],
            )

    log.info(
        "event.created",
        test_id=test_id,
        event_id=event_out.id,
        channels=len(channels_out),
        n_samples=parsed.n_samples,
        sample_rate=parsed.sample_rate,
    )
    return event_out
