import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { Card } from './Card'
import { classNames } from '../lib/utils'

const STORAGE_KEY = 'watch-collection.collapsed.v1'

interface CollapseCtx {
  isOpen: (id: string) => boolean
  toggle: (id: string) => void
  setAll: (open: boolean) => void
  /** Register a section so setAll knows about it. */
  register: (id: string) => void
  /** Total registered sections. Useful for the toolbar count. */
  count: number
  openCount: number
}

const ctx = createContext<CollapseCtx | null>(null)

export function CollapseProvider({
  children,
  defaultOpen = true,
}: {
  children: ReactNode
  defaultOpen?: boolean
}) {
  const [states, setStates] = useState<Record<string, boolean>>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) return JSON.parse(raw) as Record<string, boolean>
    } catch {
      /* ignore */
    }
    return {}
  })
  const registered = useRef(new Set<string>())

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(states))
    } catch {
      /* quota — ignore */
    }
  }, [states])

  const isOpen = useCallback(
    (id: string) => (id in states ? states[id] : defaultOpen),
    [states, defaultOpen],
  )

  const toggle = useCallback(
    (id: string) => {
      setStates((s) => ({ ...s, [id]: !(id in s ? s[id] : defaultOpen) }))
    },
    [defaultOpen],
  )

  const setAll = useCallback((open: boolean) => {
    setStates(() => {
      const next: Record<string, boolean> = {}
      for (const id of registered.current) next[id] = open
      return next
    })
  }, [])

  const register = useCallback((id: string) => {
    registered.current.add(id)
  }, [])

  const openCount = useMemo(
    () =>
      Array.from(registered.current).filter((id) =>
        id in states ? states[id] : defaultOpen,
      ).length,
    [states, defaultOpen],
  )

  const value = useMemo<CollapseCtx>(
    () => ({
      isOpen,
      toggle,
      setAll,
      register,
      count: registered.current.size,
      openCount,
    }),
    [isOpen, toggle, setAll, register, openCount],
  )

  return <ctx.Provider value={value}>{children}</ctx.Provider>
}

export function useCollapseToolbar() {
  const c = useContext(ctx)
  if (!c) throw new Error('useCollapseToolbar outside CollapseProvider')
  return c
}

/**
 * Card with a click-to-collapse title. Falls back to a plain Card if no
 * CollapseProvider is in the tree.
 */
export function CollapsibleCard({
  id,
  title,
  action,
  children,
  className,
  padding = true,
}: {
  id: string
  title: ReactNode
  action?: ReactNode
  children: ReactNode
  className?: string
  padding?: boolean
}) {
  const c = useContext(ctx)
  useEffect(() => {
    c?.register(id)
  }, [c, id])

  if (!c) {
    return (
      <Card title={title} action={action} className={className} padding={padding}>
        {children}
      </Card>
    )
  }

  const open = c.isOpen(id)
  const titleNode = (
    <button
      type="button"
      onClick={() => c.toggle(id)}
      className="flex items-center gap-1.5 -mx-2 px-2 py-1 rounded hover:bg-surface-2 transition-colors text-text-muted hover:text-text"
      aria-expanded={open}
    >
      {open ? (
        <ChevronDown size={12} className="shrink-0" />
      ) : (
        <ChevronRight size={12} className="shrink-0" />
      )}
      <span className="text-xs font-medium uppercase tracking-wide">{title}</span>
    </button>
  )

  return (
    <div
      className={classNames(
        'border border-border rounded-lg bg-surface flex flex-col',
        open ? 'h-full' : '',
        className,
      )}
    >
      <div className="flex items-center justify-between px-2 sm:px-3 h-10 shrink-0">
        {titleNode}
        {action && <div>{action}</div>}
      </div>
      {open && (
        <div className={classNames('border-t border-border', padding && 'p-3 sm:p-4', 'flex-1 flex flex-col min-h-0')}>
          {children}
        </div>
      )}
    </div>
  )
}

/** Toolbar with Expand all / Collapse all buttons. */
export function CollapseToolbar() {
  const c = useContext(ctx)
  if (!c) return null
  const allOpen = c.openCount === c.count && c.count > 0
  return (
    <div className="flex items-center gap-2 text-xs text-text-muted">
      <button
        type="button"
        onClick={() => c.setAll(true)}
        disabled={allOpen}
        className="px-2 py-1 rounded-md border border-border hover:bg-surface-2 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Expand all
      </button>
      <button
        type="button"
        onClick={() => c.setAll(false)}
        disabled={c.openCount === 0}
        className="px-2 py-1 rounded-md border border-border hover:bg-surface-2 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Collapse all
      </button>
    </div>
  )
}
