// ── Domain Types ──────────────────────────────────────────────────────────────

export interface Test {
  id: string
  name: string
  description: string
  facility: string
  operator: string
  createdAt: string
  status: 'active' | 'archived' | 'processing'
  eventCount: number
  tags: string[]
}

export interface TestEvent {
  id: string
  testId: string
  name: string
  description: string
  timestamp: string
  duration: number       // seconds
  sampleRate: number     // Hz
  sampleCount: number
  channels: ChannelMeta[]
  status: 'complete' | 'partial' | 'failed'
  triggerCondition?: string
}

export interface ChannelMeta {
  id: string
  name: string
  unit: string
  sensorType: 'voltage' | 'current' | 'pressure' | 'strain' | 'temperature' | 'acceleration'
  range: [number, number]    // [min, max] hardware range
  color: string              // assigned plot color
}

export interface ChannelData {
  channelId: string
  eventId: string
  testId: string
  times: Float64Array        // seconds from event start
  values: Float64Array
  sampleRate: number
}

// ── Workspace Types ────────────────────────────────────────────────────────────

export interface LoadedEvent {
  testId: string
  eventId: string
  meta: TestEvent
  channels: Map<string, ChannelData>
}

export interface ActiveChannel {
  key: string              // `${eventId}::${channelId}`
  eventId: string
  channelId: string
  testId: string
  color: string
  visible: boolean
}

export interface Marker {
  id: string
  time: number             // seconds
  label: string
  color: string
}

// ── Widget Types ───────────────────────────────────────────────────────────────

export type WidgetType = 'waveform' | 'stats' | 'comparative' | 'fft' | 'correlation'

export interface WidgetConfig {
  id: string
  type: WidgetType
  title: string
  // waveform / comparative specific
  channelKeys?: string[]    // which ActiveChannel keys to show
  // stats specific
  eventIds?: string[]
  // layout
  poppedOut: boolean
}

export interface DashboardLayout {
  i: string
  x: number
  y: number
  w: number
  h: number
  minW?: number
  minH?: number
}

// ── Auth Types ─────────────────────────────────────────────────────────────────

export type Role = 'viewer' | 'analyst' | 'admin'

export interface UserProfile {
  id: string
  name: string
  email: string
  roles: Role[]
  groups: string[]
  avatarInitials: string
}

// ── Computed Stats ─────────────────────────────────────────────────────────────

export interface ChannelStats {
  channelKey: string
  channelName: string
  unit: string
  eventId: string
  min: number
  max: number
  mean: number
  rms: number
  peak: number
  peakTime: number
  riseTime: number | null    // 10–90% rise time (s)
  fallTime: number | null
  stdDev: number
  sampleCount: number
  duration: number
}

export interface MarkerDelta {
  markerId1: string
  markerId2: string
  timeDelta: number
  label1: string
  label2: string
}

// ── Compute / Frequency-domain Results ────────────────────────────────────────

export interface FFTResult {
  channelKey: string          // `${eventId}::${channelId}`
  frequencies: Float64Array   // Hz, one-sided
  magnitudes: Float64Array    // amplitude in signal units
  peakFrequency: number       // Hz
  binResolutionHz: number
  sampleRate: number
  window: string
  unit: string
}
