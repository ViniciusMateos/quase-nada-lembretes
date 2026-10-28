import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './lib/auth'
import AppLayout from './components/Layout'
import Login from './pages/Login'
import Chat from './pages/Chat'
import Reminders from './pages/Reminders'
import Calendar from './pages/Calendar'
import Tasks from './pages/Tasks'
import Settings from './pages/Settings'
import { Spinner } from './components/ui'

export default function App() {
  const { user, ready } = useAuth()

  if (!ready) {
    return (
      <div className="h-full grid place-items-center">
        <Spinner className="h-8 w-8" />
      </div>
    )
  }

  if (!user) {
    return (
      <Routes>
        <Route path="*" element={<Login />} />
      </Routes>
    )
  }

  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/chat" element={<Chat />} />
        <Route path="/lembretes" element={<Reminders />} />
        <Route path="/calendario" element={<Calendar />} />
        <Route path="/tarefas" element={<Tasks />} />
        <Route path="/ajustes" element={<Settings />} />
        <Route path="*" element={<Navigate to="/chat" replace />} />
      </Route>
    </Routes>
  )
}
