/**
 * Waveform service API client.
 *
 * Calls GET /api/v1/waveforms/{testId}/{eventId}/{channelId} through the
 * nginx reverse proxy (BFF mode — session cookie forwarded automatically).
 *
 * Override the base URL via VITE_WAVEFORM_API_BASE for direct service access
 * during development without nginx (e.g. http://localhost:8002).
 */

const BASE = (import.meta.env.VITE_WAVEFORM_API_BASE ?? '') + '/api/v1/waveforms'

// Shape returned by the Go waveform service
export interface WaveformResponse {
  event_id: string
  channel_id: string
  test_id: string
  sample_rate: number
  n_samples: number
  start_time: number
  unit: string
  values: number[]
}

/**
 * Fetch a single channel's waveform from the waveform service.
 * Throws on non-2xx responses so callers can catch and fall back.
 */
export async function fetchWaveform(
  testId: string,
  eventId: string,
  channelId: string,
): Promise<WaveformResponse> {
  const url = `${BASE}/${encodeURIComponent(testId)}/${encodeURIComponent(eventId)}/${encodeURIComponent(channelId)}`

  const res = await fetch(url, {
    // credentials: 'include' ensures the session cookie is forwarded in BFF mode.
    // When running against the waveform service directly with a Bearer token,
    // set the Authorization header via a custom fetch wrapper here.
    credentials: 'include',
  })

  if (!res.ok) {
    throw new Error(`waveform fetch ${url} → HTTP ${res.status}`)
  }

  return res.json() as Promise<WaveformResponse>
}

/**
 * Reconstruct evenly-spaced time axis from sample count and sample rate.
 * Avoids sending the full time array over the wire.
 */
export function buildTimeAxis(nSamples: number, sampleRate: number, startTime = 0): Float64Array {
  const times = new Float64Array(nSamples)
  const dt = 1 / sampleRate
  for (let i = 0; i < nSamples; i++) {
    times[i] = startTime + i * dt
  }
  return times
}
