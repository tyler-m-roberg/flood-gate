import { useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ChevronDown, ChevronRight, Eye, EyeOff, Plus, X,
  Layers, BarChart3, Trash2, Activity, Waves,
} from 'lucide-react'
import { useWorkspaceStore } from '@/store/workspaceStore'
import { cn } from '@/lib/utils'

const SENSOR_ICON: Record<string, string> = {
  voltage:      'V',
  current:      'A',
  pressure:     'P',
  strain:       'ε',
  temperature:  'T',
  acceleration: 'g',
}

export function ChannelPanel() {
  const { testId } = useParams<{ testId: string }>()
  const navigate = useNavigate()

  const loadedEvents = useWorkspaceStore(s => s.loadedEvents)
  const toggleChannel = useWorkspaceStore(s => s.toggleChannel)
  const setChannelVisibleForWidget = useWorkspaceStore(s => s.setChannelVisibleForWidget)
  const setChannelColor = useWorkspaceStore(s => s.setChannelColor)
  const unloadEvent = useWorkspaceStore(s => s.unloadEvent)
  const addWidget = useWorkspaceStore(s => s.addWidget)
  const selectedWidgetId = useWorkspaceStore(s => s.selectedWidgetId)
  const widgets = useWorkspaceStore(s => s.widgets)

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [collapsedTests, setCollapsedTests] = useState<Set<string>>(new Set())
  const [panelWidth] = useState(260)

  function toggleCollapse(eventId: string) {
    setCollapsed(prev => {
      const next = new Set(prev)
      if (next.has(eventId)) next.delete(eventId)
      else next.add(eventId)
      return next
    })
  }

  function toggleTestCollapse(tId: string) {
    setCollapsedTests(prev => {
      const next = new Set(prev)
      if (next.has(tId)) next.delete(tId)
      else next.add(tId)
      return next
    })
  }

  // Group events by test
  const testIds = [...new Set(loadedEvents.map(e => e.testId))]
  const multiTest = testIds.length > 1

  // Get the selected widget info for the header
  const selectedWidget = selectedWidgetId ? widgets.find(w => w.id === selectedWidgetId) : null
  const widgetChannels = selectedWidget?.channels ?? []

  function isChannelActiveInWidget(eventId: string, channelId: string) {
    return widgetChannels.some(c => c.eventId === eventId && c.channelId === channelId)
  }

  if (loadedEvents.length === 0) {
    return (
      <aside className="flex flex-col h-full border-r border-[#30363d] bg-[#161b22]" style={{ width: panelWidth }}>
        <PanelHeader />
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          <Layers size={24} className="text-[#30363d] mb-3" />
          <p className="text-xs text-[#6e7681] leading-relaxed">
            No events loaded. Select events from the test page to begin analysis.
          </p>
          <button
            onClick={() => navigate(testId ? `/test/${testId}` : '/')}
            className="mt-4 flex items-center gap-1.5 text-xs text-[#58a6ff] hover:text-[#79c0ff] transition-colors"
          >
            <Plus size={12} />
            Add events
          </button>
        </div>
      </aside>
    )
  }

  return (
    <aside
      className="flex flex-col h-full border-r border-[#30363d] bg-[#161b22] shrink-0"
      style={{ width: panelWidth }}
    >
      <PanelHeader />

      {/* Widget selection indicator */}
      {selectedWidget && (
        <div className="px-3 py-1.5 border-b border-[#30363d] bg-[#58a6ff11]">
          <p className="text-[10px] text-[#58a6ff] truncate">
            Assigning to: {selectedWidget.title}
          </p>
        </div>
      )}

      {/* Active channel summary for selected widget */}
      {selectedWidget && widgetChannels.length > 0 && (
        <div className="px-3 py-2 border-b border-[#30363d]">
          <p className="text-[10px] text-[#6e7681] uppercase tracking-wider mb-1.5">
            Widget channels ({widgetChannels.length})
          </p>
          <div className="flex flex-wrap gap-1">
            {widgetChannels.map(ch => (
              <div
                key={ch.key}
                className="flex items-center gap-1 text-[10px] rounded px-1.5 py-0.5 border"
                style={{
                  borderColor: ch.color + '44',
                  backgroundColor: ch.color + '11',
                  color: ch.color,
                }}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ backgroundColor: ch.color }}
                />
                <span className="max-w-[70px] truncate">
                  {multiTest ? `${ch.testId.slice(-3)}:` : ''}{ch.channelId}
                </span>
                <button
                  onClick={() => toggleChannel(ch.eventId, ch.channelId)}
                  className="opacity-60 hover:opacity-100"
                >
                  <X size={9} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* No widget selected banner */}
      {!selectedWidget && widgets.length > 0 && (
        <div className="px-3 py-2 border-b border-[#30363d] bg-[#d2992211]">
          <p className="text-[10px] text-[#d29922]">
            Click a widget to select it, then assign channels here.
          </p>
        </div>
      )}

      {/* Events + channels — grouped by test when multiple tests */}
      <div className="flex-1 overflow-y-auto">
        {testIds.map(tId => {
          const testEvents = loadedEvents.filter(e => e.testId === tId)
          const isTestCollapsed = collapsedTests.has(tId)

          return (
            <div key={tId}>
              {/* Test group header (only when multiple tests loaded) */}
              {multiTest && (
                <div
                  className="flex items-center gap-2 px-3 py-1.5 bg-[#0d1117] border-b border-[#30363d] cursor-pointer hover:bg-[#1c2128] transition-colors"
                  onClick={() => toggleTestCollapse(tId)}
                >
                  {isTestCollapsed
                    ? <ChevronRight size={12} className="text-[#6e7681]" />
                    : <ChevronDown size={12} className="text-[#6e7681]" />
                  }
                  <span className="text-[10px] font-mono text-[#58a6ff] font-semibold">{tId}</span>
                  <span className="text-[10px] text-[#6e7681]">({testEvents.length})</span>
                </div>
              )}

              {!isTestCollapsed && testEvents.map(event => {
                const isCollapsed = collapsed.has(event.eventId)
                // Use channels from event metadata (works for both mock and API data)
                const channels = event.meta.channels

                return (
                  <div key={event.eventId} className="border-b border-[#30363d]">
                    {/* Event header */}
                    <div className="flex items-center gap-2 px-3 py-2 hover:bg-[#1c2128] transition-colors group">
                      <button
                        onClick={() => toggleCollapse(event.eventId)}
                        className="text-[#6e7681] hover:text-[#e6edf3] transition-colors"
                      >
                        {isCollapsed
                          ? <ChevronRight size={13} />
                          : <ChevronDown size={13} />
                        }
                      </button>
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-mono text-[#6e7681]">{event.eventId}</p>
                        <p className="text-xs text-[#e6edf3] truncate font-medium">{event.meta.name}</p>
                      </div>
                      <button
                        onClick={() => unloadEvent(event.eventId)}
                        className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-[#6e7681] hover:text-[#f85149] hover:bg-[#f8514922] transition-all"
                        title="Remove event"
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>

                    {/* Channel list */}
                    {!isCollapsed && (
                      <div className="pb-1">
                        {channels.map(ch => {
                          const active = isChannelActiveInWidget(event.eventId, ch.id)
                          const activeCh = widgetChannels.find(
                            a => a.eventId === event.eventId && a.channelId === ch.id
                          )
                          const canClick = !!selectedWidget
                          return (
                            <div
                              key={ch.id}
                              className={cn(
                                'flex items-center gap-2 pl-7 pr-3 py-1.5 transition-colors group/ch',
                                canClick ? 'cursor-pointer' : 'cursor-not-allowed opacity-50',
                                active ? 'bg-[#1c2128]' : canClick ? 'hover:bg-[#1c2128]' : ''
                              )}
                              onClick={() => canClick && toggleChannel(event.eventId, ch.id)}
                            >
                              {/* Color swatch / sensor type badge */}
                              <ColorSwatch
                                color={activeCh?.color ?? ch.color}
                                sensorType={ch.sensorType}
                                active={active}
                                onColorChange={active && selectedWidgetId
                                  ? (c: string) => setChannelColor(selectedWidgetId!, `${event.eventId}::${ch.id}`, c)
                                  : undefined
                                }
                              />

                              <div className="flex-1 min-w-0">
                                <p className={cn(
                                  'text-xs truncate transition-colors',
                                  active ? 'text-[#e6edf3]' : 'text-[#8b949e]'
                                )}>
                                  {ch.name}
                                </p>
                                <p className="text-[10px] text-[#6e7681]">{ch.unit}</p>
                              </div>

                              {/* Visibility toggle (only when active in selected widget) */}
                              {active && activeCh && selectedWidgetId && (
                                <button
                                  onClick={e => { e.stopPropagation(); setChannelVisibleForWidget(selectedWidgetId, activeCh.key, !activeCh.visible) }}
                                  className="p-0.5 rounded text-[#6e7681] hover:text-[#e6edf3] transition-colors opacity-0 group-hover/ch:opacity-100"
                                >
                                  {activeCh.visible
                                    ? <Eye size={12} />
                                    : <EyeOff size={12} className="text-[#f85149]" />
                                  }
                                </button>
                              )}

                              {/* Active indicator dot */}
                              {active && activeCh && (
                                <div
                                  className="w-1.5 h-1.5 rounded-full shrink-0"
                                  style={{ backgroundColor: activeCh.color }}
                                />
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>

      {/* Footer — add widgets */}
      <div className="border-t border-[#30363d] p-3 space-y-1.5">
        <p className="text-[10px] text-[#6e7681] uppercase tracking-wider mb-2">Add widget</p>
        {[
          { type: 'waveform' as const,    icon: <Activity size={11} />,  label: 'Waveform View' },
          { type: 'stats' as const,       icon: <BarChart3 size={11} />, label: 'Statistics Table' },
          { type: 'fft' as const,         icon: <Waves size={11} />,     label: 'FFT Spectrum' },
        ].map(w => (
          <button
            key={w.type}
            onClick={() => addWidget(w.type)}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-xs text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#1c2128] border border-transparent hover:border-[#30363d] transition-all"
          >
            <Plus size={10} className="text-[#58a6ff]" />
            {w.icon}
            {w.label}
          </button>
        ))}
      </div>
    </aside>
  )
}

function PanelHeader() {
  return (
    <div className="flex items-center gap-2 px-3 h-10 border-b border-[#30363d] shrink-0">
      <Layers size={13} className="text-[#58a6ff]" />
      <span className="text-xs font-semibold text-[#e6edf3]">Channels</span>
    </div>
  )
}

function ColorSwatch({
  color, sensorType, active, onColorChange,
}: {
  color: string
  sensorType: string
  active: boolean
  onColorChange?: (color: string) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  return (
    <div
      className={cn(
        'relative w-4 h-4 rounded text-[8px] flex items-center justify-center font-bold shrink-0 transition-colors',
        active ? 'opacity-100' : 'opacity-40',
        onColorChange ? 'cursor-pointer hover:ring-1 hover:ring-[#58a6ff]' : ''
      )}
      style={{
        backgroundColor: color + '22',
        color,
        border: `1px solid ${color}44`,
      }}
      onClick={e => {
        if (onColorChange) {
          e.stopPropagation()
          inputRef.current?.click()
        }
      }}
      title={onColorChange ? 'Click to change color' : undefined}
    >
      {SENSOR_ICON[sensorType] ?? '~'}
      {onColorChange && (
        <input
          ref={inputRef}
          type="color"
          value={color}
          className="absolute inset-0 w-0 h-0 opacity-0 overflow-hidden pointer-events-none"
          onChange={e => onColorChange(e.target.value)}
          onClick={e => e.stopPropagation()}
        />
      )}
    </div>
  )
}
