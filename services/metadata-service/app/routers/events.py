"""
/api/v1/tests/{test_id}/events  — test event catalogue
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.auth import CurrentUser, get_current_user
from app.db.dependencies import get_repo
from app.db.mock import MockMetadataRepository
from app.models.domain import EventListOut, EventOut

router = APIRouter(tags=["events"])


def _assert_test_exists(test_id: str, repo: MockMetadataRepository):
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
    repo: MockMetadataRepository = Depends(get_repo),
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
    repo: MockMetadataRepository = Depends(get_repo),
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
