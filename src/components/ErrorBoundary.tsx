import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}
interface State {
  error: Error | null
}

/** Route-level crash guard. Without it, one render error white-screens the
 *  whole installed app with no console and no visible refresh. The Layout
 *  remounts this per navigation (keyed by pathname), so leaving a broken
 *  page automatically resets the boundary. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="border border-border rounded-lg bg-surface p-4 text-sm space-y-2">
          <div className="font-medium text-text">Something went wrong on this page.</div>
          <div className="text-xs text-text-muted break-words">
            {this.state.error.message}
          </div>
          <div className="text-xs text-text-muted">
            Your data is safe on-device. Try another tab, or reload:
          </div>
          <button
            onClick={() => window.location.reload()}
            className="px-3 py-1.5 text-xs rounded-md bg-accent text-white"
          >
            Reload app
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
