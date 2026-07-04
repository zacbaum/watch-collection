import { type ReactNode } from 'react'
import { useDataContext } from '../hooks/useData'
import { Empty } from './Empty'

/** Renders children only when data is loaded; otherwise shows appropriate gate state. */
export function Gate({ children }: { children: ReactNode }) {
  const { state, reload } = useDataContext()
  if (state.kind === 'loading') {
    return <div className="text-sm text-text-muted">Loading…</div>
  }
  if (state.kind === 'error') {
    return (
      <Empty
        title="Couldn't load data"
        body={state.error}
        action={
          <button
            onClick={() => void reload()}
            className="inline-flex items-center px-3 py-1.5 text-xs rounded-md bg-surface-2 border border-border"
          >
            Try again
          </button>
        }
      />
    )
  }
  return <>{children}</>
}
