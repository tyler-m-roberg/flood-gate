import { create } from 'zustand'
import type {
  LoadedEvent, WidgetChannel, Marker,
  WidgetConfig, WidgetType, DashboardLayout,
  ChannelStats, FFTResult, ChannelMeta,
} from '@/types'
import {
  MOCK_EVENTS, generateChannelData, computeStats, CHANNELS_BY_TEST,
} from '@/data/mockData'
import { fetchWaveform, buildTimeAxis } from '@/api/waveformClient'
import { fetchFFT, type WindowFunction } from '@/api/computeClient'
import { fetchEvents, fetchChannels } from '@/api/metadataClient'

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

  // Per-widget channel selection
  selectedWidgetId: string | null
  setSelectedWidget(id: string | null): void
  toggleChannel(eventId: string, channelId: string): void
  setChannelVisibleForWidget(widgetId: string, key: string, visible: boolean): void
  setChannelColor(widgetId: string, key: string, color: string): void

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

  // Dashboard layout
  layout: DashboardLayout[]
  setLayout(layout: DashboardLayout[]): void

  // Refresh
  refreshWorkspace(): void

  // Save/load dashboard
  saveDashboard(testId: string): void
  loadDashboard(testId: string): boolean

  // Dashboard mode
  dashboardMode: 'analysis' | 'realtime'
  setDashboardMode(mode: 'analysis' | 'realtime'): void

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

    // Mark loading immediately so callers can show a spinner
    set(s => ({ loadingEvents: new Set([...s.loadingEvents, eventId]) }))

    void (async () => {
      // Try to get event metadata from mock data first, then API
      let eventMeta = (MOCK_EVENTS[testId] ?? []).find(e => e.id === eventId)
      let channels: ChannelMeta[] = CHANNELS_BY_TEST[testId] ?? []

      if (!eventMeta) {
        // Not in mock data — fetch from API
        try {
          const apiEvents = await fetchEvents(testId)
          eventMeta = apiEvents.items.find(e => e.id === eventId)
        } catch {
          // API unavailable
        }
      }

      if (!eventMeta) {
        // Still not found — remove from loading and bail
        set(s => {
          const loadingEvents = new Set(s.loadingEvents)
          loadingEvents.delete(eventId)
          return { loadingEvents }
        })
        return
      }

      // Use channels from event metadata if available, otherwise from mock data / API
      if (eventMeta.channels.length > 0) {
        channels = eventMeta.channels
      } else if (channels.length === 0) {
        try {
          channels = await fetchChannels(testId)
        } catch {
          // API unavailable
        }
      }

      const events = MOCK_EVENTS[testId] ?? []
      const eventIndex = events.findIndex(e => e.id === eventId)

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
          // API unavailable — generate locally if mock data exists
          if (eventIndex >= 0) {
            return [ch.id, generateChannelData(ch, eventMeta!, eventIndex)]
          }
          // No fallback available — create empty channel data
          return [ch.id, {
            channelId: ch.id,
            eventId,
            testId,
            times: new Float64Array(0),
            values: new Float64Array(0),
            sampleRate: eventMeta!.sampleRate || 400000,
          }]
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
          loadedEvents: [...s.loadedEvents, { testId, eventId, meta: eventMeta!, channels: channelDataMap }],
          statsCache: newStats,
          loadingEvents,
        }
      })
    })()
  },

  unloadEvent(eventId) {
    set(s => ({
      loadedEvents: s.loadedEvents.filter(e => e.eventId !== eventId),
      widgets: s.widgets.map(w => ({
        ...w,
        channels: w.channels.filter(ch => ch.eventId !== eventId),
      })),
    }))
  },

  isEventLoaded(eventId) {
    return get().loadedEvents.some(e => e.eventId === eventId)
  },

  // ── Per-widget channel selection ──────────────────────────────────────────────
  selectedWidgetId: null,
  setSelectedWidget(id) { set({ selectedWidgetId: id }) },

  toggleChannel(eventId, channelId) {
    const state = get()
    const widgetId = state.selectedWidgetId
    if (!widgetId) return // no-op when no widget is selected

    const widget = state.widgets.find(w => w.id === widgetId)
    if (!widget) return

    const key = channelKey(eventId, channelId)
    const existing = widget.channels.find(c => c.key === key)

    if (existing) {
      // Remove channel from this widget
      set(s => ({
        widgets: s.widgets.map(w =>
          w.id === widgetId
            ? { ...w, channels: w.channels.filter(c => c.key !== key) }
            : w
        ),
      }))
    } else {
      // Add channel to this widget
      const event = state.loadedEvents.find(e => e.eventId === eventId)
      const channelsMeta = event?.meta.channels ?? CHANNELS_BY_TEST[event?.testId ?? ''] ?? []
      const meta = channelsMeta.find(c => c.id === channelId)
      const usedColors = widget.channels.map(c => c.color)
      const color = meta?.color ?? '#58a6ff'

      const newChannel: WidgetChannel = {
        key, eventId, channelId, testId: event?.testId ?? '',
        color: usedColors.includes(color) ? shiftColor(color, widget.channels.length) : color,
        visible: true,
      }

      set(s => ({
        widgets: s.widgets.map(w =>
          w.id === widgetId
            ? { ...w, channels: [...w.channels, newChannel] }
            : w
        ),
      }))
    }
  },

  setChannelVisibleForWidget(widgetId, key, visible) {
    set(s => ({
      widgets: s.widgets.map(w =>
        w.id === widgetId
          ? { ...w, channels: w.channels.map(c => c.key === key ? { ...c, visible } : c) }
          : w
      ),
    }))
  },

  setChannelColor(widgetId, key, color) {
    set(s => ({
      widgets: s.widgets.map(w =>
        w.id === widgetId
          ? { ...w, channels: w.channels.map(c => c.key === key ? { ...c, color } : c) }
          : w
      ),
    }))
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
      fft: 'FFT Spectrum',
      correlation: 'Cross-Correlation',
    }
    const widget: WidgetConfig = {
      id, type, title: titles[type] ?? type, poppedOut: false,
      channels: [],
      locked: false,
    }

    const newLayout: DashboardLayout = {
      i: id,
      x: 0,
      y: Infinity,
      w: 12,
      h: type === 'stats' ? 5 : 8,
      minW: 2,
      maxW: 12,
      minH: 3,
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
      selectedWidgetId: s.selectedWidgetId === id ? null : s.selectedWidgetId,
    }))
  },

  updateWidget(id, patch) {
    set(s => ({
      widgets: s.widgets.map(w => w.id === id ? { ...w, ...patch } : w),
    }))
  },

  // ── Layout ────────────────────────────────────────────────────────────────────
  layout: [],
  setLayout(layout) { set({ layout }) },

  // ── Refresh ───────────────────────────────────────────────────────────────────
  refreshWorkspace() {
    const state = get()
    const events = [...state.loadedEvents]
    // Clear all loaded events and re-fetch them
    set({ loadedEvents: [], statsCache: new Map(), fftCache: new Map() })
    events.forEach(e => {
      get().loadEvent(e.testId, e.eventId)
    })
  },

  // ── Save/Load dashboard ───────────────────────────────────────────────────────
  saveDashboard(testId) {
    const state = get()
    const config = {
      widgets: state.widgets,
      layout: state.layout,
    }
    localStorage.setItem(`floodgate-dashboard-${testId}`, JSON.stringify(config))
  },

  loadDashboard(testId) {
    const raw = localStorage.getItem(`floodgate-dashboard-${testId}`)
    if (!raw) return false
    try {
      const config = JSON.parse(raw)
      if (config.widgets && config.layout) {
        // Migration: old format used channelKeys instead of channels
        const widgets = config.widgets.map((w: WidgetConfig & { channelKeys?: string[] }) => ({
          ...w,
          channels: w.channels ?? [],
        }))
        const layout = config.layout.map((l: DashboardLayout) => ({
          ...l,
          maxW: l.maxW ?? 12,
        }))
        set({ widgets, layout })
        return true
      }
    } catch { /* ignore invalid data */ }
    return false
  },

  // ── Pop-outs ──────────────────────────────────────────────────────────────────
  // ── Dashboard mode ────────────────────────────────────────────────────────────
  dashboardMode: 'analysis',
  setDashboardMode(mode) { set({ dashboardMode: mode }) },

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
