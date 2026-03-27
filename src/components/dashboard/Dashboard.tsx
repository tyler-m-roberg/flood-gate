import { useCallback, useRef } from 'react'
import GridLayout, { type Layout, type LayoutItem } from 'react-grid-layout'
import { useWorkspaceStore } from '@/store/workspaceStore'
import { WidgetContainer } from '@/components/widgets/WidgetContainer'
import { WaveformWidget } from '@/components/widgets/WaveformWidget'
import { StatsWidget } from '@/components/widgets/StatsWidget'
import { ComparativeWidget } from '@/components/widgets/ComparativeWidget'
import { Activity, BarChart3, Layers, Plus } from 'lucide-react'
import type { WidgetConfig } from '@/types'

interface DashboardProps {
  containerWidth: number
  containerHeight: number
}

const ROW_HEIGHT = 36

export function Dashboard({ containerWidth }: DashboardProps) {
  const widgets = useWorkspaceStore(s => s.widgets)
  const layout = useWorkspaceStore(s => s.layout)
  const setLayout = useWorkspaceStore(s => s.setLayout)
  const addWidget = useWorkspaceStore(s => s.addWidget)
  const loadedEvents = useWorkspaceStore(s => s.loadedEvents)

  const widgetDims = useRef<Map<string, { w: number; h: number }>>(new Map())

  const onLayoutChange = useCallback((newLayout: Layout) => {
    const items = newLayout as LayoutItem[]
    setLayout(items.map(item => ({
      i: item.i, x: item.x, y: item.y, w: item.w, h: item.h,
      minW: item.minW, minH: item.minH,
    })))
    items.forEach(item => {
      widgetDims.current.set(item.i, {
        w: Math.floor((item.w / 12) * containerWidth),
        h: item.h * ROW_HEIGHT + (item.h - 1) * 4,
      })
    })
  }, [setLayout, containerWidth])

  function getWidgetDims(widgetId: string) {
    if (widgetDims.current.has(widgetId)) return widgetDims.current.get(widgetId)!
    const item = layout.find(l => l.i === widgetId)
    if (!item) return { w: 600, h: 300 }
    return {
      w: Math.floor((item.w / 12) * containerWidth),
      h: item.h * ROW_HEIGHT + (item.h - 1) * 4,
    }
  }

  const visibleWidgets = widgets.filter(w => !w.poppedOut)

  if (loadedEvents.length === 0) {
    return <EmptyDashboard onAddWidget={addWidget} />
  }

  if (visibleWidgets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-[#6e7681] gap-3">
        <p className="text-sm">No widgets on dashboard</p>
        <div className="flex gap-2">
          {[
            { type: 'waveform' as const, icon: <Activity size={13} />, label: 'Add Waveform' },
            { type: 'stats' as const, icon: <BarChart3 size={13} />, label: 'Add Stats' },
            { type: 'comparative' as const, icon: <Layers size={13} />, label: 'Add Comparative' },
          ].map(w => (
            <button
              key={w.type}
              onClick={() => addWidget(w.type)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs border border-[#30363d] bg-[#161b22] text-[#8b949e] hover:text-[#e6edf3] hover:border-[#58a6ff] transition-all"
            >
              {w.icon}
              {w.label}
            </button>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto">
      <GridLayout
        layout={layout as LayoutItem[]}
        width={containerWidth}
        onLayoutChange={onLayoutChange}
        gridConfig={{
          cols: 12,
          rowHeight: ROW_HEIGHT,
          margin: [6, 6],
          containerPadding: [6, 6],
        }}
        dragConfig={{
          enabled: true,
          handle: '.widget-drag-handle',
        }}
        resizeConfig={{
          enabled: true,
          handles: ['se', 's', 'e'],
        }}
        className="layout"
      >
        {visibleWidgets.map(widget => {
          const dims = getWidgetDims(widget.id)
          return (
            <div key={widget.id}>
              <WidgetContainer widget={widget}>
                <WidgetContent widget={widget} dims={dims} />
              </WidgetContainer>
            </div>
          )
        })}
      </GridLayout>
    </div>
  )
}

function WidgetContent({ widget, dims }: { widget: WidgetConfig; dims: { w: number; h: number } }) {
  const HEADER_HEIGHT = 30
  const contentH = Math.max(dims.h - HEADER_HEIGHT, 60)

  switch (widget.type) {
    case 'waveform':
      return (
        <WaveformWidget
          channelKeys={widget.channelKeys}
          width={dims.w}
          height={contentH}
        />
      )
    case 'stats':
      return <StatsWidget channelKeys={widget.channelKeys} />
    case 'comparative':
      return (
        <ComparativeWidget
          widgetId={widget.id}
          channelKeys={widget.channelKeys}
          width={dims.w}
          height={contentH}
        />
      )
    default:
      return (
        <div className="flex items-center justify-center h-full text-xs text-[#6e7681]">
          Widget type "{widget.type}" — coming soon
        </div>
      )
  }
}

function EmptyDashboard({ onAddWidget }: { onAddWidget: (type: 'waveform' | 'stats' | 'comparative') => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-6 text-[#6e7681]">
      <div className="text-center">
        <BarChart3 size={40} className="text-[#30363d] mx-auto mb-3" />
        <p className="text-sm font-medium text-[#8b949e]">Workspace ready</p>
        <p className="text-xs mt-1">Add widgets from the channel panel, or start here:</p>
      </div>

      <div className="grid grid-cols-3 gap-3 max-w-lg">
        {[
          {
            type: 'waveform' as const,
            icon: <Activity size={20} className="text-[#58a6ff]" />,
            label: 'Waveform View',
            desc: 'Time-series plot with zoom, pan & markers',
            color: '#58a6ff',
          },
          {
            type: 'stats' as const,
            icon: <BarChart3 size={20} className="text-[#3fb950]" />,
            label: 'Statistics',
            desc: 'Min, max, RMS, rise time & more',
            color: '#3fb950',
          },
          {
            type: 'comparative' as const,
            icon: <Layers size={20} className="text-[#bc8cff]" />,
            label: 'Comparative',
            desc: 'Overlay channels across events',
            color: '#bc8cff',
          },
        ].map(w => (
          <button
            key={w.type}
            onClick={() => onAddWidget(w.type)}
            className="flex flex-col items-center gap-2 p-4 rounded-xl border border-[#30363d] bg-[#161b22] hover:bg-[#1c2128] text-center transition-all group"
            style={{ borderColor: 'transparent' }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = w.color + '44')}
            onMouseLeave={e => (e.currentTarget.style.borderColor = 'transparent')}
          >
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: w.color + '22' }}
            >
              {w.icon}
            </div>
            <div>
              <p className="text-xs font-medium text-[#e6edf3]">{w.label}</p>
              <p className="text-[10px] text-[#6e7681] mt-0.5 leading-tight">{w.desc}</p>
            </div>
            <Plus size={12} className="text-[#6e7681] group-hover:text-[#e6edf3] transition-colors" />
          </button>
        ))}
      </div>
    </div>
  )
}
