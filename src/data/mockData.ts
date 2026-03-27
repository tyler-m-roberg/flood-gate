import type { Test, TestEvent, ChannelMeta, ChannelData, ChannelStats } from '@/types'

// ── Color palette for channels ─────────────────────────────────────────────────
const CHANNEL_COLORS = [
  '#58a6ff', '#3fb950', '#d29922', '#f85149',
  '#bc8cff', '#39c5cf', '#ff7b72', '#ffa657',
  '#79c0ff', '#56d364',
]

// ── Mock Tests ─────────────────────────────────────────────────────────────────
export const MOCK_TESTS: Test[] = [
  {
    id: 'TEST-2024-001',
    name: 'Structural Fatigue Campaign A',
    description: 'High-cycle fatigue testing on aluminum alloy specimens under axial loading with concurrent strain and AE monitoring.',
    facility: 'Lab Bay 3 — Servo-Hydraulic Frame',
    operator: 'J. Martinez',
    createdAt: '2024-11-12T09:00:00Z',
    status: 'active',
    eventCount: 12,
    tags: ['fatigue', 'aluminum', 'axial'],
  },
  {
    id: 'TEST-2024-002',
    name: 'Pressure Vessel Burst Series',
    description: 'Quasi-static pressurization to burst with AE and strain gauge arrays. 6061-T6 aluminum vessels.',
    facility: 'High-Pressure Bay',
    operator: 'S. Chen',
    createdAt: '2024-12-03T14:30:00Z',
    status: 'active',
    eventCount: 8,
    tags: ['pressure', 'burst', 'vessel'],
  },
  {
    id: 'TEST-2025-001',
    name: 'Composite Impact Matrix',
    description: 'Drop-weight impact testing on CFRP panels, varying energy levels. Full-field strain and acceleration.',
    facility: 'Impact Tower — Cell 2',
    operator: 'A. Patel',
    createdAt: '2025-01-22T08:15:00Z',
    status: 'active',
    eventCount: 24,
    tags: ['composite', 'impact', 'CFRP'],
  },
  {
    id: 'TEST-2025-002',
    name: 'Weld Integrity Survey',
    description: 'Ultrasonic and AE monitoring of resistance-spot welds under shear loading.',
    facility: 'Lab Bay 1',
    operator: 'R. Thompson',
    createdAt: '2025-02-14T11:00:00Z',
    status: 'archived',
    eventCount: 6,
    tags: ['weld', 'ultrasonic', 'shear'],
  },
]

// ── Channel definitions per test type ─────────────────────────────────────────
const FATIGUE_CHANNELS: ChannelMeta[] = [
  { id: 'CH1', name: 'Load Cell',        unit: 'kN',  sensorType: 'voltage',      range: [-100, 100],   color: CHANNEL_COLORS[0] },
  { id: 'CH2', name: 'Strain Gauge 1',   unit: 'µε',  sensorType: 'strain',       range: [-5000, 5000], color: CHANNEL_COLORS[1] },
  { id: 'CH3', name: 'Strain Gauge 2',   unit: 'µε',  sensorType: 'strain',       range: [-5000, 5000], color: CHANNEL_COLORS[2] },
  { id: 'CH4', name: 'AE Sensor 1',      unit: 'V',   sensorType: 'voltage',      range: [-5, 5],       color: CHANNEL_COLORS[3] },
  { id: 'CH5', name: 'AE Sensor 2',      unit: 'V',   sensorType: 'voltage',      range: [-5, 5],       color: CHANNEL_COLORS[4] },
  { id: 'CH6', name: 'Displacement',     unit: 'mm',  sensorType: 'voltage',      range: [-25, 25],     color: CHANNEL_COLORS[5] },
]

const PRESSURE_CHANNELS: ChannelMeta[] = [
  { id: 'CH1', name: 'Pressure (Inlet)',  unit: 'MPa', sensorType: 'pressure',     range: [0, 50],       color: CHANNEL_COLORS[0] },
  { id: 'CH2', name: 'Pressure (Vessel)', unit: 'MPa', sensorType: 'pressure',     range: [0, 50],       color: CHANNEL_COLORS[1] },
  { id: 'CH3', name: 'Hoop Strain 1',     unit: 'µε',  sensorType: 'strain',       range: [-8000, 8000], color: CHANNEL_COLORS[2] },
  { id: 'CH4', name: 'Hoop Strain 2',     unit: 'µε',  sensorType: 'strain',       range: [-8000, 8000], color: CHANNEL_COLORS[3] },
  { id: 'CH5', name: 'Axial Strain',      unit: 'µε',  sensorType: 'strain',       range: [-4000, 4000], color: CHANNEL_COLORS[4] },
  { id: 'CH6', name: 'AE Wideband',       unit: 'V',   sensorType: 'voltage',      range: [-5, 5],       color: CHANNEL_COLORS[5] },
  { id: 'CH7', name: 'Temperature',       unit: '°C',  sensorType: 'temperature',  range: [15, 80],      color: CHANNEL_COLORS[6] },
]

