"""
FastAPI dependency that provides the metadata repository.

Returns the mock repo when USE_MOCK_DATA=true (default for dev/test),
otherwise constructs a DB-backed repo using the async SQLAlchemy session.
"""

from __future__ import annotations

from collections.abc import AsyncIterator

from fastapi import Depends

from app.config import Settings, get_settings
from app.db.mock import MockMetadataRepository
from app.db.protocol import MetadataRepository

# Single process-wide mock repo instance (stateless, so safe to share)
_mock_repo = MockMetadataRepository()


async def get_repo(
    settings: Settings = Depends(get_settings),
) -> AsyncIterator[MetadataRepository]:
    """
    Dependency: return the active metadata repository.

    In prototype mode (USE_MOCK_DATA=true) this is the in-memory mock.
    Otherwise, yields a PgMetadataRepository scoped to an async session.
    """
    if settings.use_mock_data:
        yield _mock_repo
    else:
        from app.db.engine import get_session_factory
        from app.db.repository import PgMetadataRepository

        async with get_session_factory()() as session:
            try:
                yield PgMetadataRepository(session)
                await session.commit()
            except Exception:
                await session.rollback()
                raise
