/**
 * Metadata service API client.
 *
 * Calls /api/v1/tests and /api/v1/tests/{testId}/events through the
 * nginx reverse proxy (BFF mode — session cookie forwarded automatically).
 */

import type {
  ChannelCreateInput,
  EventCreateInput,
  Test,
  TestCreateInput,
  TestEvent,
  ChannelMeta,
} from '@/types'
const BASE = (import.meta.env.VITE_METADATA_API_BASE ?? '') + '/api/v1'

// ── Response shapes (snake_case from API) ────────────────────────────────────

interface TestApiItem {
  id: string
  name: string
  description: string
  facility: string
  operator: string
  created_at: string
  status: 'active' | 'archived' | 'processing'
  event_count: number
  tags: string[]
}

interface EventApiItem {
  id: string
  test_id: string
  name: string
  description: string
  timestamp: string
  duration: number
  sample_rate: number
  sample_count: number
  status: 'complete' | 'partial' | 'failed'
  trigger_condition?: string
  channel_count: number
}

interface ChannelApiItem {
  id: string
  name: string
  unit: string
  sensor_type: ChannelMeta['sensorType']
  range_min: number
  range_max: number
  color: string
  description: string
}

// ── Mappers ──────────────────────────────────────────────────────────────────

function mapTest(t: TestApiItem): Test {
  return {
    id: t.id,
    name: t.name,
    description: t.description,
    facility: t.facility,
    operator: t.operator,
    createdAt: t.created_at,
    status: t.status,
    eventCount: t.event_count,
    tags: t.tags,
  }
}

function mapEvent(e: EventApiItem, channels: ChannelMeta[]): TestEvent {
  return {
    id: e.id,
    testId: e.test_id,
    name: e.name,
    description: e.description,
    timestamp: e.timestamp,
    duration: e.duration,
    sampleRate: e.sample_rate,
    sampleCount: e.sample_count,
    channels,
    status: e.status,
    triggerCondition: e.trigger_condition,
  }
}

function mapChannel(c: ChannelApiItem): ChannelMeta {
  return {
    id: c.id,
    name: c.name,
    unit: c.unit,
    sensorType: c.sensor_type,
    range: [c.range_min, c.range_max],
    color: c.color,
  }
}

// ── API functions ────────────────────────────────────────────────────────────

export async function fetchTests(params?: {
  status?: string
  tag?: string
  search?: string
}): Promise<{ items: Test[]; total: number }> {
  const url = new URL(`${BASE}/tests`, window.location.origin)
  if (params?.status) url.searchParams.set('status', params.status)
  if (params?.tag) url.searchParams.set('tag', params.tag)
  if (params?.search) url.searchParams.set('search', params.search)

  const res = await fetch(url.toString(), { credentials: 'include' })
  if (!res.ok) throw new Error(`fetchTests failed: HTTP ${res.status}`)

  const data = await res.json()
  return {
    items: (data.items as TestApiItem[]).map(mapTest),
    total: data.total,
  }
}

export async function fetchEvents(
  testId: string,
  params?: { status?: string; search?: string },
): Promise<{ items: TestEvent[]; total: number }> {
  // First fetch channels for this test
  const channelsRes = await fetch(
    `${BASE}/tests/${encodeURIComponent(testId)}/channels`,
    { credentials: 'include' },
  )
  let channels: ChannelMeta[] = []
  if (channelsRes.ok) {
    const chData = await channelsRes.json()
    channels = (chData.items as ChannelApiItem[]).map(mapChannel)
  }

  const url = new URL(
    `${BASE}/tests/${encodeURIComponent(testId)}/events`,
    window.location.origin,
  )
  if (params?.status) url.searchParams.set('status', params.status)
  if (params?.search) url.searchParams.set('search', params.search)

  const res = await fetch(url.toString(), { credentials: 'include' })
  if (!res.ok) throw new Error(`fetchEvents failed: HTTP ${res.status}`)

  const data = await res.json()
  return {
    items: (data.items as EventApiItem[]).map(e => mapEvent(e, channels)),
    total: data.total,
  }
}

export async function fetchChannels(
  testId: string,
): Promise<ChannelMeta[]> {
  const res = await fetch(
    `${BASE}/tests/${encodeURIComponent(testId)}/channels`,
    { credentials: 'include' },
  )
  if (!res.ok) throw new Error(`fetchChannels failed: HTTP ${res.status}`)
  const data = await res.json()
  return (data.items as ChannelApiItem[]).map(mapChannel)
}

export async function updateTest(
  testId: string,
  payload: Partial<TestCreateInput> & { status?: Test['status'] },
): Promise<Test> {
  const res = await fetch(`${BASE}/tests/${encodeURIComponent(testId)}`, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(`updateTest failed: HTTP ${res.status}`)
  const data: TestApiItem = await res.json()
  return mapTest(data)
}

export async function createTest(payload: TestCreateInput): Promise<Test> {
  const res = await fetch(`${BASE}/tests`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(`createTest failed: HTTP ${res.status}`)
  const data: TestApiItem = await res.json()
  return mapTest(data)
}

export async function createEventWithData(
  testId: string,
  meta: {
    event: EventCreateInput
    channels: ChannelCreateInput[]
  },
  csvFile: File,
): Promise<TestEvent> {
  const form = new FormData()
  form.append('event_meta', JSON.stringify(meta))
  form.append('csv_file', csvFile)

  const res = await fetch(
    `${BASE}/tests/${encodeURIComponent(testId)}/events`,
    { method: 'POST', credentials: 'include', body: form },
  )
  if (!res.ok) throw new Error(`createEvent failed: HTTP ${res.status}`)
  const data: EventApiItem = await res.json()
  return mapEvent(data, [])
}
