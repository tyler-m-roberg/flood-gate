"""
Async SQLAlchemy engine and session factory lifecycle.

Call init_engine() once at startup, dispose_engine() at shutdown.
"""

from __future__ import annotations

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

_engine = None
_session_factory: async_sessionmaker[AsyncSession] | None = None


def init_engine(
    database_url: str,
    *,
    pool_size: int = 5,
    max_overflow: int = 10,
    pool_recycle: int = 300,
) -> None:
    """Create the async engine and session factory."""
    global _engine, _session_factory  # noqa: PLW0603
    _engine = create_async_engine(
        database_url,
        pool_size=pool_size,
        max_overflow=max_overflow,
        pool_pre_ping=True,
        pool_recycle=pool_recycle,
        echo=False,
    )
    _session_factory = async_sessionmaker(_engine, expire_on_commit=False)


async def dispose_engine() -> None:
    """Dispose all pooled connections (call at shutdown)."""
    global _engine  # noqa: PLW0603
    if _engine is not None:
        await _engine.dispose()
        _engine = None


def get_session_factory() -> async_sessionmaker[AsyncSession]:
    """Return the session factory.  Raises if engine was not initialised."""
    if _session_factory is None:
        raise RuntimeError("Database engine not initialised — call init_engine() first")
    return _session_factory
