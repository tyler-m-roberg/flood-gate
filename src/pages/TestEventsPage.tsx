import { useNavigate, useParams } from 'react-router-dom'
import { useState } from 'react'
import {
  ArrowLeft, Calendar, ChevronRight, Clock, Filter, Hash,
  Layers, Search, BarChart3, CheckCircle2, AlertCircle,
} from 'lucide-react'
import { MOCK_TESTS, MOCK_EVENTS } from '@/data/mockData'
import type { TestEvent } from '@/types'
import { useWorkspaceStore } from '@/store/workspaceStore'
import { cn, fmtDate, fmtDuration, fmtSampleRate } from '@/lib/utils'

const STATUS_STYLE: Record<TestEvent['status'], string> = {
  complete: 'text-[#3fb950]',
  partial:  'text-[#d29922]',
  failed:   'text-[#f85149]',
}

export function TestEventsPage() {
  const { testId } = useParams<{ testId: string }>()
  const navigate = useNavigate()
  const loadEvent = useWorkspaceStore(s => s.loadEvent)
  const isEventLoaded = useWorkspaceStore(s => s.isEventLoaded)
  const loadedEvents = useWorkspaceStore(s => s.loadedEvents)
  const setActiveTestId = useWorkspaceStore(s => s.setActiveTestId)

  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const test = MOCK_TESTS.find(t => t.id === testId)
  const events = testId ? (MOCK_EVENTS[testId] ?? []) : []

  const filtered = events.filter(e =>
    e.name.toLowerCase().includes(search.toLowerCase()) ||
    e.id.toLowerCase().includes(search.toLowerCase())
  )

  function toggleSelect(eventId: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(eventId)) next.delete(eventId)
      else next.add(eventId)
      return next
    })
  }

  function openInWorkspace(eventIds: string[]) {
    if (!testId) return
    setActiveTestId(testId)
    eventIds.forEach(id => loadEvent(testId, id))
    navigate(`/workspace/${testId}`)
  }

  function handleRowClick(event: TestEvent) {
    if (event.status === 'failed') return
    toggleSelect(event.id)
  }

  if (!test) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-[#6e7681]">
        <AlertCircle size={32} className="mb-2" />
        <p>Test not found</p>
        <button onClick={() => navigate('/')} className="mt-3 text-[#58a6ff] text-sm hover:underline">
          Back to tests
        </button>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto bg-[#0d1117]">
      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-start gap-4 mb-6">
          <button
            onClick={() => navigate('/')}
            className="mt-1 p-1.5 rounded-lg text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#1c2128] transition-colors"
          >
            <ArrowLeft size={16} />
          </button>
          <div className="flex-1">
            <p className="text-xs text-[#6e7681] font-mono mb-1">{test.id}</p>
            <h1 className="text-xl font-semibold text-[#e6edf3]">{test.name}</h1>
            <p className="text-sm text-[#8b949e] mt-1">{test.description}</p>
            <div className="flex flex-wrap gap-3 mt-2 text-xs text-[#6e7681]">
              <span className="flex items-center gap-1"><Layers size={11} />{test.facility}</span>
              <span>·</span>
              <span>{test.operator}</span>
              <span>·</span>
              <span className="flex items-center gap-1"><Calendar size={11} />{fmtDate(test.createdAt)}</span>
            </div>
          </div>
        </div>

        {/* Action bar */}
        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1 max-w-sm">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#6e7681]" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search events…"
              className="w-full bg-[#161b22] border border-[#30363d] rounded-lg pl-8 pr-3 py-1.5 text-sm text-[#e6edf3] placeholder-[#6e7681] focus:outline-none focus:border-[#58a6ff] transition-colors"
            />
          </div>

          <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-[#8b949e] border border-[#30363d] bg-[#161b22] hover:border-[#58a6ff] transition-colors">
            <Filter size={12} />
            Filter
          </button>

          {selected.size > 0 && (
            <div className="flex items-center gap-2 ml-auto">
              <span className="text-xs text-[#8b949e]">{selected.size} selected</span>
              <button
                onClick={() => openInWorkspace(Array.from(selected))}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#58a6ff] text-[#0d1117] hover:bg-[#79c0ff] transition-colors"
              >
                <BarChart3 size={12} />
                Open in Workspace
              </button>
            </div>
          )}

          {loadedEvents.length > 0 && selected.size === 0 && (
            <button
              onClick={() => navigate(`/workspace/${testId}`)}
              className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#58a6ff22] text-[#58a6ff] border border-[#58a6ff44] hover:bg-[#58a6ff33] transition-colors"
            >
              <BarChart3 size={12} />
              Go to Workspace ({loadedEvents.length})
            </button>
          )}
        </div>

        {/* Events table */}
        <div className="bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden">
          {/* Table header */}
          <div className="grid grid-cols-[auto_1fr_auto_auto_auto_auto_auto] items-center px-4 py-2.5 border-b border-[#30363d] text-[10px] font-semibold text-[#6e7681] uppercase tracking-wider">
            <div className="w-5" />
            <div>Event</div>
            <div className="text-right pr-8">Sample Rate</div>
            <div className="text-right pr-8">Duration</div>
            <div className="text-right pr-8">Channels</div>
            <div className="text-right pr-8">Trigger</div>
            <div className="text-right">Status</div>
          </div>

          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-[#6e7681]">
              <Hash size={24} className="mb-2" />
              <p className="text-sm">No events match your search</p>
            </div>
          ) : (
            filtered.map((event, idx) => (
              <EventRow
                key={event.id}
                event={event}
                isSelected={selected.has(event.id)}
                isLoaded={isEventLoaded(event.id)}
                isEven={idx % 2 === 1}
                onClick={() => handleRowClick(event)}
                onOpenAlone={() => openInWorkspace([event.id])}
              />
            ))
          )}
        </div>

        <p className="text-xs text-[#6e7681] mt-3 text-right">
          {filtered.length} of {events.length} events · Click to select · Open selected in workspace for analysis
        </p>
      </div>
    </div>
  )
}

