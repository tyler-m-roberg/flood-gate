import { useEffect, useRef, useCallback, useState } from 'react'
import uPlot from 'uplot'
import { useWorkspaceStore } from '@/store/workspaceStore'
import type { WindowFunction } from '@/api/computeClient'

interface FFTWidgetProps {
  channelKeys?: string[]
  height: number
  width: number
}

const WINDOW_OPTIONS: WindowFunction[] = ['hann', 'hamming', 'blackman', 'none']

function fmtHz(hz: number): string {
  if (hz >= 1_000_000) return `${(hz / 1_000_000).toFixed(2)} MHz`
  if (hz >= 1_000) return `${(hz / 1_000).toFixed(1)} kHz`
  return `${hz.toFixed(0)} Hz`
}

export function FFTWidget({ channelKeys, height, width }: FFTWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const plotRef = useRef<uPlot | null>(null)

  const loadedEvents = useWorkspaceStore(s => s.loadedEvents)
  const activeChannels = useWorkspaceStore(s => s.activeChannels)
  const fftCache = useWorkspaceStore(s => s.fftCache)
  const loadingFFT = useWorkspaceStore(s => s.loadingFFT)
  const loadFFT = useWorkspaceStore(s => s.loadFFT)
  const getFFT = useWorkspaceStore(s => s.getFFT)

  const [selectedWindow, setSelectedWindow] = useState<WindowFunction>('hann')

  // Which channels to display
  const displayChannels = (channelKeys && channelKeys.length > 0)
    ? activeChannels.filter(c => channelKeys.includes(c.key))
    : activeChannels

  const visibleChannels = displayChannels.filter(c => c.visible)

  // Trigger FFT loads for any visible channel not yet cached
  useEffect(() => {
    for (const ch of visibleChannels) {
      const event = loadedEvents.find(e => e.eventId === ch.eventId)
      if (!event) continue
      loadFFT(ch.testId, ch.eventId, ch.channelId, selectedWindow)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleChannels.map(c => c.key).join(','), selectedWindow, loadedEvents.length])

  // Build uPlot AlignedData from FFT results
  // All channels share the same frequency axis from the first loaded result.
  function buildData(): uPlot.AlignedData {
    const loaded = visibleChannels
      .map(ch => getFFT(ch.key))
      .filter(Boolean) as ReturnType<typeof getFFT>[]

    if (loaded.length === 0 || !loaded[0]) {
      return [new Float64Array([0]), new Float64Array([0])]
    }

    const freqs = loaded[0].frequencies
    const ySeries = loaded.map(r => r!.magnitudes)
    return [freqs, ...ySeries]
  }

  const buildOptions = useCallback(
    (w: number, h: number): uPlot.Options => {
      const plotH = Math.max(h - 8, 80)

      const loadedResults = visibleChannels
        .map(ch => ({ ch, fft: getFFT(ch.key) }))
        .filter(({ fft }) => fft != null)

      const series: uPlot.Series[] = [
        { label: 'Frequency' },
        ...loadedResults.map(({ ch, fft }) => {
          const event = loadedEvents.find(e => e.eventId === ch.eventId)
          const meta = event?.meta.channels.find(c => c.id === ch.channelId)
          const label = meta ? `${ch.eventId}:${meta.name}` : ch.key
          const unit = fft?.unit ?? ''
          return {
            label: `${label} [${unit}]`,
            stroke: ch.color,
            width: 1.5,
            points: { show: false },
          } satisfies uPlot.Series
        }),
      ]

      return {
        width: Math.max(w - 2, 100),
        height: Math.max(plotH, 80),
        cursor: {
          drag: { x: true, y: false, setScale: true },
        },
        select: { show: true, left: 0, top: 0, width: 0, height: 0 },
        axes: [
          {
            stroke: '#6e7681',
            grid: { stroke: '#21262d', width: 1 },
            ticks: { stroke: '#21262d', width: 1 },
            font: '11px system-ui',
            labelFont: '11px system-ui',
            label: 'Frequency',
            values: (_u: uPlot, vals: number[]) => vals.map((v: number) => fmtHz(v)),
          },
          {
            stroke: '#6e7681',
            grid: { stroke: '#21262d', width: 1 },
            ticks: { stroke: '#21262d', width: 1 },
            font: '11px system-ui',
            labelFont: '11px system-ui',
            label: 'Magnitude',
            size: 60,
          },
        ],
        scales: {
          x: { time: false },
        },
        series,
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visibleChannels, fftCache, loadedEvents]
  )

  // Init / re-init uPlot whenever composition or dimensions change
  useEffect(() => {
    if (!containerRef.current || width < 10 || height < 10) return

    const loadedCount = visibleChannels.filter(ch => getFFT(ch.key) != null).length
    if (loadedCount === 0) return

    const data = buildData()
    const opts = buildOptions(width, height)

    plotRef.current?.destroy()
    plotRef.current = null

    const el = containerRef.current
    el.innerHTML = ''

    try {
      plotRef.current = new uPlot(opts, data, el)
    } catch (e) {
      console.error('uPlot (FFT) init error:', e)
    }

    return () => {
      plotRef.current?.destroy()
      plotRef.current = null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleChannels.map(c => c.key).join(','), fftCache.size, width, height])

  // Update data without full rebuild when new FFT results arrive
  useEffect(() => {
    if (!plotRef.current) return
    const loadedCount = visibleChannels.filter(ch => getFFT(ch.key) != null).length
    if (loadedCount === 0) return
    try {
      plotRef.current.setData(buildData())
    } catch {
      // rebuild on error
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fftCache.size])

  const anyLoading = visibleChannels.some(ch => loadingFFT.has(ch.key))
  const loadedResults = visibleChannels.filter(ch => getFFT(ch.key) != null)

  // When the window changes, bust the cache for visible channels
  function handleWindowChange(w: WindowFunction) {
    setSelectedWindow(w)
    // Clear existing FFT entries for visible channels so loadFFT re-fetches
    const { fftCache: cache, ...rest } = useWorkspaceStore.getState()
    const next = new Map(cache)
    visibleChannels.forEach(ch => next.delete(ch.key))
    useWorkspaceStore.setState({ ...rest, fftCache: next, loadingFFT: new Set() })
  }

  return (
    <div className="flex flex-col h-full bg-[#0d1117] rounded overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[#21262d] bg-[#161b22] shrink-0">
        {/* Legend chips */}
        <div className="flex flex-wrap gap-1.5 flex-1 min-w-0">
          {visibleChannels.length === 0 ? (
            <span className="text-xs text-[#6e7681]">No channels selected</span>
          ) : (
            visibleChannels.map(ch => {
              const event = loadedEvents.find(e => e.eventId === ch.eventId)
              const meta = event?.meta.channels.find(c => c.id === ch.channelId)
              const fft = getFFT(ch.key)
              const isLoading = loadingFFT.has(ch.key)
              return (
                <span
                  key={ch.key}
                  className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded"
                  style={{ backgroundColor: ch.color + '22', color: ch.color }}
                >
                  <span className="w-2 h-0.5 inline-block rounded" style={{ backgroundColor: ch.color }} />
                  {ch.eventId}:{meta?.name ?? ch.channelId}
                  {isLoading && <span className="opacity-60 animate-pulse">…</span>}
                  {fft && (
                    <span className="opacity-70 font-mono">
                      {fmtHz(fft.peakFrequency)}
                    </span>
                  )}
                </span>
              )
            })
          )}
        </div>

        {/* Window selector */}
        <div className="flex items-center gap-1 shrink-0">
          <span className="text-[10px] text-[#6e7681]">Window:</span>
          <select
            value={selectedWindow}
            onChange={e => handleWindowChange(e.target.value as WindowFunction)}
            className="text-[10px] bg-[#1c2128] border border-[#30363d] text-[#8b949e] rounded px-1 py-0.5 focus:outline-none focus:border-[#58a6ff]"
          >
            {WINDOW_OPTIONS.map(w => (
              <option key={w} value={w}>{w}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Plot area */}
      <div className="flex-1 min-h-0 relative">
        <div
          ref={containerRef}
          className="w-full h-full"
          style={{ background: '#0d1117' }}
        />

        {/* Loading overlay */}
        {anyLoading && loadedResults.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#0d1117]">
            <div className="flex flex-col items-center gap-2 text-[#6e7681]">
              <div className="w-5 h-5 border-2 border-[#30363d] border-t-[#d29922] rounded-full animate-spin" />
              <span className="text-xs">Computing FFT…</span>
            </div>
          </div>
        )}

        {/* Empty state */}
        {visibleChannels.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <p className="text-xs text-[#6e7681]">Select channels from the panel to analyse</p>
          </div>
        )}

        {/* No compute service overlay */}
        {visibleChannels.length > 0 && !anyLoading && loadedResults.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <p className="text-xs text-[#6e7681]">
              Compute service unavailable — start the full stack to enable FFT analysis
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
