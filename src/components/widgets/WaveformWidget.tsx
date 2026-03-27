import { useEffect, useRef, useCallback, useState } from 'react'
import uPlot from 'uplot'
import { useWorkspaceStore } from '@/store/workspaceStore'
import { fmtTime } from '@/lib/utils'
import { MapPin, Trash2, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react'

interface WaveformWidgetProps {
  widgetId?: string
  channelKeys?: string[]
  height: number
  width: number
}

export function WaveformWidget({ channelKeys, height, width }: WaveformWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const plotRef = useRef<uPlot | null>(null)
  const isDragging = useRef(false)

  const loadedEvents = useWorkspaceStore(s => s.loadedEvents)
  const activeChannels = useWorkspaceStore(s => s.activeChannels)
  const markers = useWorkspaceStore(s => s.markers)
  const addMarker = useWorkspaceStore(s => s.addMarker)
  const removeMarker = useWorkspaceStore(s => s.removeMarker)

  // Which channels to display — if widgetId has explicit channelKeys use those,
  // otherwise fall back to ALL active channels
  const displayChannels = (channelKeys && channelKeys.length > 0)
    ? activeChannels.filter(c => channelKeys.includes(c.key))
    : activeChannels

  const visibleChannels = displayChannels.filter(c => c.visible)

  const [addingMarker, setAddingMarker] = useState(false)
  const [xCursor, setXCursor] = useState<number | null>(null)

  // ── Build uPlot series data ──────────────────────────────────────────────────
  function buildData(): uPlot.AlignedData {
    if (visibleChannels.length === 0) {
      return [new Float64Array([0]), new Float64Array([0])]
    }

    const firstCh = visibleChannels[0]
    const firstEvent = loadedEvents.find(e => e.eventId === firstCh.eventId)
    const firstData = firstEvent?.channels.get(firstCh.channelId)
    if (!firstData) return [new Float64Array([0]), new Float64Array([0])]

    const times = firstData.times
    const ySeries: Float64Array[] = []

    for (const ch of visibleChannels) {
      const event = loadedEvents.find(e => e.eventId === ch.eventId)
      const data = event?.channels.get(ch.channelId)
      ySeries.push(data?.values ?? new Float64Array(times.length).fill(0))
    }

    return [times, ...ySeries]
  }

  // ── uPlot options ────────────────────────────────────────────────────────────
  const buildOptions = useCallback(
    (w: number, h: number): uPlot.Options => {
      const plotH = Math.max(h - 40, 80) // reserve space for marker bar

      const series: uPlot.Series[] = [
        { label: 'Time' },
        ...visibleChannels.map(ch => {
          const event = loadedEvents.find(e => e.eventId === ch.eventId)
          const channelMeta = event?.meta.channels.find(c => c.id === ch.channelId)
          return {
            label: channelMeta ? `${ch.eventId}:${channelMeta.name}` : ch.key,
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
          sync: { key: 'waveform-group' },
        },
        select: { show: true, left: 0, top: 0, width: 0, height: 0 },
        axes: [
          {
            stroke: '#6e7681',
            grid: { stroke: '#21262d', width: 1 },
            ticks: { stroke: '#21262d', width: 1 },
            font: '11px system-ui',
            labelFont: '11px system-ui',
            values: (_u: uPlot, vals: number[]) => vals.map((v: number) => fmtTime(v)),
          },
          {
            stroke: '#6e7681',
            grid: { stroke: '#21262d', width: 1 },
            ticks: { stroke: '#21262d', width: 1 },
            font: '11px system-ui',
            labelFont: '11px system-ui',
            size: 56,
          },
        ],
        scales: {
          x: { time: false },
        },
        series,
        plugins: [markerPlugin(markers, addMarker, addingMarker)],
        hooks: {
          setCursor: [(u: uPlot) => {
            const x = u.posToVal(u.cursor.left ?? 0, 'x')
            setXCursor(isFinite(x) ? x : null)
          }],
        },
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visibleChannels, loadedEvents, markers, addingMarker]
  )

  // ── Init / re-init uPlot ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || width < 10 || height < 10) return

    const data = buildData()
    const opts = buildOptions(width, height)

    if (plotRef.current) {
      plotRef.current.destroy()
      plotRef.current = null
    }

    const el = containerRef.current
    el.innerHTML = ''

    try {
      plotRef.current = new uPlot(opts, data, el)
    } catch (e) {
      console.error('uPlot init error:', e)
    }

    return () => {
      plotRef.current?.destroy()
      plotRef.current = null
    }
  // Rebuild on any relevant change
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleChannels.length, markers.length, width, height, addingMarker])

  // Update data without full rebuild when series composition doesn't change
  useEffect(() => {
    if (!plotRef.current) return
    try {
      plotRef.current.setData(buildData())
    } catch {
      // rebuild on error
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleChannels.map(c => c.key).join(',')])

  function resetZoom() {
    plotRef.current?.setScale('x', { min: undefined as unknown as number, max: undefined as unknown as number })
    plotRef.current?.redraw()
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
              return (
                <span
                  key={ch.key}
                  className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded"
                  style={{ backgroundColor: ch.color + '22', color: ch.color }}
                >
                  <span className="w-2 h-0.5 inline-block rounded" style={{ backgroundColor: ch.color }} />
                  {ch.eventId}:{meta?.name ?? ch.channelId}
                </span>
              )
            })
          )}
        </div>

        {/* Cursor time */}
        {xCursor !== null && (
          <span className="text-[10px] font-mono text-[#6e7681] shrink-0">
            t = {fmtTime(xCursor)}
          </span>
        )}

        {/* Toolbar buttons */}
        <div className="flex items-center gap-1 shrink-0">
          <ToolBtn
            icon={<ZoomIn size={12} />}
            title="Scroll to zoom, drag to pan"
            onClick={() => {}}
          />
          <ToolBtn
            icon={<ZoomOut size={12} />}
            title="Reset zoom"
            onClick={resetZoom}
          />
          <ToolBtn
            icon={<RotateCcw size={12} />}
            title="Reset view"
            onClick={resetZoom}
          />
          <ToolBtn
            icon={<MapPin size={12} />}
            title="Add marker (click on plot)"
            onClick={() => setAddingMarker(p => !p)}
            active={addingMarker}
          />
        </div>
      </div>

      {/* Marker bar */}
      {markers.length > 0 && (
        <div className="flex items-center gap-2 px-3 py-1 border-b border-[#21262d] bg-[#161b22] overflow-x-auto shrink-0">
          {markers.map((m, i) => {
            const prev = markers[i - 1]
            const delta = prev ? m.time - prev.time : null
            return (
              <div key={m.id} className="flex items-center gap-1 shrink-0">
                {delta !== null && (
                  <span className="text-[10px] text-[#6e7681] font-mono">
                    Δ{fmtTime(delta)}
                  </span>
                )}
                <div
                  className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border"
                  style={{ borderColor: m.color + '66', color: m.color, backgroundColor: m.color + '11' }}
                >
                  <MapPin size={9} />
                  <span className="font-mono">{m.label}: {fmtTime(m.time)}</span>
                  <button onClick={() => removeMarker(m.id)} className="opacity-60 hover:opacity-100 ml-0.5">
                    <Trash2 size={9} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Plot container */}
      <div
        ref={containerRef}
        className={`flex-1 min-h-0 ${addingMarker ? 'cursor-crosshair' : 'cursor-default'}`}
        style={{ background: '#0d1117' }}
        onMouseDown={() => { isDragging.current = false }}
        onMouseMove={() => { isDragging.current = true }}
        onMouseUp={e => {
          if (isDragging.current) return
          if (!addingMarker || !plotRef.current) return
          const rect = containerRef.current!.getBoundingClientRect()
          const xPx = e.clientX - rect.left
          const time = plotRef.current.posToVal(xPx, 'x')
          if (isFinite(time)) {
            addMarker(time)
            setAddingMarker(false)
          }
        }}
      />

      {visibleChannels.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <p className="text-xs text-[#6e7681]">Select channels from the panel to plot</p>
        </div>
      )}
    </div>
  )
}

// ── Marker plugin for uPlot ────────────────────────────────────────────────────
function markerPlugin(
  markers: Array<{ id: string; time: number; label: string; color: string }>,
  _addMarker: (t: number) => void,
  _addingMarker: boolean
): uPlot.Plugin {
  return {
    hooks: {
      draw: [u => {
        const ctx = u.ctx
        const { top, height } = u.bbox
        ctx.save()
        for (const m of markers) {
          const xPx = Math.round(u.valToPos(m.time, 'x', true))
          if (xPx < u.bbox.left || xPx > u.bbox.left + u.bbox.width) continue

          // Vertical line
          ctx.strokeStyle = m.color
          ctx.lineWidth = 1.5
          ctx.setLineDash([4, 3])
          ctx.beginPath()
          ctx.moveTo(xPx, top)
          ctx.lineTo(xPx, top + height)
          ctx.stroke()
          ctx.setLineDash([])

          // Label
          ctx.fillStyle = m.color
          ctx.font = 'bold 10px system-ui'
          ctx.textAlign = 'center'
          ctx.fillText(m.label, xPx, top + 12)
        }
        ctx.restore()
      }],
    },
  }
}

function ToolBtn({
  icon, title, onClick, active,
}: { icon: React.ReactNode; title: string; onClick(): void; active?: boolean }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`p-1 rounded transition-colors ${
        active
          ? 'bg-[#58a6ff33] text-[#58a6ff]'
          : 'text-[#6e7681] hover:text-[#e6edf3] hover:bg-[#1c2128]'
      }`}
    >
      {icon}
    </button>
  )
}
