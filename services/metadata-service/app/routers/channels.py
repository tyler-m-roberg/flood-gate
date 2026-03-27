"""
/api/v1/tests/{test_id}/channels  — channel catalogue for a test

Channels are defined at the test level (they don't change between events).
The events router returns channel_count; this router returns the full
channel metadata needed to build the channel panel in the UI.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.auth import CurrentUser, get_current_user
from app.db.dependencies import get_repo
from app.db.mock import MockMetadataRepository
from app.models.domain import ChannelListOut, ChannelOut, SensorType

router = APIRouter(tags=["channels"])


@router.get(
    "/tests/{test_id}/channels",
    response_model=ChannelListOut,
    summary="List channels for a test",
)
async def list_channels(
    test_id: str,
    sensor_type: SensorType | None = Query(default=None, description="Filter by sensor type"),
    repo: MockMetadataRepository = Depends(get_repo),
    _user: CurrentUser = Depends(get_current_user),
) -> ChannelListOut:
    """
    Return the channel catalogue for a test campaign.

    Channels are consistent across all events in the same test
    (same sensor array, same numbering).
    """
    test = await repo.get_test(test_id)
    if test is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=f"Test {test_id!r} not found"
        )

    items, total = await repo.list_channels(
        test_id,
        sensor_type=sensor_type.value if sensor_type else None,
    )
    return ChannelListOut(items=items, total=total)


@router.get(
    "/tests/{test_id}/channels/{channel_id}",
    response_model=ChannelOut,
    summary="Get a single channel",
)
async def get_channel(
    test_id: str,
    channel_id: str,
    repo: MockMetadataRepository = Depends(get_repo),
    _user: CurrentUser = Depends(get_current_user),
) -> ChannelOut:
    test = await repo.get_test(test_id)
    if test is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=f"Test {test_id!r} not found"
        )

    channel = await repo.get_channel(test_id, channel_id)
    if channel is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Channel {channel_id!r} not found in test {test_id!r}",
        )
    return channel
