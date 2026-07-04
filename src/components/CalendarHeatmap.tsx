import { useMemo, useState } from 'react'
import { format, getDay, parseISO, startOfYear, endOfYear, differenceInDays, addDays } from 'date-fns'
import type { Watch, WearLogEntry } from '../types'
import { buildWatchColorMap } from '../lib/palette'
import { wearLogByDate, yearsCovered } from '../lib/wearStats'

interface Props {
  watches: Watch[]
  wearLog: WearLogEntry[]
  /** Optional pre-built color map. If omitted, derived from the watches+wearLog passed in. */
  watchColors?: Map<string, string>
}

const CELL = 12
const GAP = 2
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAY_LABELS = ['', 'Mon', '', 'Wed', '', 'Fri', '']

export function CalendarHeatmap({ watches, wearLog, watchColors }: Props) {
  const years = useMemo(() => yearsCovered(wearLog), [wearLog])
  const [year, setYear] = useState<number | null>(null)
  const activeYear = year ?? years[0] ?? new Date().getFullYear()

  const wearByDate = useMemo(() => wearLogByDate(wearLog), [wearLog])
  const watchById = useMemo(() => new Map(watches.map((w) => [w.id, w])), [watches])
  const colorMap = useMemo(
    () => watchColors ?? buildWatchColorMap(watches, wearLog),
    [watchColors, watches, wearLog],
  )
  // Earliest wear-log date per watch — those cells get a thicker border
  const firstWearByWatch = useMemo(() => {
    const m = new Map<string, string>()
    for (const e of wearLog) {
      const prev = m.get(e.watchId)
      if (!prev || e.date < prev) m.set(e.watchId, e.date)
    }
    return m
  }, [wearLog])
  // Full entry lookup so the tooltip can include location
  const entryByDate = useMemo(() => {
    const m = new Map<string, (typeof wearLog)[number]>()
    for (const e of wearLog) {
      const prev = m.get(e.date)
      // Prefer first-encountered (one watch per day in practice)
      if (!prev) m.set(e.date, e)
    }
    return m
  }, [wearLog])

  const yearStart = startOfYear(new Date(activeYear, 0, 1))
  const yearEnd = endOfYear(new Date(activeYear, 0, 1))

  // Grid starts at the Sunday on or before yearStart
  const gridStart = addDays(yearStart, -getDay(yearStart))
  const totalDays = differenceInDays(yearEnd, gridStart) + 1
  const totalWeeks = Math.ceil(totalDays / 7)

  const cells: Array<{ date: string; col: number; row: number; inYear: boolean }> = []
  for (let i = 0; i < totalWeeks * 7; i++) {
    const d = addDays(gridStart, i)
    const inYear = d.getFullYear() === activeYear
    cells.push({
      date: format(d, 'yyyy-MM-dd'),
      col: Math.floor(i / 7),
      row: i % 7,
      inYear,
    })
  }

  // Month label positions (first column where month changes)
  const monthLabels: Array<{ month: string; col: number }> = []
  let lastMonth = -1
  for (const c of cells) {
    if (!c.inYear || c.row !== 0) continue
    const m = parseISO(c.date).getMonth()
    if (m !== lastMonth) {
      monthLabels.push({ month: MONTHS[m], col: c.col })
      lastMonth = m
    }
  }

  const width = totalWeeks * (CELL + GAP) + 36
  const height = 7 * (CELL + GAP) + 18

  // Tally wears per watch in active year for the legend
  const tallies = useMemo(() => {
    const m = new Map<string, number>()
    for (const e of wearLog) {
      if (parseInt(e.date.slice(0, 4), 10) !== activeYear) continue
      m.set(e.watchId, (m.get(e.watchId) ?? 0) + 1)
    }
    return Array.from(m.entries())
      .map(([id, count]) => ({ watch: watchById.get(id), count }))
      .filter((x) => x.watch)
      .sort((a, b) => b.count - a.count)
  }, [wearLog, activeYear, watchById])

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <div className="flex border border-border rounded-md overflow-hidden text-xs">
          {years.map((y) => (
            <button
              key={y}
              onClick={() => setYear(y)}
              className={
                activeYear === y
                  ? 'px-2 py-1 bg-surface-2 text-text font-medium'
                  : 'px-2 py-1 text-text-muted hover:bg-surface'
              }
            >
              {y}
            </button>
          ))}
        </div>
        <span className="text-xs text-text-muted ml-auto">
          {tallies.reduce((s, t) => s + t.count, 0)} wears in {activeYear}
        </span>
      </div>

      {/* On phones the 53-week grid squeezed into ~350px is unreadable —
          keep a readable minimum width and let it scroll horizontally.
          Desktop still scales to fit. */}
      <div className="w-full overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          width="100%"
          height="auto"
          preserveAspectRatio="xMidYMid meet"
          className="block max-w-none min-w-[560px] sm:max-w-full sm:min-w-0"
        >
          {/* Day-of-week labels */}
          {DAY_LABELS.map((lbl, i) =>
            lbl ? (
              <text
                key={i}
                x={0}
                y={18 + i * (CELL + GAP) + CELL - 2}
                fontSize="9"
                fill="var(--color-text-muted)"
                fontFamily="ui-sans-serif, system-ui"
              >
                {lbl}
              </text>
            ) : null,
          )}
          {/* Month labels */}
          {monthLabels.map((m, i) => (
            <text
              key={i}
              x={32 + m.col * (CELL + GAP)}
              y={10}
              fontSize="9"
              fill="var(--color-text-muted)"
              fontFamily="ui-sans-serif, system-ui"
            >
              {m.month}
            </text>
          ))}
          {/* Cells */}
          {cells.map((c) => {
            const x = 32 + c.col * (CELL + GAP)
            const y = 18 + c.row * (CELL + GAP)
            if (!c.inYear) {
              return <rect key={c.date} x={x} y={y} width={CELL} height={CELL} rx={2} fill="transparent" />
            }
            const watchId = wearByDate.get(c.date)
            const watch = watchId ? watchById.get(watchId) : undefined
            const watchColor = watch ? colorMap.get(watch.id) : undefined
            const fill = watchColor ?? 'var(--color-surface-2)'
            const baseStroke = watchColor ?? 'var(--color-border)'
            const isFirstWear = watchId != null && firstWearByWatch.get(watchId) === c.date

            const parts: string[] = []
            if (watch) parts.push(`${watch.brand} ${watch.model}`)
            else parts.push('no wear')
            const e = entryByDate.get(c.date)
            const loc = e?.location
            if (loc) {
              const locStr = [loc.city, loc.country].filter(Boolean).join(', ')
              if (locStr) parts.push(locStr)
            }
            if (isFirstWear && watch) parts.push('first wear')
            const title = `${c.date} — ${parts.join(' · ')}`
            return (
              <rect
                key={c.date}
                x={x}
                y={y}
                width={CELL}
                height={CELL}
                rx={2}
                fill={fill}
                fillOpacity={watch ? 0.85 : 1}
                stroke={isFirstWear ? 'var(--color-text)' : baseStroke}
                strokeWidth={isFirstWear ? 1.5 : 1}
                strokeOpacity={isFirstWear ? 0.9 : 0.4}
              >
                <title>{title}</title>
              </rect>
            )
          })}
        </svg>
      </div>

      {/* Watch legend */}
      {tallies.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
          {tallies.map(({ watch, count }) =>
            watch ? (
              <span key={watch.id} className="inline-flex items-center gap-1">
                <span
                  className="inline-block w-2.5 h-2.5 rounded-sm"
                  style={{ backgroundColor: colorMap.get(watch.id) }}
                />
                <span className="text-text">{watch.brand}</span>
                <span className="text-text-muted">{watch.model}</span>
                <span className="text-text-subtle">{count}×</span>
              </span>
            ) : null,
          )}
        </div>
      )}
    </div>
  )
}
