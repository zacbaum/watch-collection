import { type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useDataContext } from '../hooks/useData'
import { Empty } from './Empty'

/** Renders children only when data is loaded; otherwise shows appropriate gate state. */
export function Gate({ children }: { children: ReactNode }) {
  const { state, reload } = useDataContext()
  if (state.kind === 'unconfigured') {
    return (
      <Empty
        title="Not connected to your data repo"
        body="Add your GitHub username, data repo, and a personal access token in Settings to load your collection."
        action={
          <Link
            to="/settings"
            className="inline-flex items-center px-3 py-1.5 text-xs rounded-md bg-accent text-white"
          >
            Open Settings
          </Link>
        }
      />
    )
  }
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
