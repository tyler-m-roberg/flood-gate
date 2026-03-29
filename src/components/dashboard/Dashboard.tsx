import { useCallback } from 'react'
import GridLayout, { type Layout, type LayoutItem } from 'react-grid-layout'
import { useWorkspaceStore } from '@/store/workspaceStore'
import { WidgetContainer } from '@/components/widgets/WidgetContainer'
import { WaveformWidget } from '@/components/widgets/WaveformWidget'
import { StatsWidget } from '@/components/widgets/StatsWidget'
import { FFTWidget } from '@/components/widgets/FFTWidget'
import { Activity, BarChart3, Plus, Waves } from 'lucide-react'
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

  const onLayoutChange = useCallback((newLayout: Layout) => {
    const items = newLayout as LayoutItem[]
    setLayout(items.map(item => ({
      i: item.i, x: item.x, y: item.y, w: item.w, h: item.h,
      minW: item.minW, maxW: item.maxW ?? 12, minH: item.minH,
    })))
  }, [setLayout])

  const visibleWidgets = widgets.filter(w => !w.poppedOut)

  // Build layout with static flag for locked widgets
  const effectiveLayout = layout.map(item => {
    const widget = widgets.find(w => w.id === item.i)
    if (widget?.locked) {
      return { ...item, static: true } as LayoutItem
    }
    return item as LayoutItem
  })

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
            { type: 'fft' as const, icon: <Waves size={13} />, label: 'Add FFT' },
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
        layout={effectiveLayout}
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
        {visibleWidgets.map(widget => (
          <div key={widget.id}>
            <WidgetContainer widget={widget}>
              <WidgetContent widget={widget} />
            </WidgetContainer>
          </div>
        ))}
      </GridLayout>
    </div>
  )
}

function WidgetContent({ widget }: { widget: WidgetConfig }) {
  switch (widget.type) {
    case 'waveform':
      return <WaveformWidget widgetId={widget.id} />
    case 'stats':
      return <StatsWidget widgetId={widget.id} />
    case 'fft':
      return <FFTWidget widgetId={widget.id} />
    default:
      return (
        <div className="flex items-center justify-center h-full text-xs text-[#6e7681]">
          Widget type "{widget.type}" — coming soon
        </div>
      )
  }
}

function EmptyDashboard({ onAddWidget }: { onAddWidget: (type: 'waveform' | 'stats' | 'fft') => void }) {
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
            type: 'fft' as const,
            icon: <Waves size={20} className="text-[#d29922]" />,
            label: 'FFT Spectrum',
            desc: 'Frequency-domain amplitude spectrum',
            color: '#d29922',
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
