import { useEffect, useRef, useState, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AlertTriangle, ArrowLeft, PlusCircle, RefreshCw, Save, Upload, Timer, TimerOff, Radio, FlaskConical } from 'lucide-react'
import { ChannelPanel } from '@/components/panels/ChannelPanel'
import { Dashboard } from '@/components/dashboard/Dashboard'
import { useWorkspaceStore } from '@/store/workspaceStore'
import { fetchEvents } from '@/api/metadataClient'

const AUTO_REFRESH_OPTIONS = [
  { label: 'Off', value: 0 },
  { label: '5s', value: 5 },
  { label: '10s', value: 10 },
  { label: '30s', value: 30 },
  { label: '60s', value: 60 },
]

export function WorkspacePage() {
  const { testId } = useParams<{ testId: string }>()
  const navigate = useNavigate()
  const loadedEvents = useWorkspaceStore(s => s.loadedEvents)
  const loadingEvents = useWorkspaceStore(s => s.loadingEvents)
  const setActiveTestId = useWorkspaceStore(s => s.setActiveTestId)
  const refreshWorkspace = useWorkspaceStore(s => s.refreshWorkspace)
  const saveDashboard = useWorkspaceStore(s => s.saveDashboard)
  const loadDashboard = useWorkspaceStore(s => s.loadDashboard)
  const dashboardMode = useWorkspaceStore(s => s.dashboardMode)
  const setDashboardMode = useWorkspaceStore(s => s.setDashboardMode)
  const loadEvent = useWorkspaceStore(s => s.loadEvent)
  const unloadEvent = useWorkspaceStore(s => s.unloadEvent)

  const roRef = useRef<ResizeObserver | null>(null)
  const [dims, setDims] = useState({ w: 900, h: 600 })

  // Callback ref: fires whenever the container div mounts/unmounts,
  // handling the conditional render (events loaded → div appears).
  const containerRef = useCallback((el: HTMLDivElement | null) => {
    if (roRef.current) { roRef.current.disconnect(); roRef.current = null }
    if (!el) return
    setDims({ w: Math.floor(el.clientWidth), h: Math.floor(el.clientHeight) })
    const ro = new ResizeObserver(entries => {
      const entry = entries[0]
      if (entry) {
        setDims({ w: Math.floor(entry.contentRect.width), h: Math.floor(entry.contentRect.height) })
      }
    })
    ro.observe(el)
    roRef.current = ro
  }, [])
  const [autoRefreshInterval, setAutoRefreshInterval] = useState(0)
  const [showRefreshMenu, setShowRefreshMenu] = useState(false)

  // Realtime mode: poll for newest event
  const checkLatestEvent = useCallback(async () => {
    if (!testId || dashboardMode !== 'realtime') return
    try {
      const { items } = await fetchEvents(testId)
      if (items.length === 0) return
      // Sort by timestamp descending, pick newest
      const sorted = [...items].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      const newest = sorted[0]
      const currentLoaded = loadedEvents.map(e => e.eventId)
      if (!currentLoaded.includes(newest.id)) {
        // Unload old events and load newest
        currentLoaded.forEach(eid => unloadEvent(eid))
        loadEvent(testId, newest.id)
      }
    } catch {
      // ignore API errors during polling
    }
  }, [testId, dashboardMode, loadedEvents, loadEvent, unloadEvent])

  useEffect(() => {
    if (testId) setActiveTestId(testId)
  }, [testId, setActiveTestId])

  // Load saved dashboard on mount
  useEffect(() => {
    if (testId) loadDashboard(testId)
  }, [testId, loadDashboard])

  // Auto-refresh timer
  useEffect(() => {
    if (autoRefreshInterval <= 0) return
    const id = setInterval(() => {
      if (dashboardMode === 'realtime') {
        checkLatestEvent()
      } else {
        refreshWorkspace()
      }
    }, autoRefreshInterval * 1000)
    return () => clearInterval(id)
  }, [autoRefreshInterval, refreshWorkspace, dashboardMode, checkLatestEvent])

  // Cleanup observer on unmount
  useEffect(() => {
    return () => { roRef.current?.disconnect() }
  }, [])

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left channel panel */}
      <ChannelPanel />

      {/* Main dashboard area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Workspace toolbar */}
        {loadedEvents.length > 0 && (
          <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[#30363d] bg-[#161b22] shrink-0">
            <button
              onClick={refreshWorkspace}
              title="Refresh workspace"
              className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#1c2128] transition-colors"
            >
              <RefreshCw size={12} />
              Refresh
            </button>

            {testId && (
              <>
                <button
                  onClick={() => saveDashboard(testId)}
                  title="Save dashboard layout"
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#1c2128] transition-colors"
                >
                  <Save size={12} />
                  Save Layout
                </button>
                <button
                  onClick={() => loadDashboard(testId)}
                  title="Load saved dashboard layout"
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#1c2128] transition-colors"
                >
                  <Upload size={12} />
                  Load Layout
                </button>
              </>
            )}

            {/* Dashboard mode toggle */}
            <div className="flex items-center gap-0.5 rounded-md border border-[#30363d] p-0.5 ml-auto">
              <button
                onClick={() => setDashboardMode('analysis')}
                title="Post-analysis mode"
                className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] transition-colors ${
                  dashboardMode === 'analysis'
                    ? 'bg-[#1c2128] text-[#e6edf3]'
                    : 'text-[#6e7681] hover:text-[#8b949e]'
                }`}
              >
                <FlaskConical size={10} />
                Analysis
              </button>
              <button
                onClick={() => { setDashboardMode('realtime'); if (autoRefreshInterval === 0) setAutoRefreshInterval(10) }}
                title="Realtime mode — auto-polls for newest event"
                className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] transition-colors ${
                  dashboardMode === 'realtime'
                    ? 'bg-[#3fb95022] text-[#3fb950]'
                    : 'text-[#6e7681] hover:text-[#8b949e]'
                }`}
              >
                <Radio size={10} />
                Realtime
              </button>
            </div>

            {/* Auto-refresh dropdown */}
            <div className="relative">
              <button
                onClick={() => setShowRefreshMenu(p => !p)}
                title="Auto-refresh interval"
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs transition-colors ${
                  autoRefreshInterval > 0
                    ? 'text-[#58a6ff] bg-[#58a6ff22]'
                    : 'text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#1c2128]'
                }`}
              >
                {autoRefreshInterval > 0 ? <Timer size={12} /> : <TimerOff size={12} />}
                Auto: {autoRefreshInterval > 0 ? `${autoRefreshInterval}s` : 'Off'}
              </button>
              {showRefreshMenu && (
                <div className="absolute right-0 top-full mt-1 bg-[#161b22] border border-[#30363d] rounded-lg shadow-xl z-50 py-1 min-w-[100px]">
                  {AUTO_REFRESH_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => { setAutoRefreshInterval(opt.value); setShowRefreshMenu(false) }}
                      className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${
                        autoRefreshInterval === opt.value
                          ? 'text-[#58a6ff] bg-[#58a6ff11]'
                          : 'text-[#8b949e] hover:bg-[#1c2128] hover:text-[#e6edf3]'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {loadedEvents.length === 0 && loadingEvents.size === 0 ? (
          <NoEventsPrompt testId={testId} onNavigate={() => navigate(testId ? `/test/${testId}` : '/')} />
        ) : loadedEvents.length === 0 && loadingEvents.size > 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-[#6e7681]">
            <div className="w-6 h-6 border-2 border-[#58a6ff] border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-[#8b949e]">
              Loading {loadingEvents.size} event{loadingEvents.size > 1 ? 's' : ''} from waveform service…
            </p>
          </div>
        ) : (
          <div ref={containerRef} className="flex-1 min-h-0">
            {dims.w > 10 && dims.h > 10 && (
              <Dashboard containerWidth={dims.w} containerHeight={dims.h} />
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function NoEventsPrompt({
  testId, onNavigate,
}: { testId: string | undefined; onNavigate(): void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 text-[#6e7681] p-8">
      <AlertTriangle size={32} className="text-[#d29922]" />
      <div className="text-center">
        <p className="text-sm font-medium text-[#e6edf3]">No events loaded</p>
        <p className="text-xs mt-1 max-w-xs leading-relaxed">
          Select one or more events from the test events page to load them into the workspace.
        </p>
      </div>
      <div className="flex gap-3">
        <button
          onClick={onNavigate}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm bg-[#58a6ff22] text-[#58a6ff] border border-[#58a6ff44] hover:bg-[#58a6ff33] transition-colors"
        >
          <PlusCircle size={14} />
          Select events
        </button>
        {testId && (
          <button
            onClick={() => window.history.back()}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm text-[#8b949e] border border-[#30363d] hover:bg-[#1c2128] transition-colors"
          >
            <ArrowLeft size={14} />
            Go back
          </button>
        )}
      </div>
    </div>
  )
}
