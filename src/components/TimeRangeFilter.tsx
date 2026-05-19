import { TIME_RANGES, type TimeRange } from '../lib/wearStats'
import { classNames } from '../lib/utils'

export function TimeRangeFilter({
  value,
  onChange,
}: {
  value: TimeRange
  onChange: (v: TimeRange) => void
}) {
  return (
    <div className="inline-flex border border-border rounded-md overflow-hidden text-xs">
      {TIME_RANGES.map((r) => (
        <button
          key={r.key}
          onClick={() => onChange(r.key)}
          className={classNames(
            'px-2.5 py-1 transition-colors',
            value === r.key
              ? 'bg-surface-2 text-text font-medium'
              : 'text-text-muted hover:bg-surface',
          )}
        >
          {r.label}
        </button>
      ))}
    </div>
  )
}
