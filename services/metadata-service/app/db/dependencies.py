"""
FastAPI dependency that provides the metadata repository.

Returns the mock repo when USE_MOCK_DATA=true (default for dev/test),
otherwise constructs a DB-backed repo using the async SQLAlchemy session.
"""

from __future__ import annotations

from fastapi import Depends

from app.config import Settings, get_settings
from app.db.mock import MockMetadataRepository

# Single process-wide mock repo instance (stateless, so safe to share)
_mock_repo = MockMetadataRepository()


def get_repo(settings: Settings = Depends(get_settings)) -> MockMetadataRepository:
    """
    Dependency: return the active metadata repository.

    In prototype mode (USE_MOCK_DATA=true) this is the in-memory mock.
    Replace with a real async SQLAlchemy repo when the database is wired up.
    """
    if settings.use_mock_data:
        return _mock_repo
    # TODO: return real async SQLAlchemy repository
    raise NotImplementedError("Database-backed repository not yet implemented")
