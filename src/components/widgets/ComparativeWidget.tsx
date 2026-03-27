import { useEffect, useRef, useCallback } from 'react'
import uPlot from 'uplot'
import { useWorkspaceStore } from '@/store/workspaceStore'
import { fmtTime } from '@/lib/utils'
import { Layers } from 'lucide-react'

interface ComparativeWidgetProps {
  widgetId: string
  channelKeys?: string[]
  height: number
  width: number
}

/**
 * Overlays the same channel from multiple events on a shared time axis,
 * normalizing each trace to start at t=0 (relative time).
 */
export function ComparativeWidget({ channelKeys, height, width }: ComparativeWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const plotRef = useRef<uPlot | null>(null)

  const loadedEvents = useWorkspaceStore(s => s.loadedEvents)
  const activeChannels = useWorkspaceStore(s => s.activeChannels)

  const displayChannels = (channelKeys && channelKeys.length > 0)
    ? activeChannels.filter(c => channelKeys.includes(c.key))
    : activeChannels

  const visibleChannels = displayChannels.filter(c => c.visible)

  // Group channels by channelId to find cross-event comparisons
  const channelGroups = new Map<string, typeof visibleChannels>()
  for (const ch of visibleChannels) {
    const existing = channelGroups.get(ch.channelId) ?? []
    channelGroups.set(ch.channelId, [...existing, ch])
  }

  function buildData(): uPlot.AlignedData {
    if (visibleChannels.length === 0) {
      return [new Float64Array([0]), new Float64Array([0])]
    }

    // Use first channel's time array as reference x-axis
    const firstCh = visibleChannels[0]
    const firstEvent = loadedEvents.find(e => e.eventId === firstCh.eventId)
    const firstData = firstEvent?.channels.get(firstCh.channelId)
    const times: Float64Array = firstData?.times ?? new Float64Array([0])
    const n = times.length

    const ySeries: Float64Array[] = []
    for (const ch of visibleChannels) {
      const event = loadedEvents.find(e => e.eventId === ch.eventId)
      const data = event?.channels.get(ch.channelId)
      if (!data) {
        ySeries.push(new Float64Array(n).fill(NaN))
      } else if (data.values.length === n) {
        ySeries.push(data.values)
      } else {
        const padded = new Float64Array(n)
        padded.set(data.values.subarray(0, n))
        ySeries.push(padded)
      }
    }
    return [times, ...ySeries]
  }

  const buildOptions = useCallback((w: number, h: number): uPlot.Options => {
    return {
      width: Math.max(w - 2, 100),
      height: Math.max(h - 40, 80),
      cursor: {
        drag: { x: true, y: false, setScale: true },
        sync: { key: 'comparative-group' },
      },
      axes: [
        {
          stroke: '#6e7681',
          grid: { stroke: '#21262d', width: 1 },
          ticks: { stroke: '#21262d' },
          font: '11px system-ui',
          values: (_u, vals) => vals.map(v => fmtTime(v)),
          label: 'Time (relative)',
          labelFont: '11px system-ui',
          labelSize: 18,
        },
        {
          stroke: '#6e7681',
          grid: { stroke: '#21262d', width: 1 },
          ticks: { stroke: '#21262d' },
          font: '11px system-ui',
          size: 56,
        },
      ],
      scales: { x: { time: false } },
      series: [
        { label: 'Time' },
        ...visibleChannels.map((ch, i) => {
          const event = loadedEvents.find(e => e.eventId === ch.eventId)
          const meta = event?.meta.channels.find(c => c.id === ch.channelId)
          const dashPatterns = [[],[4,2],[2,2],[6,2,2,2]]
          return {
            label: `${ch.eventId} — ${meta?.name ?? ch.channelId}`,
            stroke: ch.color,
            width: 1.5,
            dash: dashPatterns[i % dashPatterns.length],
            points: { show: false },
          } satisfies uPlot.Series
        }),
      ],
    }
  }, [visibleChannels, loadedEvents])

  useEffect(() => {
    if (!containerRef.current || width < 10 || height < 10) return

    const data = buildData()
    const opts = buildOptions(width, height)

    plotRef.current?.destroy()
    plotRef.current = null
    containerRef.current.innerHTML = ''

    try {
      plotRef.current = new uPlot(opts, data, containerRef.current)
    } catch (e) {
      console.error('Comparative uPlot error:', e)
    }

    return () => {
      plotRef.current?.destroy()
      plotRef.current = null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleChannels.length, width, height])

  useEffect(() => {
    if (!plotRef.current) return
    try { plotRef.current.setData(buildData()) } catch { /* */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleChannels.map(c => c.key).join(',')])

  if (visibleChannels.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-[#6e7681] gap-2">
        <Layers size={24} className="text-[#30363d]" />
        <p className="text-xs text-center px-4">
          Load multiple events and select the same channel from each to compare overlaid traces
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-[#0d1117] overflow-hidden">
      {/* Legend header */}
      <div className="flex flex-wrap items-center gap-2 px-3 py-1.5 border-b border-[#21262d] bg-[#161b22] shrink-0">
        {visibleChannels.map((ch, i) => {
          const event = loadedEvents.find(e => e.eventId === ch.eventId)
          const meta = event?.meta.channels.find(c => c.id === ch.channelId)
          const dashDesc = ['solid', 'dashed', 'dotted', 'dash-dot'][i % 4]
          return (
            <span
              key={ch.key}
              className="flex items-center gap-1.5 text-[10px] px-1.5 py-0.5 rounded"
              style={{ backgroundColor: ch.color + '22', color: ch.color }}
            >
              <span className="font-mono text-[9px] text-[#6e7681]">[{dashDesc}]</span>
              {ch.eventId}: {meta?.name ?? ch.channelId}
            </span>
          )
        })}
        {channelGroups.size < visibleChannels.length && (
          <span className="text-[10px] text-[#6e7681] ml-2">
            — {loadedEvents.length} events overlaid
          </span>
        )}
      </div>

      <div ref={containerRef} className="flex-1 min-h-0" style={{ background: '#0d1117' }} />
    </div>
  )
}
