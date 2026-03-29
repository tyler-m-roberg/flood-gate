"""
/api/v1/tests  — test campaign catalogue
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.auth import CurrentUser, get_current_user
from app.auth.dependencies import require_analyst
from app.db.dependencies import get_repo
from app.db.protocol import MetadataRepository
from app.models.domain import TestCreate, TestListOut, TestOut, TestUpdate

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
    repo: MetadataRepository = Depends(get_repo),
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
    repo: MetadataRepository = Depends(get_repo),
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


@router.post(
    "",
    response_model=TestOut,
    status_code=status.HTTP_201_CREATED,
    summary="Create a test campaign",
)
async def create_test(
    body: TestCreate,
    repo: MetadataRepository = Depends(get_repo),
    _user: CurrentUser = Depends(require_analyst()),
) -> TestOut:
    """Create a new test campaign.  Requires analyst or admin role."""
    return await repo.create_test(body)


@router.put(
    "/{test_id}",
    response_model=TestOut,
    summary="Update a test campaign",
)
async def update_test(
    test_id: str,
    body: TestUpdate,
    repo: MetadataRepository = Depends(get_repo),
    _user: CurrentUser = Depends(require_analyst()),
) -> TestOut:
    """Update test campaign metadata.  Requires analyst or admin role."""
    result = await repo.update_test(test_id, body)
    if result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Test {test_id!r} not found",
        )
    return result
