import { useWorkspaceStore } from '@/store/workspaceStore'
import { fmtNumber, fmtTime } from '@/lib/utils'
import { BarChart3, ArrowDown, ArrowUp, TrendingUp, Activity } from 'lucide-react'
import type { ChannelStats } from '@/types'

interface StatsWidgetProps {
  widgetId: string
}

export function StatsWidget({ widgetId }: StatsWidgetProps) {
  const widgetChannels = useWorkspaceStore(s => s.widgets.find(w => w.id === widgetId)?.channels ?? [])
  const getStats = useWorkspaceStore(s => s.getStats)

  const rows: Array<{ stats: ChannelStats; color: string }> = []
  for (const ch of widgetChannels) {
    const stats = getStats(ch.key)
    if (stats) rows.push({ stats, color: ch.color })
  }

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-[#6e7681] gap-2">
        <BarChart3 size={24} className="text-[#30363d]" />
        <p className="text-xs">Select channels to view statistics</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-hidden bg-[#0d1117]">
      <div className="overflow-x-auto overflow-y-auto flex-1">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="border-b border-[#30363d] bg-[#161b22] sticky top-0 z-10">
              <Th>Channel</Th>
              <Th>Event</Th>
              <Th right>Min</Th>
              <Th right>Max</Th>
              <Th right>Mean</Th>
              <Th right>RMS</Th>
              <Th right>Std Dev</Th>
              <Th right>Peak</Th>
              <Th right>Peak Time</Th>
              <Th right>Rise Time</Th>
              <Th right>Fall Time</Th>
              <Th right>Duration</Th>
              <Th right>Samples</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ stats, color }, i) => (
              <StatsRow
                key={stats.channelKey}
                stats={stats}
                color={color}
                isEven={i % 2 === 0}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* Summary footer */}
      {rows.length > 1 && (
        <div className="border-t border-[#30363d] px-3 py-2 bg-[#161b22] flex items-center gap-4 text-[10px] text-[#6e7681]">
          <span className="flex items-center gap-1">
            <Activity size={10} />
            {rows.length} channels
          </span>
          <span className="flex items-center gap-1">
            <ArrowDown size={10} className="text-[#58a6ff]" />
            Global min: {fmtNumber(Math.min(...rows.map(r => r.stats.min)), 4)} {rows[0].stats.unit}
          </span>
          <span className="flex items-center gap-1">
            <ArrowUp size={10} className="text-[#3fb950]" />
            Global max: {fmtNumber(Math.max(...rows.map(r => r.stats.max)), 4)} {rows[0].stats.unit}
          </span>
        </div>
      )}
    </div>
  )
}

function StatsRow({ stats, color, isEven }: { stats: ChannelStats; color: string; isEven: boolean }) {
  return (
    <tr className={`border-b border-[#21262d] hover:bg-[#1c2128] transition-colors ${isEven ? 'bg-[#0d1117]' : 'bg-[#161b22]'}`}>
      {/* Channel name with color dot */}
      <td className="px-3 py-2 whitespace-nowrap">
        <div className="flex items-center gap-2">
          <div
            className="w-2 h-2 rounded-full shrink-0"
            style={{ backgroundColor: color }}
          />
          <span className="font-medium text-[#e6edf3]">{stats.channelName}</span>
          <span className="text-[#6e7681]">({stats.unit})</span>
        </div>
      </td>
      <td className="px-3 py-2 font-mono text-[#6e7681] whitespace-nowrap">{stats.eventId}</td>

      {/* Numeric stats */}
      <NumCell value={stats.min} color="#58a6ff" />
      <NumCell value={stats.max} color="#3fb950" />
      <NumCell value={stats.mean} />
      <NumCell value={stats.rms} color="#d29922" />
      <NumCell value={stats.stdDev} />
      <NumCell value={stats.peak} color="#f85149" />
      <td className="px-3 py-2 text-right font-mono text-[#8b949e] whitespace-nowrap">
        {fmtTime(stats.peakTime)}
      </td>

      {/* Rise / fall times */}
      <td className="px-3 py-2 text-right font-mono whitespace-nowrap">
        {stats.riseTime !== null ? (
          <span className="flex items-center justify-end gap-1 text-[#bc8cff]">
            <TrendingUp size={10} />
            {fmtTime(stats.riseTime)}
          </span>
        ) : (
          <span className="text-[#6e7681]">—</span>
        )}
      </td>
      <td className="px-3 py-2 text-right font-mono whitespace-nowrap">
        {stats.fallTime !== null ? (
          <span className="text-[#bc8cff]">{fmtTime(stats.fallTime)}</span>
        ) : (
          <span className="text-[#6e7681]">—</span>
        )}
      </td>

      <td className="px-3 py-2 text-right font-mono text-[#8b949e] whitespace-nowrap">
        {fmtTime(stats.duration)}
      </td>
      <td className="px-3 py-2 text-right font-mono text-[#6e7681] whitespace-nowrap">
        {stats.sampleCount.toLocaleString()}
      </td>
    </tr>
  )
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th className={`px-3 py-2 text-[10px] font-semibold text-[#6e7681] uppercase tracking-wider whitespace-nowrap ${right ? 'text-right' : 'text-left'}`}>
      {children}
    </th>
  )
}

function NumCell({ value, color }: { value: number; color?: string }) {
  return (
    <td className="px-3 py-2 text-right font-mono whitespace-nowrap" style={{ color: color ?? '#e6edf3' }}>
      {fmtNumber(value, 4)}
    </td>
  )
}


