import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { LandingPage } from '@/pages/LandingPage'
import { TestEventsPage } from '@/pages/TestEventsPage'
import { WorkspacePage } from '@/pages/WorkspacePage'

export default function App() {
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
