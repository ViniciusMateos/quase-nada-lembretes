import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Bell,
  CalendarDays,
  ListChecks,
  MessageCircle,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  LogOut,
  Menu,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '../lib/utils'
import { useAuth } from '../lib/auth'
import { Dog } from './ui'

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
}

const NAV: NavItem[] = [
  { to: '/chat', label: 'Chat', icon: MessageCircle },
  { to: '/lembretes', label: 'Lembretes', icon: Bell },
  { to: '/calendario', label: 'Calendário', icon: CalendarDays },
  { to: '/tarefas', label: 'Tarefas', icon: ListChecks },
  { to: '/ajustes', label: 'Ajustes', icon: Settings },
]

function NavRow({ item, collapsed, onNavigate }: { item: NavItem; collapsed: boolean; onNavigate?: () => void }) {
  const Icon = item.icon
  return (
    <NavLink
      to={item.to}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          'group relative flex items-center h-11 rounded-xl transition-colors',
          collapsed ? 'justify-center px-0 mx-auto w-11' : 'px-3 gap-3',
          isActive ? 'text-white' : 'text-txt-dim hover:text-txt hover:bg-surface2',
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <motion.div
              layoutId="nav-active"
              className="absolute inset-0 rounded-xl bg-primary shadow-glow"
              transition={{ type: 'spring', stiffness: 400, damping: 32 }}
            />
          )}
          <Icon className="relative h-5 w-5 shrink-0" strokeWidth={2.2} />
          {!collapsed && <span className="relative text-sm font-semibold">{item.label}</span>}
          {collapsed && (
            <span className="pointer-events-none absolute left-full ml-3 px-2 py-1 rounded-md bg-surface2 border border-border text-xs text-txt opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50">
              {item.label}
            </span>
          )}
        </>
      )}
    </NavLink>
  )
}

function SidebarContent({
  collapsed,
  onToggle,
  onNavigate,
}: {
  collapsed: boolean
  onToggle?: () => void
  onNavigate?: () => void
}) {
  const { user, logout } = useAuth()
  const initials = (user?.name || '?').trim().slice(0, 1).toUpperCase()
  return (
    <div className="flex h-full flex-col bg-surface/60 backdrop-blur-xl">
      {/* Marca */}
      <div className={cn('flex items-center h-16 shrink-0', collapsed ? 'justify-center' : 'px-4 gap-2.5')}>
        <div className="h-9 w-9 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
          <Dog className="h-6 w-6" />
        </div>
        {!collapsed && (
          <div className="leading-tight">
            <p className="font-extrabold text-txt text-[15px]">Quase Nada</p>
            <p className="text-[11px] text-txt-dim -mt-0.5">Lembretes · painel</p>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2.5 py-2 space-y-1">
        {NAV.map((item) => (
          <NavRow key={item.to} item={item} collapsed={collapsed} onNavigate={onNavigate} />
        ))}
      </nav>

      {/* Usuário + sair */}
      <div className="p-2.5 border-t border-border space-y-1">
        <div className={cn('flex items-center rounded-xl', collapsed ? 'justify-center' : 'px-2 gap-2.5 py-1.5')}>
          <div className="h-8 w-8 rounded-full bg-primary/20 text-primary-light flex items-center justify-center font-bold text-sm shrink-0">
            {initials}
          </div>
          {!collapsed && (
            <div className="min-w-0 leading-tight">
              <p className="text-sm font-semibold text-txt truncate">{user?.name}</p>
              <p className="text-[11px] text-txt-dim truncate">{user?.email}</p>
            </div>
          )}
        </div>
        <button
          onClick={logout}
          className={cn(
            'flex items-center h-10 rounded-xl text-txt-dim hover:text-danger hover:bg-danger/10 transition-colors w-full',
            collapsed ? 'justify-center' : 'px-3 gap-3',
          )}
        >
          <LogOut className="h-5 w-5 shrink-0" />
          {!collapsed && <span className="text-sm font-semibold">Sair</span>}
        </button>
      </div>

      {/* Toggle (só desktop) */}
      {onToggle && (
        <button
          onClick={onToggle}
          className="hidden md:flex items-center justify-center h-10 border-t border-border text-txt-faint hover:text-txt transition-colors"
          title={collapsed ? 'Expandir' : 'Recolher'}
        >
          {collapsed ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
        </button>
      )}
    </div>
  )
}

export default function AppLayout() {
  const location = useLocation()
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('qn_sidebar') === '1')
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => localStorage.setItem('qn_sidebar', collapsed ? '1' : '0'), [collapsed])
  useEffect(() => setMobileOpen(false), [location.pathname])

  const current = NAV.find((n) => location.pathname.startsWith(n.to))

  return (
    <div className="flex h-full w-full overflow-hidden">
      {/* Sidebar desktop */}
      <motion.aside
        animate={{ width: collapsed ? 76 : 248 }}
        transition={{ type: 'spring', stiffness: 300, damping: 34 }}
        className="hidden md:block shrink-0 border-r border-border"
      >
        <SidebarContent collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
      </motion.aside>

      {/* Sidebar mobile (drawer) */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              className="fixed inset-0 z-40 bg-black/60 md:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileOpen(false)}
            />
            <motion.aside
              className="fixed left-0 top-0 bottom-0 z-50 w-64 border-r border-border md:hidden"
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: 'spring', stiffness: 320, damping: 34 }}
            >
              <SidebarContent collapsed={false} onNavigate={() => setMobileOpen(false)} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Conteúdo */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Topbar mobile */}
        <header className="md:hidden flex items-center gap-3 h-14 px-4 border-b border-border shrink-0">
          <button
            onClick={() => setMobileOpen(true)}
            className="h-9 w-9 flex items-center justify-center rounded-lg text-txt-dim hover:bg-surface2"
          >
            <Menu className="h-5 w-5" />
          </button>
          <span className="font-bold text-txt">{current?.label || 'Quase Nada'}</span>
        </header>

        <main className="flex-1 overflow-y-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="h-full"
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  )
}
