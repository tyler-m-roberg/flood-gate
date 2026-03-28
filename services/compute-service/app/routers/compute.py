"""
Signal computation endpoints.

All routes share the path prefix  /compute/{test_id}/{event_id}/{channel_id}
so that a single waveform fetch warms the in-request cache for all
analyses requested in parallel from the frontend.

Authentication
--------------
Every route requires a valid JWT (Bearer or session cookie) — see auth/.

Caching
-------
Results are deterministic for a given (test, event, channel) triple because
the underlying waveforms are immutable objects in MinIO.  The response
carries  Cache-Control: public, max-age=3600, immutable  so that the nginx
reverse proxy and browser can cache aggressively.
"""

from __future__ import annotations

import asyncio
import contextlib

import numpy as np
import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from scipy import signal as sp_signal  # type: ignore[import-untyped]

from app.auth.dependencies import get_current_user
from app.auth.models import CurrentUser
from app.config import Settings, get_settings
from app.models.compute import EnvelopeOut, FFTOut, PSDOut
from app.storage.waveform import WaveformData, WaveformNotFoundError, fetch_waveform

log = structlog.get_logger(__name__)

router = APIRouter(prefix="/compute", tags=["compute"])

# ── Window function registry ───────────────────────────────────────────────────

_WINDOWS = {"hann", "hamming", "blackman", "none"}


def _apply_window(values: np.ndarray, window: str) -> np.ndarray:
    if window == "hann":
        return values * np.hanning(len(values))
    if window == "hamming":
        return values * np.hamming(len(values))
    if window == "blackman":
        return values * np.blackman(len(values))
    return values  # "none" — rectangular


# ── Shared waveform dependency ─────────────────────────────────────────────────

async def _get_waveform(
    test_id: str,
    event_id: str,
    channel_id: str,
    settings: Settings = Depends(get_settings),
    _user: CurrentUser = Depends(get_current_user),
) -> WaveformData:
    """Fetch waveform from MinIO; raise appropriate HTTP errors on failure."""
    try:
        return await fetch_waveform(test_id, event_id, channel_id, settings)
    except WaveformNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Waveform not found: {exc.key}",
        ) from exc
    except Exception as exc:
        log.exception(
            "storage.error",
            test_id=test_id,
            event_id=event_id,
            channel_id=channel_id,
            error=str(exc),
        )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to retrieve waveform from object store",
        ) from exc


# ── FFT endpoint ───────────────────────────────────────────────────────────────

@router.get(
    "/{test_id}/{event_id}/{channel_id}/fft",
    response_model=FFTOut,
    summary="One-sided amplitude spectrum (windowed FFT)",
    description=(
        "Computes the normalised one-sided amplitude spectrum of the channel "
        "waveform.  Magnitudes are scaled so that a pure sine at amplitude A "
        "produces a peak of A (consistent with engineering convention). "
        "The DC bin is included; results are deterministic and safe to cache."
    ),
)
async def get_fft(
    response: Response,
    waveform: WaveformData = Depends(_get_waveform),
    window: str = Query(
        default="hann",
        description="Window function: hann | hamming | blackman | none",
        pattern="^(hann|hamming|blackman|none)$",
    ),
) -> FFTOut:
    def _compute() -> FFTOut:
        n = len(waveform.values)
        windowed = _apply_window(waveform.values, window)

        fft_vals = np.fft.rfft(windowed)
        freqs = np.fft.rfftfreq(n, d=1.0 / waveform.sample_rate)

        # Normalise: factor-of-2 for one-sided; DC and Nyquist bins are not doubled
        magnitudes = np.abs(fft_vals) * 2.0 / n
        magnitudes[0] /= 2.0
        if n % 2 == 0:
            magnitudes[-1] /= 2.0

        # Peak: skip DC bin (index 0) to find the dominant non-DC frequency
        peak_idx = int(np.argmax(magnitudes[1:])) + 1

        return FFTOut(
            test_id=waveform.test_id,
            event_id=waveform.event_id,
            channel_id=waveform.channel_id,
            frequencies=freqs.tolist(),
            magnitudes=magnitudes.tolist(),
            peak_frequency=float(freqs[peak_idx]),
            bin_resolution_hz=float(waveform.sample_rate / n),
            n_samples=n,
            sample_rate=waveform.sample_rate,
            window=window,
            unit=waveform.unit,
        )

    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(None, _compute)

    response.headers["Cache-Control"] = "public, max-age=3600, immutable"
    log.info(
        "compute.fft",
        test_id=waveform.test_id,
        event_id=waveform.event_id,
        channel_id=waveform.channel_id,
        window=window,
        peak_hz=result.peak_frequency,
    )
    return result


# ── PSD endpoint ───────────────────────────────────────────────────────────────

