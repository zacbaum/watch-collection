import { type ReactNode } from 'react'

export function Empty({
  title,
  body,
  action,
}: {
  title: string
  body?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="border border-dashed border-border rounded-lg p-8 text-center bg-surface">
      <div className="text-sm font-medium text-text">{title}</div>
      {body && <div className="text-xs text-text-muted mt-1 max-w-md mx-auto">{body}</div>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  )
}
