import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect } from 'react'
import { Loader2 } from 'lucide-react'
import { AppShell } from '@/components/layout/AppShell'
import { LandingPage } from '@/pages/LandingPage'
import { TestEventsPage } from '@/pages/TestEventsPage'
import { WorkspacePage } from '@/pages/WorkspacePage'
import { useAuthStore } from '@/store/authStore'

export default function App() {
  const init = useAuthStore(s => s.init)
  const isLoading = useAuthStore(s => s.isLoading)
  const isAuthenticated = useAuthStore(s => s.isAuthenticated)

  useEffect(() => { init() }, [init])

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-[#0d1117] text-[#6e7681]">
        <Loader2 size={32} className="animate-spin mb-3" />
        <p className="text-sm">Connecting to identity provider...</p>
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-[#0d1117] text-[#6e7681]">
        <p className="text-sm">Authentication failed. Redirecting...</p>
      </div>
    )
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<LandingPage />} />
          <Route path="/test/:testId" element={<TestEventsPage />} />
          <Route path="/workspace/:testId" element={<WorkspacePage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