const IMPACT_CHANNELS: ChannelMeta[] = [
  { id: 'CH1', name: 'Impactor Force',    unit: 'kN',   sensorType: 'voltage',      range: [0, 30],       color: CHANNEL_COLORS[0] },
  { id: 'CH2', name: 'Accel Z (top)',     unit: 'g',    sensorType: 'acceleration', range: [-500, 500],   color: CHANNEL_COLORS[1] },
  { id: 'CH3', name: 'Accel Z (btm)',     unit: 'g',    sensorType: 'acceleration', range: [-500, 500],   color: CHANNEL_COLORS[2] },
  { id: 'CH4', name: 'Strain Rosette X',  unit: 'µε',   sensorType: 'strain',       range: [-3000, 3000], color: CHANNEL_COLORS[3] },
  { id: 'CH5', name: 'Strain Rosette Y',  unit: 'µε',   sensorType: 'strain',       range: [-3000, 3000], color: CHANNEL_COLORS[4] },
  { id: 'CH6', name: 'AE Piezo 1',        unit: 'V',    sensorType: 'voltage',      range: [-5, 5],       color: CHANNEL_COLORS[5] },
  { id: 'CH7', name: 'AE Piezo 2',        unit: 'V',    sensorType: 'voltage',      range: [-5, 5],       color: CHANNEL_COLORS[6] },
  { id: 'CH8', name: 'Velocity (DIC)',    unit: 'm/s',  sensorType: 'voltage',      range: [-10, 10],     color: CHANNEL_COLORS[7] },
]

const WELD_CHANNELS: ChannelMeta[] = [
  { id: 'CH1', name: 'Shear Load',        unit: 'kN',  sensorType: 'voltage',  range: [-20, 20],  color: CHANNEL_COLORS[0] },
  { id: 'CH2', name: 'Peel Load',         unit: 'kN',  sensorType: 'voltage',  range: [-5, 5],    color: CHANNEL_COLORS[1] },
  { id: 'CH3', name: 'AE RMS',            unit: 'mV',  sensorType: 'voltage',  range: [0, 500],   color: CHANNEL_COLORS[2] },
  { id: 'CH4', name: 'Extensometer',      unit: 'mm',  sensorType: 'voltage',  range: [-2, 2],    color: CHANNEL_COLORS[3] },
]

const CHANNELS_BY_TEST: Record<string, ChannelMeta[]> = {
  'TEST-2024-001': FATIGUE_CHANNELS,
  'TEST-2024-002': PRESSURE_CHANNELS,
  'TEST-2025-001': IMPACT_CHANNELS,
  'TEST-2025-002': WELD_CHANNELS,
}

// ── Waveform sample count — must match scripts/load_mock_waveforms/main.py ─────
// Fixed at 2048 so event metadata is deterministic and consistent with the
// objects uploaded to MinIO by the mock data loader.
export const N_SAMPLES = 2048

// ── Mock Events ────────────────────────────────────────────────────────────────
function makeEvents(testId: string, count: number): TestEvent[] {
  const baseDate = new Date('2024-11-15T10:00:00Z')
  const channels = CHANNELS_BY_TEST[testId] ?? FATIGUE_CHANNELS
  const eventLabels: Record<string, string[]> = {
    'TEST-2024-001': ['Pre-crack baseline', 'Crack initiation', 'Crack growth phase 1', 'Crack growth phase 2', 'Rapid propagation', 'Near-failure', 'Fracture event', 'Post-fracture', 'Repeat specimen A', 'Repeat specimen B', 'High-amplitude cycle', 'Final fracture'],
    'TEST-2024-002': ['Hydrostatic proof', 'Pre-burst slow ramp', 'Pre-burst fast ramp', 'Burst attempt 1', 'Burst attempt 2', 'Acoustic emission onset', 'Ligament teardown', 'Final burst'],
    'TEST-2025-001': Array.from({ length: 24 }, (_, i) => `Impact shot ${(i + 1).toString().padStart(2, '0')} — ${[5, 10, 15, 20, 25, 30][i % 6]}J`),
    'TEST-2025-002': ['Weld set A — shear', 'Weld set A — peel', 'Weld set B — shear', 'Weld set B — peel', 'Weld set C — mixed', 'Final pull-out'],
  }
  const labels = eventLabels[testId] ?? Array.from({ length: count }, (_, i) => `Event ${(i + 1).toString().padStart(3, '0')}`)

  return Array.from({ length: count }, (_, i) => {
    const ts = new Date(baseDate.getTime() + i * 3_600_000 * 2)
    const sampleRate = [400_000, 500_000, 1_000_000][i % 3]
    // Fixed sample count → deterministic duration, consistent with MinIO objects.
    const duration = N_SAMPLES / sampleRate
    return {
      id: `EVT-${String(i + 1).padStart(3, '0')}`,
      testId,
      name: labels[i] ?? `Event ${i + 1}`,
      description: `Triggered at ${ts.toISOString().slice(11, 19)} UTC`,
      timestamp: ts.toISOString(),
      duration,
      sampleRate,
      sampleCount: N_SAMPLES,
      channels,
      status: 'complete' as const,
      triggerCondition: i % 3 === 0 ? 'threshold > 2.5 V' : i % 3 === 1 ? 'manual' : 'AE rate > 100 hits/s',
    }
  })
}

