"""
Pydantic response models for the compute API.

All float arrays are serialised as plain JSON arrays of numbers.
numpy arrays are converted to list[float] before reaching these models.
"""

from __future__ import annotations

from pydantic import BaseModel, Field


# ── FFT ────────────────────────────────────────────────────────────────────────

class FFTOut(BaseModel):
    """
    One-sided amplitude spectrum from a windowed FFT.

    `frequencies` and `magnitudes` are parallel arrays of equal length.
    The DC bin (index 0) is included; magnitudes are normalised so that a
    pure sine wave at amplitude A produces a peak magnitude of A.
    """

    test_id: str
    event_id: str
    channel_id: str
    frequencies: list[float]          = Field(description="Hz, one-sided (0 … Nyquist)")
    magnitudes: list[float]           = Field(description="Amplitude in signal units")
    peak_frequency: float             = Field(description="Hz — frequency of strongest non-DC peak")
    bin_resolution_hz: float          = Field(description="Frequency resolution (Hz/bin) = sample_rate / n_samples")
    n_samples: int
    sample_rate: float                = Field(description="Hz")
    window: str                       = Field(description="Window function applied before FFT")
    unit: str                         = Field(description="Signal engineering unit (e.g. kN, m/s²)")


# ── Power Spectral Density ─────────────────────────────────────────────────────

class PSDOut(BaseModel):
    """
    Power Spectral Density estimate using Welch's averaged periodogram.

    Power values are in dB relative to unit² / Hz (dBFS when signal is
    normalised, otherwise in the native signal unit squared per Hz).
    """

    test_id: str
    event_id: str
    channel_id: str
    frequencies: list[float]          = Field(description="Hz, one-sided (0 … Nyquist)")
    power_db: list[float]             = Field(description="Power in dB (unit²/Hz)")
    peak_frequency: float             = Field(description="Hz — frequency bin with highest power")
    noise_floor_db: float             = Field(description="10th-percentile power level (approx. noise floor)")
    n_samples: int
    sample_rate: float                = Field(description="Hz")
    nperseg: int                      = Field(description="Welch segment length used")
    window: str
    unit: str


# ── RMS Envelope ───────────────────────────────────────────────────────────────

class EnvelopeOut(BaseModel):
    """
    Short-time RMS (root-mean-square) envelope.

    Computed with a sliding window at 75 % overlap.  Useful for tracking
    signal energy over time and identifying onset / decay regions.
    """

    test_id: str
    event_id: str
    channel_id: str
    times: list[float]                = Field(description="Window centre times (seconds)")
    envelope: list[float]             = Field(description="RMS amplitude per window (signal units)")
    rms_total: float                  = Field(description="Overall RMS of the full signal")
    window_ms: float                  = Field(description="Sliding window length (ms)")
    n_samples: int
    sample_rate: float
    unit: str


# ── Health ─────────────────────────────────────────────────────────────────────

class HealthOut(BaseModel):
    status: str
    service: str
    version: str
    environment: str
