"""
FloodGate Waveform (.fgw) binary codec.

Format: 128-byte fixed little-endian header followed by a contiguous float32 sample array.

Header layout (all little-endian):
  Offset  Size  Field
  0       4     magic              "FGW\x01"
  4       2     version_major      uint16 (1)
  6       2     version_minor      uint16 (0)
  8       4     header_size        uint32 (128)
  12      4     flags              uint32 (reserved, 0)
  16      8     n_samples          uint64
  24      8     sample_rate        float64
  32      8     start_time         float64
  40      1     value_dtype        uint8 (1=float32)
  41      1     reserved           uint8 (0)
  42      1     unit_length        uint8
  43      15    unit               utf8, null-padded
  58      1     event_id_length    uint8
  59      31    event_id           utf8, null-padded
  90      1     channel_id_length  uint8
  91      15    channel_id         utf8, null-padded
  106     1     test_id_length     uint8
  107     21    test_id            utf8, null-padded
  128     ...   float32 sample data (n_samples × 4 bytes)
"""

from __future__ import annotations

import struct
from dataclasses import dataclass
from typing import Sequence

MAGIC = b"FGW\x01"
VERSION_MAJOR = 1
VERSION_MINOR = 0
HEADER_SIZE = 128
DTYPE_FLOAT32 = 1

# struct format for the fixed 128-byte header (little-endian)
_HEADER_FMT = "<4s HH I I Q d d B B B 15s B 31s B 15s B 21s"
_HEADER_STRUCT = struct.Struct(_HEADER_FMT)
assert _HEADER_STRUCT.size == HEADER_SIZE, f"Header struct size mismatch: {_HEADER_STRUCT.size}"


def _pack_str(s: str, max_len: int) -> tuple[int, bytes]:
    """Encode a string to utf-8 and return (length, null-padded bytes)."""
    encoded = s.encode("utf-8")[:max_len]
    return len(encoded), encoded.ljust(max_len, b"\x00")


@dataclass(frozen=True)
class FGWHeader:
    n_samples: int
    sample_rate: float
    start_time: float
    unit: str
    event_id: str
    channel_id: str
    test_id: str
    header_size: int = HEADER_SIZE


def encode_fgw(
    *,
    event_id: str,
    channel_id: str,
    test_id: str,
    sample_rate: float,
    n_samples: int,
    start_time: float,
    unit: str,
    values: Sequence[float],
) -> bytes:
    """Encode waveform data to FGW binary format.

    Values are stored as float32, little-endian, immediately after the 128-byte header.
    """
    unit_len, unit_bytes = _pack_str(unit, 15)
    eid_len, eid_bytes = _pack_str(event_id, 31)
    cid_len, cid_bytes = _pack_str(channel_id, 15)
    tid_len, tid_bytes = _pack_str(test_id, 21)

    header = _HEADER_STRUCT.pack(
        MAGIC,
        VERSION_MAJOR,
        VERSION_MINOR,
        HEADER_SIZE,
        0,  # flags (reserved)
        n_samples,
        float(sample_rate),
        float(start_time),
        DTYPE_FLOAT32,
        0,  # reserved
        unit_len,
        unit_bytes,
        eid_len,
        eid_bytes,
        cid_len,
        cid_bytes,
        tid_len,
        tid_bytes,
    )

    data = struct.pack(f"<{n_samples}f", *values)
    return header + data


def decode_fgw_header(raw: bytes) -> FGWHeader:
    """Decode the FGW header from raw bytes.

    Requires at least 128 bytes.
    Raises ValueError if the magic or version is invalid.
    """
    if len(raw) < HEADER_SIZE:
        raise ValueError(f"FGW header too short: {len(raw)} bytes (need {HEADER_SIZE})")

    fields = _HEADER_STRUCT.unpack(raw[:HEADER_SIZE])
    (
        magic,
        ver_major, ver_minor,
        header_size,
        _flags,
        n_samples,
        sample_rate,
        start_time,
        _value_dtype,
        _reserved,
        unit_len, unit_bytes,
        eid_len, eid_bytes,
        cid_len, cid_bytes,
        tid_len, tid_bytes,
    ) = fields

    if magic != MAGIC:
        raise ValueError(f"Invalid FGW magic: {magic!r}")
    if ver_major != VERSION_MAJOR:
        raise ValueError(f"Unsupported FGW version: {ver_major}.{ver_minor}")

    return FGWHeader(
        n_samples=n_samples,
        sample_rate=sample_rate,
        start_time=start_time,
        unit=unit_bytes[:unit_len].decode("utf-8"),
        event_id=eid_bytes[:eid_len].decode("utf-8"),
        channel_id=cid_bytes[:cid_len].decode("utf-8"),
        test_id=tid_bytes[:tid_len].decode("utf-8"),
        header_size=header_size,
    )


def decode_fgw_values_np(raw: bytes, header: FGWHeader):
    """Decode float32 sample values from raw FGW bytes using numpy.

    Returns a numpy float64 array (upcasted from float32 for compute precision).
    """
    import numpy as np

    values_f32 = np.frombuffer(raw, dtype=np.float32, offset=header.header_size, count=header.n_samples)
    return values_f32.astype(np.float64)


def decode_fgw_values(raw: bytes, header: FGWHeader) -> list[float]:
    """Decode float32 sample values from raw FGW bytes (pure Python)."""
    return list(struct.unpack_from(f"<{header.n_samples}f", raw, header.header_size))
