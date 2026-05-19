import type { WatchStatus } from '../types'
import { classNames } from '../lib/utils'

const STYLES: Record<WatchStatus, string> = {
  owned: 'bg-accent-soft text-accent border-accent/30',
  sold: 'bg-surface-2 text-sold border-border-strong',
  gifted: 'bg-gifted/10 text-gifted border-gifted/30',
}

const LABELS: Record<WatchStatus, string> = {
  owned: 'Owned',
  sold: 'Sold',
  gifted: 'Gifted',
}

export function StatusBadge({ status, size = 'sm' }: { status: WatchStatus; size?: 'sm' | 'xs' }) {
  return (
    <span
      className={classNames(
        'inline-flex items-center border rounded-full font-medium',
        size === 'xs' ? 'text-[10px] px-1.5 py-px' : 'text-[11px] px-2 py-0.5',
        STYLES[status],
      )}
    >
      {LABELS[status]}
    </span>
  )
}
