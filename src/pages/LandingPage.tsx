import { useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { Activity, Archive, ChevronRight, Loader2, Plus, Tag, Users, Zap } from 'lucide-react'
import { MOCK_TESTS } from '@/data/mockData'
import { fetchTests } from '@/api/metadataClient'
import { CreateTestModal } from '@/components/modals/CreateTestModal'
import type { Test } from '@/types'
import { fmtDate } from '@/lib/utils'
import { cn } from '@/lib/utils'

const STATUS_STYLE: Record<Test['status'], string> = {
  active:      'bg-[#3fb95022] text-[#3fb950] border-[#3fb95044]',
  archived:    'bg-[#6e768122] text-[#6e7681] border-[#6e768144]',
  processing:  'bg-[#d2992222] text-[#d29922] border-[#d2992244]',
}

const STATUS_DOT: Record<Test['status'], string> = {
  active:     'bg-[#3fb950]',
  archived:   'bg-[#6e7681]',
  processing: 'bg-[#d29922] animate-pulse',
}

export function LandingPage() {
  const navigate = useNavigate()
  const [tests, setTests] = useState<Test[]>(MOCK_TESTS)
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetchTests()
      .then(data => { if (!cancelled) setTests(data.items) })
      .catch(() => { /* keep mock data as fallback */ })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const active = tests.filter(t => t.status === 'active')
  const archived = tests.filter(t => t.status !== 'active')

  return (
    <div className="h-full overflow-y-auto bg-[#0d1117]">
      <div className="max-w-5xl mx-auto px-6 py-10">
        {/* Hero */}
        <div className="mb-10">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-[#58a6ff22] border border-[#58a6ff33] flex items-center justify-center">
              <Activity size={20} className="text-[#58a6ff]" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-[#e6edf3]">FloodGate</h1>
              <p className="text-sm text-[#6e7681]">High-frequency instrumentation analysis platform</p>
            </div>
          </div>
          <p className="text-[#8b949e] text-sm max-w-2xl leading-relaxed">
            Select a test campaign to explore events, analyze waveforms, and compare results across
            runs. Supports sample rates from 400 kHz to 1 MHz with interactive channel analysis.
          </p>
        </div>

        {/* Quick stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-10">
          {[
            { label: 'Active Tests', value: active.length, icon: <Zap size={14} />, color: 'text-[#58a6ff]' },
            { label: 'Total Events', value: tests.reduce((s, t) => s + t.eventCount, 0), icon: <Activity size={14} />, color: 'text-[#3fb950]' },
            { label: 'Analysts', value: 3, icon: <Users size={14} />, color: 'text-[#bc8cff]' },
            { label: 'Archived', value: archived.length, icon: <Archive size={14} />, color: 'text-[#6e7681]' },
          ].map(stat => (
            <div key={stat.label} className="bg-[#161b22] border border-[#30363d] rounded-lg p-3">
              <div className={`flex items-center gap-1.5 text-xs mb-1 ${stat.color}`}>
                {stat.icon}
                <span>{stat.label}</span>
              </div>
              <p className="text-2xl font-semibold text-[#e6edf3]">{stat.value}</p>
            </div>
          ))}
        </div>

        {/* Active tests */}
        <section className="mb-10">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-xs font-semibold text-[#6e7681] uppercase tracking-widest">
              Active Tests
            </h2>
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#58a6ff] text-[#0d1117] hover:bg-[#79c0ff] transition-colors"
            >
              <Plus size={12} />
              Create Test
            </button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12 text-[#6e7681]">
              <Loader2 size={20} className="animate-spin mr-2" />
              Loading tests...
            </div>
          ) : (
            <div className="grid gap-3">
              {active.map(test => (
                <TestCard key={test.id} test={test} onClick={() => navigate(`/test/${test.id}`)} />
              ))}
              {active.length === 0 && (
                <p className="text-sm text-[#6e7681] py-4 text-center">No active tests</p>
              )}
            </div>
          )}
        </section>

        {/* Archived */}
        {archived.length > 0 && (
          <section>
            <h2 className="text-xs font-semibold text-[#6e7681] uppercase tracking-widest mb-5">
              Archived
            </h2>
            <div className="grid gap-3">
              {archived.map(test => (
                <TestCard key={test.id} test={test} onClick={() => navigate(`/test/${test.id}`)} />
              ))}
            </div>
          </section>
        )}
      </div>

      {showCreate && (
        <CreateTestModal
          onClose={() => setShowCreate(false)}
          onCreated={test => setTests(prev => [test, ...prev])}
        />
      )}
    </div>
  )
}

function TestCard({ test, onClick }: { test: Test; onClick(): void }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-[#161b22] border border-[#30363d] rounded-xl p-5 hover:border-[#58a6ff44] hover:bg-[#161b22] transition-all group"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={cn(
              'inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border uppercase tracking-wide font-medium shrink-0',
              STATUS_STYLE[test.status]
            )}>
              <span className={cn('w-1.5 h-1.5 rounded-full', STATUS_DOT[test.status])} />
              {test.status}
            </span>
            <span className="text-xs text-[#6e7681] font-mono">{test.id}</span>
          </div>

          <h3 className="font-medium text-[#e6edf3] group-hover:text-[#58a6ff] transition-colors text-base mb-1">
            {test.name}
          </h3>
          <p className="text-sm text-[#8b949e] leading-relaxed line-clamp-2">{test.description}</p>

          <div className="flex flex-wrap items-center gap-3 mt-3 text-xs text-[#6e7681]">
            <span>{test.facility}</span>
            <span>·</span>
            <span>{test.operator}</span>
            <span>·</span>
            <span>{fmtDate(test.createdAt)}</span>
          </div>

          {test.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {test.tags.map(tag => (
                <span key={tag} className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-[#1c2128] border border-[#30363d] text-[#8b949e]">
                  <Tag size={9} />
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="text-right shrink-0">
          <p className="text-2xl font-semibold text-[#e6edf3]">{test.eventCount}</p>
          <p className="text-[10px] text-[#6e7681] uppercase tracking-wide">events</p>
          <ChevronRight size={16} className="text-[#6e7681] group-hover:text-[#58a6ff] transition-colors mt-2 ml-auto" />
        </div>
      </div>
    </button>
  )
}