export const MOCK_EVENTS: Record<string, TestEvent[]> = {
  'TEST-2024-001': makeEvents('TEST-2024-001', 12),
  'TEST-2024-002': makeEvents('TEST-2024-002', 8),
  'TEST-2025-001': makeEvents('TEST-2025-001', 24),
  'TEST-2025-002': makeEvents('TEST-2025-002', 6),
}

// ── Waveform generation ────────────────────────────────────────────────────────
type WaveformProfile = 'impulse' | 'sine_burst' | 'ramp_hold' | 'ae_burst' | 'step_decay' | 'noise_floor'

function seededRand(seed: number) {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff
    return (s >>> 0) / 0xffffffff
  }
}

function generateWaveform(
  n: number,
  dt: number,
  profile: WaveformProfile,
  amplitude: number,
  noiseLevel: number,
  seed: number
): Float64Array {
  const rand = seededRand(seed)
  const out = new Float64Array(n)

  switch (profile) {
    case 'impulse': {
      const peakIdx = Math.floor(n * 0.15)
      const decay = 800 * dt  // ~800 µs
      for (let i = 0; i < n; i++) {
        const t = i * dt
        const tPeak = peakIdx * dt
        const env = t >= tPeak ? amplitude * Math.exp(-(t - tPeak) / decay) : amplitude * (t / tPeak)
        const osc = Math.sin(2 * Math.PI * 80_000 * t + rand() * 0.1) // 80 kHz ringing
        out[i] = env * osc + (rand() - 0.5) * noiseLevel
      }
      break
    }
    case 'sine_burst': {
      const start = Math.floor(n * 0.1)
      const end = Math.floor(n * 0.6)
      for (let i = 0; i < n; i++) {
        const t = i * dt
        if (i >= start && i < end) {
          const phase = 2 * Math.PI * 25_000 * t
          const env = Math.sin(Math.PI * (i - start) / (end - start))
          out[i] = amplitude * env * Math.sin(phase) + (rand() - 0.5) * noiseLevel
        } else {
          out[i] = (rand() - 0.5) * noiseLevel
        }
      }
      break
    }
    case 'ramp_hold': {
      const rampEnd = Math.floor(n * 0.3)
      const holdEnd = Math.floor(n * 0.75)
      for (let i = 0; i < n; i++) {
        let base = 0
        if (i < rampEnd) base = amplitude * (i / rampEnd)
        else if (i < holdEnd) base = amplitude
        else base = amplitude * (1 - (i - holdEnd) / (n - holdEnd))
        out[i] = base + (rand() - 0.5) * noiseLevel
      }
      break
    }
    case 'ae_burst': {
      // Multiple AE hits scattered through the record
      const hits = 6
      for (let h = 0; h < hits; h++) {
        const hitIdx = Math.floor(n * (0.05 + (h / hits) * 0.85 + rand() * 0.05))
        const hitAmp = amplitude * (0.4 + rand() * 0.6)
        const decay = 200 * dt
        const freq = 150_000 + rand() * 200_000
        for (let i = hitIdx; i < Math.min(hitIdx + Math.floor(0.002 / dt), n); i++) {
          const t = (i - hitIdx) * dt
          out[i] += hitAmp * Math.exp(-t / decay) * Math.sin(2 * Math.PI * freq * t)
        }
      }
      for (let i = 0; i < n; i++) out[i] += (rand() - 0.5) * noiseLevel
      break
    }
    case 'step_decay': {
      const stepIdx = Math.floor(n * 0.2)
      for (let i = 0; i < n; i++) {
        const t = i * dt
        const tStep = stepIdx * dt
        const base = i < stepIdx ? 0 : amplitude * (1 - Math.exp(-(t - tStep) / (50 * dt)))
        out[i] = base + (rand() - 0.5) * noiseLevel
      }
      break
    }
    case 'noise_floor':
    default: {
      for (let i = 0; i < n; i++) out[i] = (rand() - 0.5) * noiseLevel
      break
    }
  }
  return out
}

