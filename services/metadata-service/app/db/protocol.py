"""
Repository protocol — the contract both MockMetadataRepository and
PgMetadataRepository satisfy.

Using typing.Protocol (structural subtyping) so neither implementation
needs to inherit from an ABC.
"""

from __future__ import annotations

from typing import Protocol

from app.models.domain import (
    ChannelCreate,
    ChannelOut,
    EventCreate,
    EventOut,
    TestCreate,
    TestOut,
    TestUpdate,
)


class MetadataRepository(Protocol):
    # ── reads ─────────────────────────────────────────────────────────────────

    async def list_tests(
        self,
        *,
        status_filter: str | None = None,
        tag: str | None = None,
        search: str | None = None,
        offset: int = 0,
        limit: int = 50,
    ) -> tuple[list[TestOut], int]: ...

    async def get_test(self, test_id: str) -> TestOut | None: ...

    async def list_events(
        self,
        test_id: str,
        *,
        status_filter: str | None = None,
        search: str | None = None,
        offset: int = 0,
        limit: int = 50,
    ) -> tuple[list[EventOut], int]: ...

    async def get_event(self, test_id: str, event_id: str) -> EventOut | None: ...

    async def list_channels(
        self,
        test_id: str,
        *,
        sensor_type: str | None = None,
    ) -> tuple[list[ChannelOut], int]: ...

    async def get_channel(self, test_id: str, channel_id: str) -> ChannelOut | None: ...

    # ── writes ────────────────────────────────────────────────────────────────

    async def create_test(self, test: TestCreate) -> TestOut: ...

    async def update_test(self, test_id: str, update: TestUpdate) -> TestOut | None: ...

    async def create_event(
        self,
        test_id: str,
        event: EventCreate,
        *,
        sample_rate: int,
        sample_count: int,
        duration: float,
        channel_count: int,
    ) -> EventOut: ...

    async def create_channels(
        self, test_id: str, channels: list[ChannelCreate]
    ) -> list[ChannelOut]: ...