@router.get(
    "/{test_id}/{event_id}/{channel_id}/psd",
    response_model=PSDOut,
    summary="Power Spectral Density via Welch's method",
    description=(
        "Estimates the one-sided PSD using Welch's averaged periodogram "
        "(75 % overlap, configurable segment length).  Power is returned in "
        "dB (10·log₁₀(unit²/Hz)).  Useful for noise-floor analysis and "
        "identifying resonant frequencies with reduced variance compared to "
        "a raw periodogram."
    ),
)
async def get_psd(
    response: Response,
    waveform: WaveformData = Depends(_get_waveform),
    window: str = Query(
        default="hann",
        description="Window function: hann | hamming | blackman | none",
        pattern="^(hann|hamming|blackman|none)$",
    ),
    nperseg: int = Query(
        default=512,
        ge=16,
        le=8192,
        description="Welch segment length (samples). Smaller → more averaging, coarser frequency resolution.",
    ),
) -> PSDOut:
    def _compute() -> PSDOut:
        n = len(waveform.values)
        effective_nperseg = min(nperseg, n)
        scipy_window = "boxcar" if window == "none" else window

        freqs, psd = sp_signal.welch(
            waveform.values,
            fs=waveform.sample_rate,
            window=scipy_window,
            nperseg=effective_nperseg,
            noverlap=effective_nperseg * 3 // 4,
            scaling="density",
        )

        # Avoid log(0): clamp to a very small positive value (-120 dB floor)
        power_db = 10.0 * np.log10(np.maximum(psd, 1e-12))

        peak_idx = int(np.argmax(psd[1:])) + 1  # skip DC
        noise_floor_db = float(np.percentile(power_db, 10))

        return PSDOut(
            test_id=waveform.test_id,
            event_id=waveform.event_id,
            channel_id=waveform.channel_id,
            frequencies=freqs.tolist(),
            power_db=power_db.tolist(),
            peak_frequency=float(freqs[peak_idx]),
            noise_floor_db=noise_floor_db,
            n_samples=n,
            sample_rate=waveform.sample_rate,
            nperseg=effective_nperseg,
            window=window,
            unit=waveform.unit,
        )

    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(None, _compute)

    response.headers["Cache-Control"] = "public, max-age=3600, immutable"
    log.info(
        "compute.psd",
        test_id=waveform.test_id,
        event_id=waveform.event_id,
        channel_id=waveform.channel_id,
        peak_hz=result.peak_frequency,
        noise_floor_db=result.noise_floor_db,
    )
    return result


# ── Envelope endpoint ──────────────────────────────────────────────────────────

@router.get(
    "/{test_id}/{event_id}/{channel_id}/envelope",
    response_model=EnvelopeOut,
    summary="Short-time RMS envelope",
    description=(
        "Computes the RMS amplitude within a sliding window (75 % overlap) "
        "across the full signal.  Useful for visualising signal energy over "
        "time, identifying onset/decay regions, and acoustic emission hit "
        "detection.  Window length is specified in milliseconds and converted "
        "to the nearest integer number of samples."
    ),
)
async def get_envelope(
    response: Response,
    waveform: WaveformData = Depends(_get_waveform),
    window_ms: float = Query(
        default=1.0,
        gt=0.0,
        le=100.0,
        description="Sliding window length in milliseconds (> 0, ≤ 100).",
    ),
) -> EnvelopeOut:
    def _compute() -> EnvelopeOut:
        values = waveform.values
        n = len(values)
        sr = waveform.sample_rate

        window_samples = max(1, int(sr * window_ms / 1000.0))
        stride = max(1, window_samples // 4)  # 75 % overlap

        # Vectorised via stride tricks: shape (n_windows, window_samples)
        n_windows = (n - window_samples) // stride + 1
        indices = np.arange(n_windows) * stride
        windows = np.lib.stride_tricks.sliding_window_view(values, window_samples)[::stride]

        envelope = np.sqrt(np.mean(windows ** 2, axis=1))
        times = (indices + window_samples / 2.0) / sr
        rms_total = float(np.sqrt(np.mean(values ** 2)))

        return EnvelopeOut(
            test_id=waveform.test_id,
            event_id=waveform.event_id,
            channel_id=waveform.channel_id,
            times=times.tolist(),
            envelope=envelope.tolist(),
            rms_total=rms_total,
            window_ms=window_ms,
            n_samples=n,
            sample_rate=sr,
            unit=waveform.unit,
        )

    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(None, _compute)

    response.headers["Cache-Control"] = "public, max-age=3600, immutable"
    log.info(
        "compute.envelope",
        test_id=waveform.test_id,
        event_id=waveform.event_id,
        channel_id=waveform.channel_id,
        window_ms=window_ms,
        rms_total=result.rms_total,
    )
    return result


# ── Suppress unused import warning (contextlib used elsewhere in the codebase) ─
_ = contextlib
