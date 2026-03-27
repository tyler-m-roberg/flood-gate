import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AlertTriangle, ArrowLeft, PlusCircle } from 'lucide-react'
import { ChannelPanel } from '@/components/panels/ChannelPanel'
import { Dashboard } from '@/components/dashboard/Dashboard'
import { useWorkspaceStore } from '@/store/workspaceStore'
import { MOCK_EVENTS } from '@/data/mockData'

export function WorkspacePage() {
  const { testId } = useParams<{ testId: string }>()
  const navigate = useNavigate()
  const loadedEvents = useWorkspaceStore(s => s.loadedEvents)
  const setActiveTestId = useWorkspaceStore(s => s.setActiveTestId)

  const containerRef = useRef<HTMLDivElement>(null)
  const [dims, setDims] = useState({ w: 900, h: 600 })

  useEffect(() => {
    if (testId) setActiveTestId(testId)
  }, [testId, setActiveTestId])

  // Measure the dashboard container
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(entries => {
      const entry = entries[0]
      if (entry) {
        setDims({
          w: Math.floor(entry.contentRect.width),
          h: Math.floor(entry.contentRect.height),
        })
      }
    })
    ro.observe(el)
    // Initial measurement
    setDims({ w: Math.floor(el.clientWidth), h: Math.floor(el.clientHeight) })
    return () => ro.disconnect()
  }, [])

  // If no events are loaded and we know the testId, suggest the user picks events
  const testEvents = testId ? (MOCK_EVENTS[testId] ?? []) : []
  const hasEvents = testEvents.length > 0

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left channel panel */}
      <ChannelPanel />

      {/* Main dashboard area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {loadedEvents.length === 0 ? (
          <NoEventsPrompt testId={testId} hasEvents={hasEvents} onNavigate={() => navigate(testId ? `/test/${testId}` : '/')} />
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
  testId, hasEvents, onNavigate,
}: { testId: string | undefined; hasEvents: boolean; onNavigate(): void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 text-[#6e7681] p-8">
      <AlertTriangle size={32} className="text-[#d29922]" />
      <div className="text-center">
        <p className="text-sm font-medium text-[#e6edf3]">No events loaded</p>
        <p className="text-xs mt-1 max-w-xs leading-relaxed">
          {hasEvents
            ? 'Select one or more events from the test events page to load them into the workspace.'
            : 'No events found for this test.'}
        </p>
      </div>
      <div className="flex gap-3">
        <button
          onClick={onNavigate}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm bg-[#58a6ff22] text-[#58a6ff] border border-[#58a6ff44] hover:bg-[#58a6ff33] transition-colors"
        >
          <PlusCircle size={14} />
          {hasEvents ? 'Select events' : 'Back to tests'}
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
