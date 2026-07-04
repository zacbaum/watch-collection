import { type ReactNode } from 'react'
import { classNames } from '../lib/utils'

interface CardProps {
  children: ReactNode
  className?: string
  title?: ReactNode
  action?: ReactNode
  padding?: boolean
}

export function Card({ children, className, title, action, padding = true }: CardProps) {
  return (
    <div
      className={classNames(
        'border border-border rounded-lg bg-surface flex flex-col h-full',
        className,
      )}
    >
      {(title || action) && (
        <div className="flex items-center justify-between gap-2 px-4 h-10 border-b border-border shrink-0">
          <div className="text-xs font-medium text-text-muted truncate min-w-0">
            {title}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      <div className={classNames(padding && 'p-3 sm:p-4', 'flex-1 flex flex-col min-h-0')}>{children}</div>
    </div>
  )
}

export function Stat({
  label,
  value,
  sub,
}: {
  label: string
  value: ReactNode
  sub?: ReactNode
}) {
  return (
    <div className="border border-border rounded-lg p-4 bg-surface">
      <div className="text-xs text-text-muted">{label}</div>
      <div className="mt-1 text-3xl font-semibold text-text tabular-nums">{value}</div>
      {sub && <div className="text-xs text-text-muted mt-0.5">{sub}</div>}
    </div>
  )
}
