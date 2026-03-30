/**
 * Waveform service API client.
 *
 * Calls GET /api/v1/waveforms/{testId}/{eventId}/{channelId} through the
 * nginx reverse proxy (BFF mode — session cookie forwarded automatically).
 *
 * Override the base URL via VITE_WAVEFORM_API_BASE for direct service access
 * during development without nginx (e.g. http://localhost:8002).
 *
 * The endpoint returns raw FGW binary (application/x-floodgate-waveform).
 * This client parses the 128-byte little-endian header and the float32 sample array.
 */

const BASE = (import.meta.env.VITE_WAVEFORM_API_BASE ?? '') + '/api/v1/waveforms'

const FGW_HEADER_SIZE = 128
const _decoder = new TextDecoder('utf-8')

// Parsed result of a FGW binary response.
export interface WaveformResponse {
  event_id: string
  channel_id: string
  test_id: string
  sample_rate: number
  n_samples: number
  start_time: number
  unit: string
  values: Float32Array
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
  const res = await fetch(url, { credentials: 'include' })
  if (!res.ok) {
    throw new Error(`waveform fetch ${url} → HTTP ${res.status}`)
  }
  const buf = await res.arrayBuffer()
  return parseFGW(buf)
}

/**
 * Parse a FGW binary buffer into a WaveformResponse.
 * Header layout: 128-byte fixed little-endian header followed by float32 samples.
 */
function parseFGW(buf: ArrayBuffer): WaveformResponse {
  if (buf.byteLength < FGW_HEADER_SIZE) {
    throw new Error(`FGW too short: ${buf.byteLength} bytes`)
  }

  const view = new DataView(buf)

  // Validate magic bytes "FGW\x01"
  if (
    view.getUint8(0) !== 0x46 || // 'F'
    view.getUint8(1) !== 0x47 || // 'G'
    view.getUint8(2) !== 0x57 || // 'W'
    view.getUint8(3) !== 0x01
  ) {
    throw new Error('Invalid FGW magic bytes')
  }

  const verMajor = view.getUint16(4, true)
  if (verMajor !== 1) {
    throw new Error(`Unsupported FGW version: ${verMajor}`)
  }

  // n_samples is uint64 at offset 16 — safe to cast to Number for any realistic file size
  const nSamples = Number(view.getBigUint64(16, true))
  const sampleRate = view.getFloat64(24, true)
  const startTime = view.getFloat64(32, true)

  const unitLen = view.getUint8(42)
  const unit = _decoder.decode(new Uint8Array(buf, 43, unitLen))

  const eidLen = view.getUint8(58)
  const eventId = _decoder.decode(new Uint8Array(buf, 59, eidLen))

  const cidLen = view.getUint8(90)
  const channelId = _decoder.decode(new Uint8Array(buf, 91, cidLen))

  const tidLen = view.getUint8(106)
  const testId = _decoder.decode(new Uint8Array(buf, 107, tidLen))

  // Float32 samples start immediately after the 128-byte header.
  // Slice creates an independent copy so the original ArrayBuffer can be GC'd.
  const values = new Float32Array(buf.slice(FGW_HEADER_SIZE, FGW_HEADER_SIZE + nSamples * 4))

  return {
    event_id: eventId,
    channel_id: channelId,
    test_id: testId,
    sample_rate: sampleRate,
    n_samples: nSamples,
    start_time: startTime,
    unit,
    values,
  }
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
