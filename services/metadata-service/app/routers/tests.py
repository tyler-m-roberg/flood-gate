"""
/api/v1/tests  — test campaign catalogue
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.auth import CurrentUser, get_current_user
from app.db.dependencies import get_repo
from app.db.mock import MockMetadataRepository
from app.models.domain import TestListOut, TestOut

router = APIRouter(prefix="/tests", tags=["tests"])


@router.get("", response_model=TestListOut, summary="List test campaigns")
async def list_tests(
    status_filter: str | None = Query(
        default=None, alias="status", description="active | archived | processing"
    ),
    tag: str | None = Query(default=None, description="Filter by tag"),
    search: str | None = Query(
        default=None, description="Full-text search on name / description / facility"
    ),
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=500),
    repo: MockMetadataRepository = Depends(get_repo),
    _user: CurrentUser = Depends(get_current_user),
) -> TestListOut:
    """
    Return a paginated list of test campaigns.

    Accessible by any authenticated user (viewer and above).
    Results are filtered to campaigns accessible to the user's groups
    — in the prototype all tests are visible to everyone.
    """
    items, total = await repo.list_tests(
        status_filter=status_filter,
        tag=tag,
        search=search,
        offset=offset,
        limit=limit,
    )
    return TestListOut(items=items, total=total)


@router.get("/{test_id}", response_model=TestOut, summary="Get a test campaign")
async def get_test(
    test_id: str,
    repo: MockMetadataRepository = Depends(get_repo),
    _user: CurrentUser = Depends(get_current_user),
) -> TestOut:
    """
    Return full metadata for a single test campaign.
    """
    test = await repo.get_test(test_id)
    if test is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=f"Test {test_id!r} not found"
        )
    return test