function EventRow({
  event, isSelected, isLoaded, isEven, onClick, onOpenAlone,
}: {
  event: TestEvent
  isSelected: boolean
  isLoaded: boolean
  isEven: boolean
  onClick(): void
  onOpenAlone(): void
}) {
  const disabled = event.status === 'failed'

  return (
    <div
      onClick={onClick}
      className={cn(
        'grid grid-cols-[auto_1fr_auto_auto_auto_auto_auto] items-center px-4 py-3 border-b border-[#30363d] last:border-b-0 transition-colors group',
        isEven ? 'bg-[#0d1117]' : 'bg-[#161b22]',
        disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-[#1c2128]',
        isSelected && 'bg-[#58a6ff0d] border-l-2 border-l-[#58a6ff]',
      )}
    >
      {/* Checkbox */}
      <div className="w-5 mr-3">
        <div className={cn(
          'w-4 h-4 rounded border transition-colors flex items-center justify-center',
          isSelected
            ? 'bg-[#58a6ff] border-[#58a6ff]'
            : isLoaded
            ? 'bg-[#3fb95022] border-[#3fb950]'
            : 'border-[#30363d] group-hover:border-[#8b949e]'
        )}>
          {isSelected && <CheckCircle2 size={11} className="text-[#0d1117]" />}
          {!isSelected && isLoaded && <span className="w-1.5 h-1.5 rounded-full bg-[#3fb950]" />}
        </div>
      </div>

      {/* Name + timestamp */}
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-[#6e7681]">{event.id}</span>
          <span className="font-medium text-sm text-[#e6edf3] truncate">{event.name}</span>
        </div>
        <div className="flex items-center gap-2 mt-0.5 text-xs text-[#6e7681]">
          <Clock size={10} />
          <span>{fmtDate(event.timestamp)}</span>
        </div>
      </div>

      {/* Sample rate */}
      <div className="text-right pr-8">
        <span className="text-xs font-mono text-[#58a6ff]">{fmtSampleRate(event.sampleRate)}</span>
      </div>

      {/* Duration */}
      <div className="text-right pr-8">
        <span className="text-xs font-mono text-[#e6edf3]">{fmtDuration(event.duration)}</span>
      </div>

      {/* Channels */}
      <div className="text-right pr-8">
        <span className="text-xs text-[#8b949e]">{event.channels.length} ch</span>
      </div>

      {/* Trigger */}
      <div className="text-right pr-8">
        <span className="text-xs text-[#6e7681] truncate max-w-[120px] block">
          {event.triggerCondition ?? '—'}
        </span>
      </div>

      {/* Status + quick action */}
      <div className="flex items-center gap-2 justify-end">
        <span className={cn('text-xs', STATUS_STYLE[event.status])}>
          {event.status}
        </span>
        {!disabled && (
          <button
            onClick={e => { e.stopPropagation(); onOpenAlone() }}
            className="opacity-0 group-hover:opacity-100 p-1 rounded text-[#6e7681] hover:text-[#58a6ff] hover:bg-[#58a6ff22] transition-all"
            title="Open alone in workspace"
          >
            <ChevronRight size={14} />
          </button>
        )}
      </div>
    </div>
  )
}
