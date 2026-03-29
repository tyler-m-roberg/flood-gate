"""
CSV parser for waveform upload.

Expected format:
  - Header row: time,CH1,CH2,...
  - Data rows: float values (time in seconds, channel values in engineering units)
  - Constant sample rate (derived from time column)
"""

from __future__ import annotations

import csv
import io
from dataclasses import dataclass


class CSVParseError(ValueError):
    """Raised when the CSV is malformed or empty."""


@dataclass(frozen=True)
class ParsedCSV:
    channel_ids: list[str]
    time_values: list[float]
    channel_values: dict[str, list[float]]
    sample_rate: float
    n_samples: int
    start_time: float
    duration: float


def parse_csv(file_content: bytes) -> ParsedCSV:
    """Parse a multi-channel waveform CSV and return structured data."""
    text = file_content.decode("utf-8-sig")  # handle optional BOM
    reader = csv.reader(io.StringIO(text))

    # Header
    try:
        header = next(reader)
    except StopIteration:
        raise CSVParseError("CSV file is empty")

    header = [h.strip() for h in header]

    if len(header) < 2:
        raise CSVParseError("CSV must have at least a time column and one channel column")

    if header[0].lower() != "time":
        raise CSVParseError(
            f"First column must be 'time', got '{header[0]}'"
        )

    channel_ids = header[1:]
    time_values: list[float] = []
    channel_values: dict[str, list[float]] = {ch: [] for ch in channel_ids}

    for row_num, row in enumerate(reader, start=2):
        if not row or all(c.strip() == "" for c in row):
            continue  # skip blank rows

        if len(row) != len(header):
            raise CSVParseError(
                f"Row {row_num}: expected {len(header)} columns, got {len(row)}"
            )

        try:
            time_values.append(float(row[0]))
            for i, ch_id in enumerate(channel_ids, start=1):
                channel_values[ch_id].append(float(row[i]))
        except ValueError as e:
            raise CSVParseError(f"Row {row_num}: non-numeric value — {e}") from e

    if len(time_values) < 2:
        raise CSVParseError("CSV must contain at least 2 data rows to determine sample rate")

    # Derive sample rate from time delta
    dt = time_values[1] - time_values[0]
    if dt <= 0:
        raise CSVParseError("Time column must be monotonically increasing")

    sample_rate = round(1.0 / dt)
    n_samples = len(time_values)
    start_time = time_values[0]
    duration = time_values[-1] - time_values[0]

    return ParsedCSV(
        channel_ids=channel_ids,
        time_values=time_values,
        channel_values=channel_values,
        sample_rate=sample_rate,
        n_samples=n_samples,
        start_time=start_time,
        duration=duration,
    )
