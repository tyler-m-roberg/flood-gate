/**
 * HTTP client for the FloodGate Compute Service.
 *
 * Endpoints:
 *   GET /api/v1/compute/{testId}/{eventId}/{channelId}/fft
 *   GET /api/v1/compute/{testId}/{eventId}/{channelId}/psd
 *   GET /api/v1/compute/{testId}/{eventId}/{channelId}/envelope
 *
 * All requests use credentials: 'include' so the BFF session cookie is
 * forwarded automatically.  Throws on non-2xx responses.
 *
 * The compute service returns Cache-Control: public, max-age=3600, immutable
 * so repeated requests for the same channel are served from the browser cache.
 */

const BASE = (import.meta.env.VITE_COMPUTE_API_BASE ?? '') + '/api/v1/compute'

// ── Response types (mirror compute-service Pydantic models, snake_case) ────────

export interface FFTResponse {
  test_id: string
  event_id: string
  channel_id: string
  frequencies: number[]       // Hz, one-sided 0 … Nyquist
  magnitudes: number[]        // amplitude in signal units
  peak_frequency: number      // Hz — strongest non-DC peak
  bin_resolution_hz: number
  n_samples: number
  sample_rate: number
  window: string
  unit: string
}

export interface PSDResponse {
  test_id: string
  event_id: string
  channel_id: string
  frequencies: number[]       // Hz
  power_db: number[]          // dB (unit²/Hz)
  peak_frequency: number
  noise_floor_db: number
  n_samples: number
  sample_rate: number
  nperseg: number
  window: string
  unit: string
}

export interface EnvelopeResponse {
  test_id: string
  event_id: string
  channel_id: string
  times: number[]             // seconds
  envelope: number[]          // RMS amplitude per window
  rms_total: number
  window_ms: number
  n_samples: number
  sample_rate: number
  unit: string
}

export type WindowFunction = 'hann' | 'hamming' | 'blackman' | 'none'

// ── Client functions ────────────────────────────────────────────────────────────

async function _get<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: 'include' })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Compute API ${res.status}: ${body}`)
  }
  return res.json() as Promise<T>
}

export function fetchFFT(
  testId: string,
  eventId: string,
  channelId: string,
  window: WindowFunction = 'hann',
): Promise<FFTResponse> {
  const url = `${BASE}/${testId}/${eventId}/${channelId}/fft?window=${window}`
  return _get<FFTResponse>(url)
}

export function fetchPSD(
  testId: string,
  eventId: string,
  channelId: string,
  window: WindowFunction = 'hann',
  nperseg = 512,
): Promise<PSDResponse> {
  const url = `${BASE}/${testId}/${eventId}/${channelId}/psd?window=${window}&nperseg=${nperseg}`
  return _get<PSDResponse>(url)
}

export function fetchEnvelope(
  testId: string,
  eventId: string,
  channelId: string,
  windowMs = 1.0,
): Promise<EnvelopeResponse> {
  const url = `${BASE}/${testId}/${eventId}/${channelId}/envelope?window_ms=${windowMs}`
  return _get<EnvelopeResponse>(url)
}
