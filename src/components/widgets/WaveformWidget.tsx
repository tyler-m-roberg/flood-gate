import { useEffect, useRef, useCallback, useState } from 'react'
import uPlot from 'uplot'
import { useWorkspaceStore } from '@/store/workspaceStore'
import { fmtTime } from '@/lib/utils'
import { MapPin, Trash2, ZoomIn, ZoomOut, RotateCcw, GitBranch } from 'lucide-react'

interface WaveformWidgetProps {
  widgetId: string
}

export function WaveformWidget({ widgetId }: WaveformWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const plotRef = useRef<uPlot | null>(null)
  const isDragging = useRef(false)

  const loadedEvents = useWorkspaceStore(s => s.loadedEvents)
  const widget = useWorkspaceStore(s => s.widgets.find(w => w.id === widgetId))
  const widgetChannels = widget?.channels ?? []
  const multiYAxis = widget?.multiYAxis ?? false
  const updateWidget = useWorkspaceStore(s => s.updateWidget)
  const markers = useWorkspaceStore(s => s.markers)
  const addMarker = useWorkspaceStore(s => s.addMarker)
  const removeMarker = useWorkspaceStore(s => s.removeMarker)

  const visibleChannels = widgetChannels.filter(c => c.visible)

  const [addingMarker, setAddingMarker] = useState(false)
  const [xCursor, setXCursor] = useState<number | null>(null)
  const [resizeTick, setResizeTick] = useState(0)

  // Track container resizes to trigger re-init
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      setResizeTick(t => t + 1)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // ── Build uPlot series data with common time axis for mixed sample rates ────
  function buildData(): uPlot.AlignedData {
    if (visibleChannels.length === 0) {
      return [new Float64Array([0]), new Float64Array([0])]
    }

    // Gather all channel data
    const channelDatas = visibleChannels.map(ch => {
      const event = loadedEvents.find(e => e.eventId === ch.eventId)
      return event?.channels.get(ch.channelId) ?? null
    })

    // Find the channel with the highest sample rate to use as the common time axis
    let bestIdx = 0
    let bestRate = 0
    channelDatas.forEach((d, i) => {
      if (d && d.sampleRate > bestRate) { bestRate = d.sampleRate; bestIdx = i }
    })

    const refData = channelDatas[bestIdx]
    if (!refData || refData.times.length === 0) {
      return [new Float64Array([0]), new Float64Array([0])]
    }

    const times = refData.times
    const ySeries: Float64Array[] = []

    for (let i = 0; i < visibleChannels.length; i++) {
      const data = channelDatas[i]
      if (!data || data.values.length === 0) {
        ySeries.push(new Float64Array(times.length).fill(0))
      } else if (data.times.length === times.length && data.sampleRate === bestRate) {
        // Same sample rate — use directly
        ySeries.push(data.values)
      } else {
        // Different sample rate — linearly interpolate onto common time axis
        const interpolated = new Float64Array(times.length)
        const srcTimes = data.times
        const srcVals = data.values
        let j = 0
        for (let k = 0; k < times.length; k++) {
          const t = times[k]
          while (j < srcTimes.length - 2 && srcTimes[j + 1] < t) j++
          if (j >= srcTimes.length - 1) {
            interpolated[k] = srcVals[srcVals.length - 1]
          } else {
            const t0 = srcTimes[j], t1 = srcTimes[j + 1]
            const frac = t1 !== t0 ? (t - t0) / (t1 - t0) : 0
            interpolated[k] = srcVals[j] + frac * (srcVals[j + 1] - srcVals[j])
          }
        }
        ySeries.push(interpolated)
      }
    }

    return [times, ...ySeries]
  }

  // ── uPlot options ────────────────────────────────────────────────────────────
  const buildOptions = useCallback(
    (w: number, h: number): uPlot.Options => {
      const plotH = Math.max(h, 80)

      const series: uPlot.Series[] = [
        { label: 'Time' },
        ...visibleChannels.map((ch, i) => {
          const event = loadedEvents.find(e => e.eventId === ch.eventId)
          const channelMeta = event?.meta.channels.find(c => c.id === ch.channelId)
          return {
            label: channelMeta ? `${ch.eventId}:${channelMeta.name}` : ch.key,
            stroke: ch.color,
            width: 1.5,
            points: { show: false },
            ...(multiYAxis ? { scale: `y${i}` } : {}),
          } satisfies uPlot.Series
        }),
      ]

      const scales: uPlot.Scales = { x: { time: false } }
      let yAxes: uPlot.Axis[]

      if (multiYAxis) {
        // Independent Y-axis per channel
        visibleChannels.forEach((_ch, i) => {
          scales[`y${i}`] = { auto: true }
        })
        yAxes = visibleChannels.map((ch, i) => {
          const event = loadedEvents.find(e => e.eventId === ch.eventId)
          const channelMeta = event?.meta.channels.find(c => c.id === ch.channelId)
          const unit = channelMeta?.unit ?? ''
          return {
            scale: `y${i}`,
            side: i % 2 === 0 ? 3 : 1,
            stroke: ch.color,
            grid: { show: i === 0, stroke: '#21262d', width: 1 },
            ticks: { stroke: '#21262d', width: 1 },
            font: '11px system-ui',
            labelFont: '11px system-ui',
            label: unit,
            size: 56,
          } satisfies uPlot.Axis
        })
      } else {
        // Single shared Y-axis
        yAxes = [{
          stroke: '#6e7681',
          grid: { stroke: '#21262d', width: 1 },
          ticks: { stroke: '#21262d', width: 1 },
          font: '11px system-ui',
          labelFont: '11px system-ui',
          size: 56,
        }]
      }

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
          ...yAxes,
        ],
        scales,
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
    [visibleChannels, loadedEvents, markers, addingMarker, multiYAxis]
  )

  // ── Init / re-init uPlot ─────────────────────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    // Destroy old plot and clear container FIRST so measurement is accurate
    if (plotRef.current) {
      plotRef.current.destroy()
      plotRef.current = null
    }
    el.innerHTML = ''

    // Now measure the empty container
    const w = Math.floor(el.clientWidth)
    const h = Math.floor(el.clientHeight)
    if (w < 10 || h < 10) return

    const data = buildData()
    const opts = buildOptions(w, h)

    try {
      plotRef.current = new uPlot(opts, data, el)
    } catch (e) {
      console.error('uPlot init error:', e)
    }

    return () => {
      plotRef.current?.destroy()
      plotRef.current = null
    }
  // Rebuild on any relevant change (including color/axis mode changes which require new series opts)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleChannels.length, visibleChannels.map(c => c.color).join(','), markers.length, resizeTick, addingMarker, multiYAxis])

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
    const u = plotRef.current
    if (!u || !u.data[0] || (u.data[0] as Float64Array).length === 0) return
    const times = u.data[0] as Float64Array
    u.setScale('x', { min: times[0], max: times[times.length - 1] })
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
            title="Zoom in 2×"
            onClick={() => {
              const u = plotRef.current
              if (!u) return
              const xMin = u.scales.x.min ?? 0
              const xMax = u.scales.x.max ?? 1
              const mid = (xMin + xMax) / 2
              const quarter = (xMax - xMin) / 4
              u.setScale('x', { min: mid - quarter, max: mid + quarter })
            }}
          />
          <ToolBtn
            icon={<ZoomOut size={12} />}
            title="Zoom out 2×"
            onClick={() => {
              const u = plotRef.current
              if (!u) return
              const xMin = u.scales.x.min ?? 0
              const xMax = u.scales.x.max ?? 1
              const mid = (xMin + xMax) / 2
              const half = (xMax - xMin)
              u.setScale('x', { min: mid - half, max: mid + half })
            }}
          />
          <ToolBtn
            icon={<RotateCcw size={12} />}
            title="Reset view"
            onClick={resetZoom}
          />
          <ToolBtn
            icon={<GitBranch size={12} />}
            title={multiYAxis ? 'Switch to shared Y-axis' : 'Switch to independent Y-axes'}
            onClick={() => updateWidget(widgetId, { multiYAxis: !multiYAxis })}
            active={multiYAxis}
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
        className={`flex-1 min-h-0 overflow-hidden ${addingMarker ? 'cursor-crosshair' : 'cursor-default'}`}
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
