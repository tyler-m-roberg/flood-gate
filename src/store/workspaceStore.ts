import { create } from 'zustand'
import type {
  LoadedEvent, ActiveChannel, Marker,
  WidgetConfig, WidgetType, DashboardLayout,
  ChannelStats, FFTResult,
} from '@/types'
import {
  MOCK_EVENTS, generateChannelData, computeStats, CHANNELS_BY_TEST,
} from '@/data/mockData'
import { fetchWaveform, buildTimeAxis } from '@/api/waveformClient'
import { fetchFFT, type WindowFunction } from '@/api/computeClient'

// ── Helpers ────────────────────────────────────────────────────────────────────
function channelKey(eventId: string, channelId: string) {
  return `${eventId}::${channelId}`
}

function makeWidgetId() {
  return `w-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
}

const MARKER_COLORS = ['#f85149', '#3fb950', '#d29922', '#bc8cff', '#58a6ff']

// ── Store ──────────────────────────────────────────────────────────────────────
interface WorkspaceState {
  // Navigation context
  activeTestId: string | null
  setActiveTestId(id: string | null): void

  // Loaded events (data in memory)
  loadedEvents: LoadedEvent[]
  loadingEvents: Set<string>
  loadEvent(testId: string, eventId: string): void
  unloadEvent(eventId: string): void
  isEventLoaded(eventId: string): boolean

  // Active channels (selected for display)
  activeChannels: ActiveChannel[]
  toggleChannel(eventId: string, channelId: string): void
  isChannelActive(eventId: string, channelId: string): boolean
  setChannelVisible(key: string, visible: boolean): void
  clearChannels(): void

  // Stats cache
  statsCache: Map<string, ChannelStats>
  getStats(channelKey: string): ChannelStats | null

  // FFT cache
  fftCache: Map<string, FFTResult>
  loadingFFT: Set<string>
  loadFFT(testId: string, eventId: string, channelId: string, window?: WindowFunction): void
  getFFT(channelKey: string): FFTResult | null

  // Markers
  markers: Marker[]
  addMarker(time: number): void
  removeMarker(id: string): void
  clearMarkers(): void

  // Widgets
  widgets: WidgetConfig[]
  addWidget(type: WidgetType): void
  removeWidget(id: string): void
  updateWidget(id: string, patch: Partial<WidgetConfig>): void
  assignChannelsToWidget(widgetId: string, keys: string[]): void

  // Dashboard layout
  layout: DashboardLayout[]
  setLayout(layout: DashboardLayout[]): void

  // Pop-out tracking
  poppedOutWindows: Map<string, Window>
  popOutWidget(id: string): void
  closePopOut(id: string): void
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  activeTestId: null,
  setActiveTestId: (id) => set({ activeTestId: id }),

  // ── Events ──────────────────────────────────────────────────────────────────
  loadedEvents: [],
  loadingEvents: new Set(),

  loadEvent(testId, eventId) {
    const state = get()
    if (state.isEventLoaded(eventId) || state.loadingEvents.has(eventId)) return

    const events = MOCK_EVENTS[testId] ?? []
    const eventMeta = events.find(e => e.id === eventId)
    if (!eventMeta) return

    const channels = CHANNELS_BY_TEST[testId] ?? []
    const eventIndex = events.findIndex(e => e.id === eventId)

    // Mark loading immediately so callers can show a spinner
    set(s => ({ loadingEvents: new Set([...s.loadingEvents, eventId]) }))

    void (async () => {
      // Fetch all channels in parallel; fall back to local generation on error
      const results = await Promise.allSettled(
        channels.map(ch => fetchWaveform(testId, eventId, ch.id))
      )

      const channelDataMap = new Map(
        channels.map((ch, idx) => {
          const result = results[idx]
          if (result.status === 'fulfilled') {
            const r = result.value
            return [ch.id, {
              channelId: ch.id,
              eventId,
              testId,
              times: buildTimeAxis(r.n_samples, r.sample_rate, r.start_time),
              values: Float64Array.from(r.values),
              sampleRate: r.sample_rate,
            }]
          }
          // API unavailable or 401 — generate locally so the UI still works
          return [ch.id, generateChannelData(ch, eventMeta, eventIndex)]
        })
      )

      const newStats = new Map(get().statsCache)
      channels.forEach(ch => {
        const data = channelDataMap.get(ch.id)
        if (data) newStats.set(channelKey(eventId, ch.id), computeStats(data, ch, eventId))
      })

      set(s => {
        const loadingEvents = new Set(s.loadingEvents)
        loadingEvents.delete(eventId)
        return {
          loadedEvents: [...s.loadedEvents, { testId, eventId, meta: eventMeta, channels: channelDataMap }],
          statsCache: newStats,
          loadingEvents,
        }
      })
    })()
  },

  unloadEvent(eventId) {
    set(s => ({
      loadedEvents: s.loadedEvents.filter(e => e.eventId !== eventId),
      activeChannels: s.activeChannels.filter(ch => ch.eventId !== eventId),
    }))
  },

  isEventLoaded(eventId) {
    return get().loadedEvents.some(e => e.eventId === eventId)
  },

  // ── Channels ─────────────────────────────────────────────────────────────────
  activeChannels: [],

  toggleChannel(eventId, channelId) {
    const key = channelKey(eventId, channelId)
    const existing = get().activeChannels.find(c => c.key === key)

    if (existing) {
      set(s => ({ activeChannels: s.activeChannels.filter(c => c.key !== key) }))
      return
    }

    // Find color from channel meta
    const event = get().loadedEvents.find(e => e.eventId === eventId)
    const channels = CHANNELS_BY_TEST[event?.testId ?? ''] ?? []
    const meta = channels.find(c => c.id === channelId)
    const usedColors = get().activeChannels.map(c => c.color)
    const color = meta?.color ?? '#58a6ff'

    const newChannel: ActiveChannel = {
      key, eventId, channelId, testId: event?.testId ?? '',
      color: usedColors.includes(color) ? shiftColor(color, get().activeChannels.length) : color,
      visible: true,
    }

    set(s => ({ activeChannels: [...s.activeChannels, newChannel] }))
  },

  isChannelActive(eventId, channelId) {
    return get().activeChannels.some(c => c.key === channelKey(eventId, channelId))
  },

  setChannelVisible(key, visible) {
    set(s => ({
      activeChannels: s.activeChannels.map(c => c.key === key ? { ...c, visible } : c),
    }))
  },

  clearChannels() {
    set({ activeChannels: [] })
  },

  // ── Stats ─────────────────────────────────────────────────────────────────────
  statsCache: new Map<string, ChannelStats>(),

  getStats(key) {
    return get().statsCache.get(key) ?? null
  },

  // ── FFT ───────────────────────────────────────────────────────────────────────
  fftCache: new Map<string, FFTResult>(),
  loadingFFT: new Set<string>(),

  loadFFT(testId, eventId, channelId, window = 'hann') {
    const key = channelKey(eventId, channelId)
    const state = get()
    if (state.fftCache.has(key) || state.loadingFFT.has(key)) return

    set(s => ({ loadingFFT: new Set([...s.loadingFFT, key]) }))

    void (async () => {
      try {
        const r = await fetchFFT(testId, eventId, channelId, window)
        const result: FFTResult = {
          channelKey: key,
          frequencies: Float64Array.from(r.frequencies),
          magnitudes: Float64Array.from(r.magnitudes),
          peakFrequency: r.peak_frequency,
          binResolutionHz: r.bin_resolution_hz,
          sampleRate: r.sample_rate,
          window: r.window,
          unit: r.unit,
        }
        set(s => {
          const fftCache = new Map(s.fftCache)
          fftCache.set(key, result)
          const loadingFFT = new Set(s.loadingFFT)
          loadingFFT.delete(key)
          return { fftCache, loadingFFT }
        })
      } catch {
        // Service unavailable — silently clear loading state; widget shows placeholder
        set(s => {
          const loadingFFT = new Set(s.loadingFFT)
          loadingFFT.delete(key)
          return { loadingFFT }
        })
      }
    })()
  },

  getFFT(key) {
    return get().fftCache.get(key) ?? null
  },

  // ── Markers ───────────────────────────────────────────────────────────────────
  markers: [],

  addMarker(time) {
    const id = `m-${Date.now()}`
    const color = MARKER_COLORS[get().markers.length % MARKER_COLORS.length]
    const label = `M${get().markers.length + 1}`
    set(s => ({ markers: [...s.markers, { id, time, label, color }] }))
  },

  removeMarker(id) {
    set(s => ({ markers: s.markers.filter(m => m.id !== id) }))
  },

  clearMarkers() {
    set({ markers: [] })
  },

  // ── Widgets ───────────────────────────────────────────────────────────────────
  widgets: [],

  addWidget(type) {
    const id = makeWidgetId()
    const titles: Record<WidgetType, string> = {
      waveform: 'Waveform View',
      stats: 'Channel Statistics',
      comparative: 'Comparative View',
      fft: 'FFT Spectrum',
      correlation: 'Cross-Correlation',
    }
    const widget: WidgetConfig = {
      id, type, title: titles[type], poppedOut: false,
      channelKeys: [],
    }

    const currentLayout = get().layout
    const newLayout: DashboardLayout = {
      i: id,
      x: (currentLayout.length * 2) % 12,
      y: Infinity,
      w: type === 'stats' ? 12 : 6,
      h: type === 'stats' ? 5 : 8,
      minW: 3,
      minH: 4,
    }

    set(s => ({
      widgets: [...s.widgets, widget],
      layout: [...s.layout, newLayout],
    }))
  },

  removeWidget(id) {
    set(s => ({
      widgets: s.widgets.filter(w => w.id !== id),
      layout: s.layout.filter(l => l.i !== id),
    }))
  },

  updateWidget(id, patch) {
    set(s => ({
      widgets: s.widgets.map(w => w.id === id ? { ...w, ...patch } : w),
    }))
  },

  assignChannelsToWidget(widgetId, keys) {
    set(s => ({
      widgets: s.widgets.map(w => w.id === widgetId ? { ...w, channelKeys: keys } : w),
    }))
  },

  // ── Layout ────────────────────────────────────────────────────────────────────
  layout: [],
  setLayout(layout) { set({ layout }) },

  // ── Pop-outs ──────────────────────────────────────────────────────────────────
  poppedOutWindows: new Map(),

  popOutWidget(id) {
    const w = window.open(
      `${window.location.origin}/popout/${id}`,
      `widget-${id}`,
      'width=900,height=600,resizable=yes,scrollbars=no'
    )
    if (w) {
      const map = new Map(get().poppedOutWindows)
      map.set(id, w)
      set({ poppedOutWindows: map })
      get().updateWidget(id, { poppedOut: true })
    }
  },

  closePopOut(id) {
    const map = new Map(get().poppedOutWindows)
    map.get(id)?.close()
    map.delete(id)
    set({ poppedOutWindows: map })
    get().updateWidget(id, { poppedOut: false })
  },
}))

// Helper: shift a hex color slightly to differentiate same-sensor channels
function shiftColor(hex: string, offset: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  const shift = (offset * 30) % 60 - 30
  const clamp = (v: number) => Math.min(255, Math.max(0, v))
  return `#${clamp(r + shift).toString(16).padStart(2, '0')}${clamp(g + shift).toString(16).padStart(2, '0')}${clamp(b + shift).toString(16).padStart(2, '0')}`
}

export { channelKey }