const CHANNEL_PROFILES: Record<string, WaveformProfile[]> = {
  voltage:      ['ae_burst', 'impulse', 'sine_burst'],
  strain:       ['ramp_hold', 'step_decay', 'ramp_hold'],
  pressure:     ['ramp_hold', 'step_decay', 'ramp_hold'],
  acceleration: ['impulse', 'sine_burst', 'impulse'],
  current:      ['ramp_hold', 'ramp_hold', 'step_decay'],
  temperature:  ['step_decay', 'ramp_hold', 'step_decay'],
}

export function generateChannelData(
  channelMeta: ChannelMeta,
  event: TestEvent,
  eventIndex: number,
): ChannelData {
  const { sampleRate, sampleCount, id: eventId, testId } = event
  const dt = 1 / sampleRate
  const profiles = CHANNEL_PROFILES[channelMeta.sensorType] ?? ['noise_floor']
  const profile = profiles[eventIndex % profiles.length]
  const [rMin, rMax] = channelMeta.range
  const amplitude = (rMax - rMin) * 0.4
  const noiseLevel = (rMax - rMin) * 0.015

  // Seed from event+channel for determinism
  const seed = (eventId.charCodeAt(4) ?? 1) * 31 + (channelMeta.id.charCodeAt(2) ?? 7) * 17 + eventIndex * 97

  const values = generateWaveform(sampleCount, dt, profile, amplitude, noiseLevel, seed)

  // Build time array
  const times = new Float64Array(sampleCount)
  for (let i = 0; i < sampleCount; i++) times[i] = i * dt

  return { channelId: channelMeta.id, eventId, testId, times, values, sampleRate }
}

// ── Stats computation (pure JS, runs in main thread for small N) ───────────────
export function computeStats(data: ChannelData, meta: ChannelMeta, eventId: string): ChannelStats {
  const { values, times } = data
  const n = values.length
  if (n === 0) {
    return {
      channelKey: `${eventId}::${meta.id}`,
      channelName: meta.name, unit: meta.unit, eventId,
      min: 0, max: 0, mean: 0, rms: 0, peak: 0, peakTime: 0,
      riseTime: null, fallTime: null, stdDev: 0, sampleCount: 0, duration: 0,
    }
  }

  let min = values[0], max = values[0], sum = 0, sumSq = 0
  let peakAbs = 0, peakIdx = 0
  for (let i = 0; i < n; i++) {
    const v = values[i]
    if (v < min) min = v
    if (v > max) max = v
    sum += v
    sumSq += v * v
    if (Math.abs(v) > peakAbs) { peakAbs = Math.abs(v); peakIdx = i }
  }
  const mean = sum / n
  const rms = Math.sqrt(sumSq / n)
  const stdDev = Math.sqrt(sumSq / n - mean * mean)
  const peak = values[peakIdx]
  const peakTime = times[peakIdx]
  const duration = times[n - 1] - times[0]

  // 10–90% rise time: find first crossing of 10% and 90% of peak
  const lo = min + (max - min) * 0.1
  const hi = min + (max - min) * 0.9
  let t10 = null as number | null, t90 = null as number | null
  let t90f = null as number | null, t10f = null as number | null
  for (let i = 1; i < n; i++) {
    if (t10 === null && values[i] >= lo) t10 = times[i]
    if (t90 === null && values[i] >= hi) { t90 = times[i]; break }
  }
  // Fall time: descending from 90% to 10% after peak
  for (let i = peakIdx; i < n; i++) {
    if (t90f === null && values[i] <= hi) t90f = times[i]
    if (t90f !== null && t10f === null && values[i] <= lo) { t10f = times[i]; break }
  }

  const riseTime = t10 !== null && t90 !== null ? t90 - t10 : null
  const fallTime = t90f !== null && t10f !== null ? t10f - t90f : null

  return {
    channelKey: `${eventId}::${meta.id}`,
    channelName: meta.name,
    unit: meta.unit,
    eventId,
    min, max, mean, rms, peak, peakTime,
    riseTime, fallTime, stdDev,
    sampleCount: n,
    duration,
  }
}

export { CHANNELS_BY_TEST }
