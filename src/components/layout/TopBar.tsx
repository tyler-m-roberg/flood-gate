import { useNavigate, useParams } from 'react-router-dom'
import {
  ChevronRight, Activity, LogOut, Settings,
  BarChart3, Layers, Home,
} from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { useWorkspaceStore } from '@/store/workspaceStore'
import { cn } from '@/lib/utils'
import { useState, useEffect } from 'react'
import { fetchTests } from '@/api/metadataClient'
import type { Test } from '@/types'

export function TopBar() {
  const navigate = useNavigate()
  const { testId, eventId } = useParams<{ testId: string; eventId: string }>()
  const user = useAuthStore(s => s.user)
  const logout = useAuthStore(s => s.logout)
  const loadedEvents = useWorkspaceStore(s => s.loadedEvents)
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [testName, setTestName] = useState<string | null>(null)

  useEffect(() => {
    if (!testId) { setTestName(null); return }
    fetchTests()
      .then(data => {
        const t = data.items.find((t: Test) => t.id === testId)
        setTestName(t?.name ?? null)
      })
      .catch(() => {})
  }, [testId])

  return (
    <header className="flex items-center h-12 px-6 border-b border-[#30363d] bg-[#161b22] shrink-0 z-50">
      {/* Logo + breadcrumbs */}
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2 text-[#58a6ff] hover:text-white transition-colors shrink-0"
        >
          <Activity size={18} className="shrink-0" />
          <span className="font-semibold text-sm hidden sm:block">FloodGate</span>
        </button>

        {testId && (
          <>
            <ChevronRight size={14} className="text-[#6e7681] shrink-0" />
            <button
              onClick={() => navigate(`/test/${testId}`)}
              className="text-sm text-[#8b949e] hover:text-white transition-colors truncate max-w-[180px]"
            >
              {testName ?? testId}
            </button>
          </>
        )}

        {loadedEvents.length > 0 && (
          <>
            <ChevronRight size={14} className="text-[#6e7681] shrink-0" />
            <span className="text-sm text-[#e6edf3] truncate max-w-[160px]">
              {loadedEvents.length === 1
                ? loadedEvents[0].meta.name
                : `${loadedEvents.length} events loaded`}
            </span>
          </>
        )}
      </div>

      {/* Center — workspace quick actions */}
      {(testId ?? eventId) && (
        <div className="flex items-center gap-1 px-2">
          <NavBtn icon={<Home size={14} />} label="Tests" onClick={() => navigate('/')} />
          <NavBtn icon={<Layers size={14} />} label="Events" onClick={() => navigate(`/test/${testId}`)} active={!eventId} />
          <NavBtn icon={<BarChart3 size={14} />} label="Workspace" onClick={() => navigate(`/workspace/${testId}`)} active={!!loadedEvents.length} />
        </div>
      )}

      {/* Right — user menu */}
      <div className="flex items-center gap-3 shrink-0 ml-3">
        <div className="relative">
          <button
            onClick={() => setShowUserMenu(p => !p)}
            className="flex items-center gap-2 hover:bg-[#1c2128] rounded-full pr-2 pl-1 py-0.5 transition-colors"
          >
            <div className="w-7 h-7 rounded-full bg-[#58a6ff22] border border-[#58a6ff44] flex items-center justify-center text-xs font-semibold text-[#58a6ff]">
              {user?.avatarInitials ?? '?'}
            </div>
            <span className="text-sm text-[#e6edf3] hidden md:block">{user?.name.split(' ')[0]}</span>
          </button>

          {showUserMenu && (
            <div className="absolute right-0 top-full mt-1 bg-[#161b22] border border-[#30363d] rounded-lg shadow-xl z-50 min-w-[200px] py-1">
              <div className="px-3 py-2 border-b border-[#30363d]">
                <p className="text-sm font-medium text-[#e6edf3]">{user?.name}</p>
                <p className="text-xs text-[#6e7681]">{user?.email}</p>
                <div className="flex gap-1 mt-1.5 flex-wrap">
                  {user?.roles.map(r => (
                    <span key={r} className="text-[10px] px-1.5 py-0.5 rounded bg-[#1c2128] border border-[#30363d] text-[#58a6ff] uppercase tracking-wide">
                      {r}
                    </span>
                  ))}
                </div>
              </div>
              <button className="w-full text-left px-3 py-2 text-sm text-[#8b949e] hover:bg-[#1c2128] flex items-center gap-2 transition-colors">
                <Settings size={14} /> Preferences
              </button>
              <button
                onClick={logout}
                className="w-full text-left px-3 py-2 text-sm text-[#f85149] hover:bg-[#1c2128] flex items-center gap-2 transition-colors"
              >
                <LogOut size={14} /> Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}

function NavBtn({
  icon, label, onClick, active,
}: { icon: React.ReactNode; label: string; onClick(): void; active?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-1.5 px-2.5 py-1 rounded text-xs transition-colors',
        active
          ? 'bg-[#1c2128] text-[#58a6ff] border border-[#30363d]'
          : 'text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#1c2128]'
      )}
    >
      {icon}
      <span className="hidden sm:block">{label}</span>
    </button>
  )
}
