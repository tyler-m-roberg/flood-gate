import { Outlet, useLocation } from 'react-router-dom'
import { TopBar } from './TopBar'

export function AppShell() {
  const location = useLocation()
  const isWorkspace = location.pathname.startsWith('/workspace')

  return (
    <div className="flex flex-col h-screen bg-[#0d1117] overflow-hidden">
      <TopBar />
      <main className={`flex-1 overflow-hidden ${isWorkspace ? '' : 'overflow-y-auto'}`}>
        <Outlet />
      </main>
    </div>
  )
}
