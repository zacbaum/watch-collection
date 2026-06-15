import { type ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import {
  Home as HomeIcon,
  Watch,
  ListTodo,
  BarChart3,
  Settings as SettingsIcon,
  Plus,
  CalendarDays,
  Cloud,
  CloudOff,
  Flame,
} from 'lucide-react'
// CalendarDays still used by the mobile "Log" footer button below
import { useDataContext } from '../hooks/useData'
import { classNames } from '../lib/utils'

interface LayoutProps {
  children: ReactNode
}

const NAV = [
  { to: '/', label: 'Home', icon: HomeIcon, end: true, mobile: true },
  { to: '/collection', label: 'Collection', icon: Watch, mobile: true },
  { to: '/wishlist', label: 'Wishlist', icon: ListTodo, mobile: true },
  { to: '/analytics', label: 'Analytics', icon: BarChart3, mobile: true },
  { to: '/settings', label: 'Settings', icon: SettingsIcon, mobile: true },
]

export function Layout({ children }: LayoutProps) {
  const { state, syncing } = useDataContext()
  const location = useLocation()

  return (
    <div className="min-h-screen flex flex-col bg-bg text-text">
      <header className="border-b border-border bg-surface sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 h-12 flex items-center gap-4">
          <NavLink to="/" className="font-mono text-sm tracking-tight font-semibold">
            ⌚ watch-collection
          </NavLink>
          <nav className="hidden sm:flex items-center gap-1 ml-2">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                className={({ isActive }) =>
                  classNames(
                    'px-2.5 py-1 text-xs rounded-md flex items-center gap-1.5',
                    isActive
                      ? 'bg-surface-2 text-text font-medium'
                      : 'text-text-muted hover:bg-surface-2 hover:text-text',
                  )
                }
              >
                <n.icon size={14} />
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="flex-1" />
          <StreakIndicator state={state} />
          <SyncIndicator state={state} syncing={syncing} />
          <NavLink
            to="/log"
            className={classNames(
              'inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-md bg-accent text-white hover:opacity-90',
              location.pathname === '/log' && 'opacity-80',
            )}
          >
            <Plus size={14} />
            Log wear
          </NavLink>
        </div>
      </header>

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 pt-4 pb-24 sm:pb-8">
        {children}
      </main>

      <nav className="sm:hidden fixed bottom-0 left-0 right-0 border-t border-border bg-surface z-30 flex justify-around items-center h-14">
        {NAV.filter((n) => n.mobile).map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.end}
            className={({ isActive }) =>
              classNames(
                'flex flex-col items-center gap-0.5 text-[10px] px-2 py-1.5 rounded-md',
                isActive ? 'text-accent font-medium' : 'text-text-muted',
              )
            }
          >
            <n.icon size={18} />
            {n.label}
          </NavLink>
        ))}
        <NavLink
          to="/log"
          className="flex flex-col items-center gap-0.5 text-[10px] px-2 py-1.5 rounded-md text-accent font-medium"
        >
          <CalendarDays size={18} />
          Log
        </NavLink>
      </nav>
    </div>
  )
}

function isoOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function currentStreak(wearLog: Array<{ date: string }>): {
  days: number
  includesToday: boolean
} {
  if (wearLog.length === 0) return { days: 0, includesToday: false }
  const dates = new Set(wearLog.map((e) => e.date))
  const now = new Date()
  const includesToday = dates.has(isoOf(now))
  const cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  if (!includesToday) cursor.setDate(cursor.getDate() - 1)
  let streak = 0
  while (dates.has(isoOf(cursor))) {
    streak++
    cursor.setDate(cursor.getDate() - 1)
  }
  return { days: streak, includesToday }
}

function StreakIndicator({ state }: { state: ReturnType<typeof useDataContext>['state'] }) {
  if (state.kind !== 'ready') return null
  const streak = currentStreak(state.data.wearLog)
  if (streak.days === 0) return null
  return (
    <span
      className={classNames(
        'text-xs flex items-center gap-1 tabular-nums',
        streak.includesToday ? 'text-warning' : 'text-text-muted',
      )}
      title={
        streak.includesToday
          ? `${streak.days}-day logging streak`
          : `${streak.days}-day streak — today not logged yet`
      }
    >
      <Flame size={14} />
      {streak.days}
    </span>
  )
}

function SyncIndicator({
  state,
  syncing,
}: {
  state: ReturnType<typeof useDataContext>['state']
  syncing: boolean
}) {
  if (state.kind === 'unconfigured') {
    return (
      <span className="text-xs text-text-muted flex items-center gap-1">
        <CloudOff size={14} />
        Not connected
      </span>
    )
  }
  if (state.kind === 'error') {
    return (
      <span className="text-xs text-danger flex items-center gap-1" title={state.error}>
        <CloudOff size={14} />
        Error
      </span>
    )
  }
  if (state.kind === 'loading') {
    return (
      <span className="text-xs text-text-muted flex items-center gap-1">
        <Cloud size={14} />
        Loading…
      </span>
    )
  }
  return (
    <span className="text-xs text-text-muted flex items-center gap-1">
      <Cloud size={14} />
      {syncing ? 'Saving…' : 'Synced'}
    </span>
  )
}
