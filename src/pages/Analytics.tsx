import { useEffect, useMemo, useState } from 'react'

function useIsNarrow(breakpoint = 640): boolean {
  const [narrow, setNarrow] = useState(
    typeof window !== 'undefined' ? window.innerWidth < breakpoint : false,
  )
  useEffect(() => {
    const handler = () => setNarrow(window.innerWidth < breakpoint)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [breakpoint])
  return narrow
}
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  CartesianGrid,
  LineChart,
  Line,
  ScatterChart,
  Scatter,
  ComposedChart,
  PieChart,
  Pie,
  Legend,
} from 'recharts'
import { MapContainer, TileLayer, CircleMarker, Tooltip as LeafletTooltip } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { Gate } from '../components/Gate'
import { Card } from '../components/Card'
import { Empty } from '../components/Empty'
import { CalendarHeatmap } from '../components/CalendarHeatmap'
import { TimeRangeFilter } from '../components/TimeRangeFilter'
import { useData } from '../hooks/useData'
import type { Watch, WearLogEntry } from '../types'
import { formatGbp } from '../lib/utils'
import { lookupCoords } from '../lib/cityCoords'
import { buildWatchColorMap } from '../lib/palette'
import {
  filterWearLog,
  fmt,
  monthKeysInRange,
  perWatchStreaks,
  rangeLabel,
  rangeSince,
  rotationDiversityByMonth,
  rotationScore,
  sellabilityRanking,
  watchShareByMonth,
  weekKeyOf,
  weekKeysInRange,
  yearKeysInRange,
  type TimeRange,
} from '../lib/wearStats'
import { format, parseISO } from 'date-fns'

export function Analytics() {
  return (
    <Gate>
      <AnalyticsInner />
    </Gate>
  )
}

function AnalyticsInner() {
  const data = useData()
  const owned = useMemo(() => data.watches.filter((w) => w.status === 'owned'), [data.watches])
  const [range, setRange] = useState<TimeRange>('3y')
  const since = useMemo(() => rangeSince(range), [range])
  const filteredWearLog = useMemo(
    () => filterWearLog(data.wearLog, since),
    [data.wearLog, since],
  )
  // Stable per-watch color map — same color in every chart across the page.
  const watchColors = useMemo(
    () => buildWatchColorMap(data.watches, data.wearLog),
    [data.watches, data.wearLog],
  )

  if (data.wearLog.length === 0 && owned.length === 0) {
    return <Empty title="No data yet" body="Import your wear log to see analytics." />
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-semibold">Analytics</h1>
        <TimeRangeFilter value={range} onChange={setRange} />
      </div>

      {/* Compact: top streak + most stale owned watch + rotation metrics */}
      <HeadlineStrip
        watches={data.watches}
        wearLog={data.wearLog}
        filteredWearLog={filteredWearLog}
        rangeLabel={rangeLabel(range)}
        watchColors={watchColors}
      />

      {/* Always all-time */}
      <Card title="Wear calendar">
        <CalendarHeatmap
          watches={data.watches}
          wearLog={data.wearLog}
          watchColors={watchColors}
        />
      </Card>

      {/* Filtered by timeframe */}
      <WatchShareCard
        watches={data.watches}
        wearLog={filteredWearLog}
        watchColors={watchColors}
        rangeLabel={rangeLabel(range)}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <WearDistributionCard
          watches={data.watches}
          wearLog={filteredWearLog}
          watchColors={watchColors}
        />
        <RotationDiversityCard wearLog={filteredWearLog} />
        {/* CPW line chart — window-scaled X axis, cumulative wears use full history */}
        <CostPerWearOverTimeCard
          watches={data.watches}
          wearLog={data.wearLog}
          since={since}
          watchColors={watchColors}
        />
        <WearsVsSpendCard
          watches={data.watches}
          wearLog={data.wearLog}
          watchColors={watchColors}
        />
        <CashFlowCard watches={data.watches} />
        <WatchFlowCard watches={data.watches} />
      </div>

      <SellabilityCard
        watches={data.watches}
        wearLog={data.wearLog}
        watchColors={watchColors}
      />

      <WatchYearHeatmapCard
        watches={data.watches}
        wearLog={data.wearLog}
        watchColors={watchColors}
      />

      <TravelCompanionCard
        watches={data.watches}
        wearLog={data.wearLog}
        watchColors={watchColors}
      />

      {/* Always all-time */}
      <TravelMapCard wearLog={data.wearLog} />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
function HeadlineStrip({
  watches,
  wearLog,
  filteredWearLog,
  rangeLabel,
  watchColors,
}: {
  watches: Watch[]
  wearLog: WearLogEntry[]
  filteredWearLog: WearLogEntry[]
  rangeLabel: string
  watchColors: Map<string, string>
}) {
  const { topStreak, mostStale, rotation } = useMemo(() => {
    const streaks = perWatchStreaks(watches, wearLog).filter((s) => s.totalWears > 0)
    const top = streaks.sort((a, b) => b.longestStreak - a.longestStreak)[0]

    // Most stale owned watch: largest days since last worn, status === 'owned'
    const ownedLastWorn = new Map<string, string>()
    for (const e of wearLog) {
      const w = watches.find((x) => x.id === e.watchId)
      if (!w || w.status !== 'owned') continue
      const prev = ownedLastWorn.get(e.watchId)
      if (!prev || e.date > prev) ownedLastWorn.set(e.watchId, e.date)
    }
    const today = new Date()
    let stalest: { watchId: string; lastWorn: string; daysSinceWorn: number } | null = null
    for (const w of watches.filter((x) => x.status === 'owned')) {
      const last = ownedLastWorn.get(w.id)
      const days = last
        ? Math.floor((today.getTime() - new Date(last + 'T00:00:00Z').getTime()) / 86_400_000)
        : Number.MAX_SAFE_INTEGER
      if (!stalest || days > stalest.daysSinceWorn) {
        stalest = { watchId: w.id, lastWorn: last ?? '', daysSinceWorn: days }
      }
    }

    const rotation = rotationScore(filteredWearLog)
    return { topStreak: top, mostStale: stalest, rotation }
  }, [watches, wearLog, filteredWearLog])

  const watchOf = (id: string) => watches.find((w) => w.id === id)

  const Chip = ({
    label,
    value,
    sub,
    watch,
    explanation,
  }: {
    label: string
    value: string
    sub?: string
    watch?: Watch
    explanation?: string
  }) => (
    <div
      className="border border-border rounded-lg px-3 py-2 bg-surface"
      title={explanation}
    >
      <div className="text-[10px] uppercase tracking-wide text-text-muted flex items-center gap-1">
        <span>{label}</span>
        {explanation && (
          <span
            className="inline-flex items-center justify-center w-3 h-3 rounded-full border border-text-subtle text-text-subtle text-[8px] leading-none cursor-help"
            aria-label={explanation}
          >
            i
          </span>
        )}
      </div>
      <div className="mt-0.5 flex items-baseline gap-1.5">
        <span className="text-lg font-semibold tabular-nums">{value}</span>
        {watch && (
          <span className="inline-flex items-center gap-1 truncate min-w-0">
            <span
              className="inline-block w-2 h-2 rounded-sm shrink-0"
              style={{ backgroundColor: watchColors.get(watch.id) }}
            />
            <span className="text-xs text-text truncate">{watch.brand}</span>
            <span className="text-xs text-text-muted truncate">{watch.model}</span>
          </span>
        )}
      </div>
      {sub && <div className="text-[10px] text-text-subtle mt-0.5">{sub}</div>}
    </div>
  )

  if (!topStreak && !mostStale && rotation.score == null) return null

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
      {rotation.score != null && (
        <Chip
          label={`Rotation score (${rangeLabel})`}
          value={`${rotation.score}/100`}
          sub={`100 = perfectly even · 0 = one watch`}
          explanation={
            `Normalized Shannon entropy of your wear distribution. ` +
            `100 means you wore every watch in rotation an equal number ` +
            `of times. 0 means one single watch was worn every day. ` +
            `Computed from ${rotation.totalWears} wears across ` +
            `${rotation.uniqueWatches} watch${rotation.uniqueWatches === 1 ? '' : 'es'} ` +
            `within the ${rangeLabel} window.`
          }
        />
      )}
      {rotation.score != null && (
        <Chip
          label={`Effective rotation (${rangeLabel})`}
          value={rotation.effective.toFixed(1)}
          sub="≈ watches in even use"
          explanation={
            `If your wear pattern were a perfectly even rotation between ` +
            `N watches, you'd see this many. So ${rotation.effective.toFixed(1)} ` +
            `means your usage spreads as if you rotate ${rotation.effective.toFixed(1)} ` +
            `watches evenly — lower than ${rotation.uniqueWatches} (the actual ` +
            `unique watches worn) when one or two pieces dominate. ` +
            `Mathematically: e^entropy.`
          }
        />
      )}
      {topStreak && (
        <Chip
          label="Longest streak"
          value={`${topStreak.longestStreak}d`}
          watch={watchOf(topStreak.watchId)}
          sub={
            topStreak.longestStreakRange
              ? `from ${fmt(topStreak.longestStreakRange.from)}`
              : undefined
          }
          explanation="Longest run of consecutive days the same watch was worn (all-time, across every watch in your collection)."
        />
      )}
      {mostStale && (
        <Chip
          label="Most stale (owned)"
          value={
            mostStale.daysSinceWorn === Number.MAX_SAFE_INTEGER
              ? 'never'
              : `${mostStale.daysSinceWorn}d`
          }
          watch={watchOf(mostStale.watchId)}
          sub={mostStale.lastWorn ? `last on ${fmt(mostStale.lastWorn)}` : undefined}
          explanation="Currently-owned watch that's gone the longest without being worn. Sold and gifted-out watches aren't considered."
        />
      )}
    </div>
  )
}


function WearDistributionCard({
  watches,
  wearLog,
  watchColors,
}: {
  watches: Watch[]
  wearLog: WearLogEntry[]
  watchColors: Map<string, string>
}) {
  const [includeInactive, setIncludeInactive] = useState(false)
  const counts = useMemo(() => {
    const m = new Map<string, number>()
    for (const e of wearLog) m.set(e.watchId, (m.get(e.watchId) ?? 0) + 1)
    return Array.from(m.entries())
      .map(([id, count]) => {
        const w = watches.find((x) => x.id === id)
        const inactive = w?.status === 'sold' || w?.status === 'gifted'
        return {
          id,
          name: w ? `${w.brand} ${w.model}${inactive ? ` (${w.status})` : ''}` : 'Unknown',
          value: count,
          color: watchColors.get(id) ?? '#cccccc',
          inactive,
        }
      })
      .filter((c) => includeInactive || !c.inactive)
      .sort((a, b) => b.value - a.value)
  }, [watches, wearLog, watchColors, includeInactive])

  const totalWears = counts.reduce((s, c) => s + c.value, 0)

  return (
    <Card
      title="Most worn"
      action={
        <label className="text-[11px] text-text-muted inline-flex items-center gap-1.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={includeInactive}
            onChange={(e) => setIncludeInactive(e.target.checked)}
            className="accent-accent"
          />
          Include sold/gifted
        </label>
      }
    >
      {counts.length === 0 ? (
        <div className="text-xs text-text-muted">No wears in this window.</div>
      ) : (
        <div className="flex-1 min-h-72">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={counts}
                dataKey="value"
                nameKey="name"
                innerRadius={50}
                outerRadius={100}
                paddingAngle={1}
                isAnimationActive={false}
              >
                {counts.map((c) => (
                  <Cell
                    key={c.id}
                    fill={c.color}
                    fillOpacity={c.inactive ? 0.5 : 1}
                    stroke="#fff"
                    strokeWidth={1}
                  />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ fontSize: 11 }}
                formatter={(v, name) => [
                  `${v} wears (${totalWears > 0 ? Math.round((Number(v) / totalWears) * 100) : 0}%)`,
                  name,
                ]}
              />
              <Legend
                wrapperStyle={{ fontSize: 11 }}
                formatter={(value) => <span className="text-text-muted">{value}</span>}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  )
}

function CashFlowCard({ watches }: { watches: Watch[] }) {
  const rows = useMemo(() => {
    const yearMap = new Map<string, { spend: number; proceeds: number }>()
    const ensure = (y: string) => {
      const e = yearMap.get(y) ?? { spend: 0, proceeds: 0 }
      yearMap.set(y, e)
      return e
    }
    for (const w of watches) {
      // Outflows: acquisitions, excluding gifts
      if (!w.wasGift && w.acquisitionDate && (w.acquisitionPriceGbp ?? 0) > 0) {
        ensure(w.acquisitionDate.slice(0, 4)).spend += w.acquisitionPriceGbp!
      }
      // Inflows: sales (count even for previously gifted watches if you sold them)
      if (w.saleDate && (w.salePriceGbp ?? 0) > 0) {
        ensure(w.saleDate.slice(0, 4)).proceeds += w.salePriceGbp!
      }
    }
    const sorted = Array.from(yearMap.entries())
      .map(([year, { spend, proceeds }]) => ({
        year,
        spend,
        // Negative so it plots below the axis
        proceeds: -proceeds,
        // Keep absolute for tooltip readability
        proceedsAbs: proceeds,
      }))
      .sort((a, b) => a.year.localeCompare(b.year))
    // Fill gap years with zeros so the x-axis shows a continuous timescale
    if (sorted.length === 0) return sorted
    const minY = parseInt(sorted[0].year, 10)
    const maxY = Math.max(
      parseInt(sorted[sorted.length - 1].year, 10),
      new Date().getFullYear(),
    )
    const byYear = new Map(sorted.map((r) => [r.year, r]))
    return yearKeysInRange(minY, maxY).map(
      (y) => byYear.get(y) ?? { year: y, spend: 0, proceeds: 0, proceedsAbs: 0 },
    )
  }, [watches])

  const hasAny = rows.some((r) => r.spend > 0 || r.proceedsAbs > 0)

  return (
    <Card title="Cash flow per year (GBP) · purchases above, sales below">
      {!hasAny ? (
        <div className="text-xs text-text-muted">
          No priced acquisitions or sales recorded.
        </div>
      ) : (
        <div className="flex-1 min-h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} stackOffset="sign">
              <CartesianGrid stroke="#f4f4f3" />
              <XAxis dataKey="year" fontSize={10} />
              <YAxis
                fontSize={10}
                tickFormatter={(v) => `£${(Math.abs(v) / 1000).toFixed(0)}k`}
              />
              <Tooltip
                contentStyle={{ fontSize: 11 }}
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null
                  const d = payload[0].payload as (typeof rows)[0]
                  const net = d.spend - d.proceedsAbs
                  return (
                    <div className="bg-bg border border-border rounded px-2 py-1 text-[11px]">
                      <div className="font-medium mb-0.5">{String(label)}</div>
                      <div className="text-danger">
                        − {formatGbp(d.spend)} spent
                      </div>
                      <div className="text-success">
                        + {formatGbp(d.proceedsAbs)} received
                      </div>
                      <div className="text-text-muted mt-0.5">
                        Net: {net > 0 ? '−' : net < 0 ? '+' : ''}
                        {formatGbp(Math.abs(net))}
                      </div>
                    </div>
                  )
                }}
              />
              <Bar dataKey="spend" stackId="cash" fill="#b91c1c" radius={[4, 4, 0, 0]} />
              <Bar dataKey="proceeds" stackId="cash" fill="#15803d" radius={[0, 0, 4, 4]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  )
}

function WatchFlowCard({ watches }: { watches: Watch[] }) {
  const rows = useMemo(() => {
    const yearMap = new Map<
      string,
      { bought: number; giftedIn: number; sold: number; giftedOut: number }
    >()
    const ensure = (y: string) => {
      const e = yearMap.get(y) ?? { bought: 0, giftedIn: 0, sold: 0, giftedOut: 0 }
      yearMap.set(y, e)
      return e
    }
    for (const w of watches) {
      if (w.acquisitionDate) {
        const y = w.acquisitionDate.slice(0, 4)
        if (w.wasGift) ensure(y).giftedIn += 1
        else ensure(y).bought += 1
      }
      if (w.status === 'sold' && w.saleDate) {
        ensure(w.saleDate.slice(0, 4)).sold += 1
      }
      if (w.status === 'gifted' && w.giftedDate) {
        ensure(w.giftedDate.slice(0, 4)).giftedOut += 1
      }
    }
    const sortedActivity = Array.from(yearMap.entries())
      .map(([year, c]) => ({
        year,
        bought: c.bought,
        giftedIn: c.giftedIn,
        // Negative so they plot below the axis
        soldNeg: -c.sold,
        giftedOutNeg: -c.giftedOut,
        sold: c.sold,
        giftedOut: c.giftedOut,
      }))
      .sort((a, b) => a.year.localeCompare(b.year))

    if (sortedActivity.length === 0) return sortedActivity.map((r) => ({ ...r, netTotal: 0 }))

    // Fill gap years with zeros so the x-axis shows a continuous timescale
    // and the cumulative line stays flat through periods with no activity.
    const minY = parseInt(sortedActivity[0].year, 10)
    const maxY = Math.max(
      parseInt(sortedActivity[sortedActivity.length - 1].year, 10),
      new Date().getFullYear(),
    )
    const byYear = new Map(sortedActivity.map((r) => [r.year, r]))
    const filled = yearKeysInRange(minY, maxY).map(
      (y) =>
        byYear.get(y) ?? {
          year: y,
          bought: 0,
          giftedIn: 0,
          soldNeg: 0,
          giftedOutNeg: 0,
          sold: 0,
          giftedOut: 0,
        },
    )

    // Running net (currently in collection at end of each year)
    let cum = 0
    return filled.map((r) => {
      cum += r.bought + r.giftedIn - r.sold - r.giftedOut
      return { ...r, netTotal: cum }
    })
  }, [watches])

  const hasAny = rows.some(
    (r) => r.bought > 0 || r.giftedIn > 0 || r.sold > 0 || r.giftedOut > 0,
  )
  const undatedGifts = useMemo(
    () => watches.filter((w) => w.status === 'gifted' && !w.giftedDate),
    [watches],
  )

  // Colors: bought = success green, sold = danger red, gifted (either
  // direction) = gifted purple — direction is conveyed by axis position.
  const C_BOUGHT = '#15803d'
  const C_SOLD = '#b91c1c'
  const C_GIFT = '#7c3aed'

  return (
    <Card title="Watches in vs out per year · bought/gifted above, sold/gifted below">
      {!hasAny ? (
        <div className="text-xs text-text-muted">
          No acquisition or disposal dates recorded.
        </div>
      ) : (
        <>
          <div className="flex-1 min-h-56">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={rows} stackOffset="sign">
                <CartesianGrid stroke="#f4f4f3" />
                <XAxis dataKey="year" fontSize={10} />
                <YAxis fontSize={10} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ fontSize: 11 }}
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null
                    const d = payload[0].payload as (typeof rows)[0]
                    const yearNet = d.bought + d.giftedIn - d.sold - d.giftedOut
                    return (
                      <div className="bg-bg border border-border rounded px-2 py-1 text-[11px]">
                        <div className="font-medium mb-0.5">{String(label)}</div>
                        {d.bought > 0 && (
                          <div className="text-success">+ {d.bought} bought</div>
                        )}
                        {d.giftedIn > 0 && (
                          <div className="text-gifted">+ {d.giftedIn} gifted in</div>
                        )}
                        {d.sold > 0 && (
                          <div className="text-danger">− {d.sold} sold</div>
                        )}
                        {d.giftedOut > 0 && (
                          <div className="text-gifted">− {d.giftedOut} gifted out</div>
                        )}
                        <div className="text-text-muted mt-0.5">
                          Year net: {yearNet > 0 ? '+' : ''}
                          {yearNet}
                        </div>
                        <div className="text-text font-medium">
                          Collection size: {d.netTotal}
                        </div>
                      </div>
                    )
                  }}
                />
                <Bar dataKey="bought" stackId="flow" fill={C_BOUGHT} />
                <Bar dataKey="giftedIn" stackId="flow" fill={C_GIFT} />
                <Bar dataKey="soldNeg" stackId="flow" fill={C_SOLD} />
                <Bar dataKey="giftedOutNeg" stackId="flow" fill={C_GIFT} />
                <Line
                  type="monotone"
                  dataKey="netTotal"
                  stroke="#1c1917"
                  strokeWidth={2}
                  dot={{ r: 3, fill: '#1c1917', stroke: '#1c1917' }}
                  isAnimationActive={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
            <span className="inline-flex items-center gap-1">
              <span
                className="inline-block w-2.5 h-2.5 rounded-sm"
                style={{ backgroundColor: C_BOUGHT }}
              />
              <span className="text-text-muted">Bought</span>
            </span>
            <span className="inline-flex items-center gap-1">
              <span
                className="inline-block w-2.5 h-2.5 rounded-sm"
                style={{ backgroundColor: C_GIFT }}
              />
              <span className="text-text-muted">Gifted (in or out)</span>
            </span>
            <span className="inline-flex items-center gap-1">
              <span
                className="inline-block w-2.5 h-2.5 rounded-sm"
                style={{ backgroundColor: C_SOLD }}
              />
              <span className="text-text-muted">Sold</span>
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="inline-block w-3 h-px bg-text" />
              <span className="text-text-muted">Collection size</span>
            </span>
          </div>
          {undatedGifts.length > 0 && (
            <div className="text-[11px] text-text-muted mt-2">
              {undatedGifts.length} gifted-out watch
              {undatedGifts.length === 1 ? '' : 'es'} missing a giftedDate — not
              shown ({undatedGifts.map((w) => `${w.brand} ${w.model}`).join(', ')})
            </div>
          )}
        </>
      )}
    </Card>
  )
}

function CostPerWearOverTimeCard({
  watches,
  wearLog,
  since,
  watchColors,
}: {
  watches: Watch[]
  wearLog: WearLogEntry[]
  /** When non-null, only months >= this date are shown on the X axis. The
   *  cumulative wear count still accumulates from the watch's first wear so
   *  CPW values stay accurate. */
  since: string | null
  watchColors: Map<string, string>
}) {
  const [includeInactive, setIncludeInactive] = useState(false)
  const { rows, eligible, yearTicks } = useMemo(() => {
    const eligible = watches.filter(
      (w) =>
        (w.acquisitionPriceGbp ?? 0) > 0 &&
        (includeInactive || (w.status !== 'sold' && w.status !== 'gifted')),
    )
    if (eligible.length === 0 || wearLog.length === 0)
      return { rows: [], eligible: [], yearTicks: [] as string[] }

    const sortedLog = [...wearLog].sort((a, b) => a.date.localeCompare(b.date))
    const minDate = sortedLog[0].date
    const todayIso = new Date().toISOString().slice(0, 10)
    const maxDate = sortedLog[sortedLog.length - 1].date > todayIso
      ? sortedLog[sortedLog.length - 1].date
      : todayIso
    // Compute over the full week range so the cumulative count is honest
    const allWeeks = weekKeysInRange(minDate, maxDate)

    // Per-watch weekly wear count (in-week)
    const perWatchWeek = new Map<string, Map<string, number>>()
    for (const w of eligible) perWatchWeek.set(w.id, new Map())
    for (const e of sortedLog) {
      const m = perWatchWeek.get(e.watchId)
      if (!m) continue
      const wk = weekKeyOf(e.date)
      m.set(wk, (m.get(wk) ?? 0) + 1)
    }

    // Build rows with cumulative CPW per watch per week
    const cumByWatch = new Map<string, number>()
    for (const w of eligible) cumByWatch.set(w.id, 0)

    const fullRows = allWeeks.map((week) => {
      const row: Record<string, string | number | null> = { week }
      for (const w of eligible) {
        const m = perWatchWeek.get(w.id)!
        const inWeek = m.get(week) ?? 0
        const cum = (cumByWatch.get(w.id) ?? 0) + inWeek
        cumByWatch.set(w.id, cum)
        row[w.id] = cum > 0 ? w.acquisitionPriceGbp! / cum : null
      }
      return row
    })

    // Trim to the active window if a filter is set. We keep cumulative counts
    // accurate by accumulating across the full range above; here we just slice
    // the rows shown.
    const sinceWeek = since ? weekKeyOf(since) : null
    const visible = sinceWeek
      ? fullRows.filter((r) => String(r.week) >= sinceWeek)
      : fullRows

    // One x-axis label per year — the first visible week whose Monday falls
    // in a new calendar year. With ~52 rows/year, weekly is way too dense to
    // label every tick.
    const seenYears = new Set<number>()
    const yearTicks: string[] = []
    for (const r of visible) {
      const wk = String(r.week)
      const y = parseISO(wk).getFullYear()
      if (!seenYears.has(y)) {
        seenYears.add(y)
        yearTicks.push(wk)
      }
    }

    return { rows: visible, eligible, yearTicks }
  }, [watches, wearLog, since, includeInactive])

  const inactiveToggle = (
    <label className="text-[11px] text-text-muted inline-flex items-center gap-1.5 cursor-pointer select-none">
      <input
        type="checkbox"
        checked={includeInactive}
        onChange={(e) => setIncludeInactive(e.target.checked)}
        className="accent-accent"
      />
      Include sold/gifted
    </label>
  )

  if (rows.length === 0 || eligible.length === 0) {
    return (
      <Card title="Cost per wear over time" action={inactiveToggle}>
        <div className="text-xs text-text-muted">
          Need acquisition prices and wear entries on at least one watch.
        </div>
      </Card>
    )
  }

  return (
    <Card
      title="Cost per wear over time · log scale · lower is better"
      action={inactiveToggle}
    >
      <div className="flex-1 min-h-72">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ left: 8, right: 16, top: 8, bottom: 8 }}>
            <CartesianGrid stroke="#f4f4f3" />
            <XAxis
              dataKey="week"
              fontSize={10}
              ticks={yearTicks}
              tickFormatter={(d) => `'${format(parseISO(String(d)), 'yy')}`}
            />
            <YAxis
              fontSize={10}
              scale="log"
              domain={[1, 'auto']}
              allowDataOverflow
              tickFormatter={(v) =>
                v >= 1000 ? `£${(v / 1000).toFixed(0)}k` : `£${v < 10 ? v.toFixed(1) : v.toFixed(0)}`
              }
            />
            {/* Tooltip intentionally omitted — too noisy with N watches stacked */}
            {eligible.map((w) => {
              const inactive = w.status === 'sold' || w.status === 'gifted'
              return (
                <Line
                  key={w.id}
                  type="monotone"
                  dataKey={w.id}
                  stroke={watchColors.get(w.id) ?? '#cccccc'}
                  strokeOpacity={inactive ? 0.5 : 1}
                  strokeWidth={1.5}
                  dot={false}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              )
            })}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
        {eligible.map((w) => {
          const inactive = w.status === 'sold' || w.status === 'gifted'
          return (
            <span
              key={w.id}
              className={`inline-flex items-center gap-1${inactive ? ' opacity-50' : ''}`}
            >
              <span
                className="inline-block w-2.5 h-2.5 rounded-sm"
                style={{ backgroundColor: watchColors.get(w.id) }}
              />
              <span className="text-text">{w.brand}</span>
              <span className="text-text-muted">{w.model}</span>
            </span>
          )
        })}
      </div>
    </Card>
  )
}

function WearsVsSpendCard({
  watches,
  wearLog,
  watchColors,
}: {
  watches: Watch[]
  wearLog: WearLogEntry[]
  watchColors: Map<string, string>
}) {
  const narrow = useIsNarrow()
  const rows = useMemo(() => {
    const wearsByWatch = new Map<string, number>()
    for (const e of wearLog) wearsByWatch.set(e.watchId, (wearsByWatch.get(e.watchId) ?? 0) + 1)
    return watches
      .map((w) => {
        const wears = wearsByWatch.get(w.id) ?? 0
        const cost = w.acquisitionPriceGbp
        // Log scale on both axes requires positive values
        if (cost == null || cost <= 0 || wears <= 0) return null
        const inactive = w.status === 'sold' || w.status === 'gifted'
        return {
          id: w.id,
          name: `${w.brand} ${w.model}${w.wasGift ? ' (gift)' : ''}${inactive ? ` · ${w.status}` : ''}`,
          cost,
          wears,
          isGift: !!w.wasGift,
          inactive,
          color: watchColors.get(w.id) ?? '#cccccc',
        }
      })
      .filter((r): r is NonNullable<typeof r> => Boolean(r))
  }, [watches, wearLog, watchColors])

  return (
    <Card title="Wears vs spend · log scale on both axes">
      {rows.length === 0 ? (
        <div className="text-xs text-text-muted">
          Add acquisition prices to your watches to see this.
        </div>
      ) : (
        <div className="flex-1 min-h-72">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 8, right: 12, bottom: 24, left: 12 }}>
              <CartesianGrid stroke="#f4f4f3" />
              <XAxis
                type="number"
                dataKey="cost"
                name="Cost"
                scale="log"
                domain={[50, 'auto']}
                allowDataOverflow
                fontSize={10}
                tickFormatter={(v) =>
                  v >= 1000 ? `£${(v / 1000).toFixed(0)}k` : `£${v.toFixed(0)}`
                }
                ticks={[50, 100, 250, 500, 1000, 2500, 5000, 10000]}
                label={
                  narrow
                    ? undefined
                    : { value: 'Cost (GBP)', position: 'insideBottom', offset: -8, fontSize: 10 }
                }
              />
              <YAxis
                type="number"
                dataKey="wears"
                name="Wears"
                scale="log"
                domain={[1, 'auto']}
                allowDataOverflow
                fontSize={10}
                ticks={[1, 3, 10, 30, 100, 300, 1000]}
                label={
                  narrow
                    ? undefined
                    : { value: 'Total wears (log)', angle: -90, position: 'insideLeft', fontSize: 10 }
                }
              />
              <Tooltip
                cursor={{ strokeDasharray: '3 3' }}
                formatter={(v, name) =>
                  name === 'cost' ? [`£${Number(v).toLocaleString()}`, 'Cost'] : [`${v} wears`, 'Wears']
                }
                labelFormatter={() => ''}
                contentStyle={{ fontSize: 11 }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null
                  const d = payload[0].payload as typeof rows[0]
                  return (
                    <div className="bg-bg border border-border rounded px-2 py-1 text-[11px]">
                      <div className="font-medium">{d.name}</div>
                      <div>
                        £{d.cost.toLocaleString()} · {d.wears} wears
                        {d.isGift && (
                          <span className="text-text-muted"> (value at receipt)</span>
                        )}
                      </div>
                      <div className="text-text-muted">
                        £{(d.cost / Math.max(d.wears, 1)).toFixed(2)}/wear
                      </div>
                    </div>
                  )
                }}
              />
              <Scatter data={rows}>
                {rows.map((r) => (
                  <Cell
                    key={r.id}
                    fill={r.color}
                    fillOpacity={r.inactive ? 0.5 : 0.9}
                  />
                ))}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  )
}

function RotationDiversityCard({ wearLog }: { wearLog: WearLogEntry[] }) {
  const points = useMemo(() => {
    const raw = rotationDiversityByMonth(wearLog)
    if (wearLog.length === 0) return raw
    const byMonth = new Map(raw.map((p) => [p.month, p]))
    const dates = wearLog.map((e) => e.date).sort()
    const minDate = dates[0]
    const todayIso = new Date().toISOString().slice(0, 10)
    const maxDate = dates[dates.length - 1] > todayIso ? dates[dates.length - 1] : todayIso
    return monthKeysInRange(minDate, maxDate).map(
      (k) => byMonth.get(k) ?? { month: k, uniqueWatches: 0, totalWears: 0 },
    )
  }, [wearLog])
  const avgUnique =
    points.length === 0
      ? 0
      : points.reduce((s, p) => s + p.uniqueWatches, 0) / points.length

  return (
    <Card title={`Rotation diversity (avg ${avgUnique.toFixed(1)} watches/month)`}>
      {points.length === 0 ? (
        <div className="text-xs text-text-muted">No wear data in this window.</div>
      ) : (
        <div className="flex-1 min-h-56">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={points}>
              <CartesianGrid stroke="#f4f4f3" />
              <XAxis dataKey="month" fontSize={10} />
              <YAxis fontSize={10} allowDecimals={false} />
              <Line
                type="monotone"
                dataKey="uniqueWatches"
                stroke="#7c3aed"
                strokeWidth={2}
                dot={false}
                name="Unique watches"
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  )
}


function WatchShareCard({
  watches,
  wearLog,
  watchColors,
  rangeLabel,
}: {
  watches: Watch[]
  wearLog: WearLogEntry[]
  watchColors: Map<string, string>
  rangeLabel: string
}) {
  const narrow = useIsNarrow()
  // Build per-month ranked stack data. Each month, the most-worn watch goes
  // at the BOTTOM of the bar (rank0), next most worn above it (rank1), etc.
  // Stack order varies bar-to-bar — the bottom segment may be a different
  // watch in different months.
  const { rows, rankedWatches, maxRank } = useMemo(() => {
    const overallCounts = new Map<string, number>()
    for (const e of wearLog) overallCounts.set(e.watchId, (overallCounts.get(e.watchId) ?? 0) + 1)
    const usedWatches = watches.filter((w) => (overallCounts.get(w.id) ?? 0) > 0)
    const ranked = [...usedWatches].sort(
      (a, b) => (overallCounts.get(b.id) ?? 0) - (overallCounts.get(a.id) ?? 0),
    )

    const monthly = watchShareByMonth(usedWatches, wearLog)
    let maxR = 0
    const monthRowMap = new Map<string, Record<string, string | number>>()
    for (const m of monthly) {
      const perWatch = usedWatches
        .map((w) => ({ id: w.id, count: (m[w.id] as number | undefined) ?? 0 }))
        .filter((x) => x.count > 0)
        // Most worn this month first (will end up at the bottom of the stack)
        .sort((a, b) => b.count - a.count)
      maxR = Math.max(maxR, perWatch.length)
      const row: Record<string, string | number> = { month: m.month as string }
      perWatch.forEach((p, i) => {
        row[`r${i}Count`] = p.count
        row[`r${i}Id`] = p.id
      })
      monthRowMap.set(m.month as string, row)
    }
    // Fill in empty months across the full window so the x-axis shows a
    // continuous timescale.
    let out: Array<Record<string, string | number>> = []
    if (wearLog.length > 0) {
      const dates = wearLog.map((e) => e.date).sort()
      const minDate = dates[0]
      const todayIso = new Date().toISOString().slice(0, 10)
      const maxDate = dates[dates.length - 1] > todayIso ? dates[dates.length - 1] : todayIso
      const allMonths = monthKeysInRange(minDate, maxDate)
      out = allMonths.map((k) => monthRowMap.get(k) ?? { month: k })
    } else {
      out = Array.from(monthRowMap.values()).sort((a, b) =>
        String(a.month).localeCompare(String(b.month)),
      )
    }
    return { rows: out, rankedWatches: ranked, maxRank: maxR }
  }, [watches, wearLog])

  if (rows.length === 0 || rankedWatches.length === 0) {
    return (
      <Card title={`Watch share over time (${rangeLabel})`}>
        <div className="text-xs text-text-muted">No wear data in this window.</div>
      </Card>
    )
  }

  // rank0 (most worn that month) rendered FIRST so it sits at the bottom.
  const rankOrder = Array.from({ length: maxRank }, (_, i) => i)
  const watchById = new Map(rankedWatches.map((w) => [w.id, w]))

  return (
    <Card title={`Watch share over time · monthly · ranked per-bar (${rangeLabel})`}>
      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} barCategoryGap={1}>
            <CartesianGrid stroke="#f4f4f3" vertical={false} />
            <XAxis
              dataKey="month"
              fontSize={10}
              interval="preserveStartEnd"
              tickFormatter={(m) => {
                const [y, mm] = String(m).split('-')
                const month = parseInt(mm, 10)
                // On narrow screens, only show year-start label (Jan)
                const labelMonths = narrow ? [1] : [1, 4, 7, 10]
                if (labelMonths.includes(month)) {
                  const labels = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
                  return narrow ? `'${y.slice(2)}` : `${labels[month]} '${y.slice(2)}`
                }
                return ''
              }}
            />
            <YAxis fontSize={10} allowDecimals={false} width={narrow ? 24 : 30} />
            <Tooltip
              cursor={{ fill: 'rgba(0,0,0,0.03)' }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null
                const row = payload[0].payload as Record<string, string | number>
                const [y, mm] = String(label).split('-')
                const monthLabels = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
                const items: Array<{ id: string; count: number }> = []
                for (let i = 0; i < maxRank; i++) {
                  const id = row[`r${i}Id`] as string | undefined
                  const count = row[`r${i}Count`] as number | undefined
                  if (id && count) items.push({ id, count })
                }
                return (
                  <div className="bg-bg border border-border rounded px-2 py-1 text-[11px] shadow-sm">
                    <div className="font-medium mb-0.5">
                      {monthLabels[parseInt(mm, 10)]} {y}
                    </div>
                    {items.map((it) => {
                      const w = watchById.get(it.id)
                      return (
                        <div key={it.id} className="flex items-center gap-1.5">
                          <span
                            className="inline-block w-2 h-2 rounded-sm"
                            style={{ backgroundColor: watchColors.get(it.id) }}
                          />
                          <span className="text-text">{w?.brand}</span>
                          <span className="text-text-muted">{w?.model}</span>
                          <span className="ml-auto text-text-subtle">{it.count}</span>
                        </div>
                      )
                    })}
                  </div>
                )
              }}
            />
            {rankOrder.map((i) => (
              <Bar key={i} dataKey={`r${i}Count`} stackId="1" isAnimationActive={false}>
                {rows.map((row, j) => {
                  const id = row[`r${i}Id`] as string | undefined
                  const w = id ? watchById.get(id) : undefined
                  const inactive = w?.status === 'sold' || w?.status === 'gifted'
                  return (
                    <Cell
                      key={j}
                      fill={id ? (watchColors.get(id) ?? '#cccccc') : 'transparent'}
                      fillOpacity={inactive ? 0.5 : 1}
                    />
                  )
                })}
              </Bar>
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
        {rankedWatches.map((w) => {
          const inactive = w.status === 'sold' || w.status === 'gifted'
          return (
            <span
              key={w.id}
              className={`inline-flex items-center gap-1${inactive ? ' opacity-50' : ''}`}
            >
              <span
                className="inline-block w-2.5 h-2.5 rounded-sm"
                style={{ backgroundColor: watchColors.get(w.id) }}
              />
              <span className="text-text">{w.brand}</span>
              <span className="text-text-muted">{w.model}</span>
              {inactive && <span className="text-text-subtle">· {w.status}</span>}
            </span>
          )
        })}
      </div>
    </Card>
  )
}

interface MapPoint {
  city: string
  country?: string
  lat: number
  lng: number
  count: number
}

// ─── Behaviour-pattern cards ────────────────────────────────────────────────

function SellabilityCard({
  watches,
  wearLog,
  watchColors,
}: {
  watches: Watch[]
  wearLog: WearLogEntry[]
  watchColors: Map<string, string>
}) {
  const rows = useMemo(() => sellabilityRanking(watches, wearLog), [watches, wearLog])
  const watchById = useMemo(() => new Map(watches.map((w) => [w.id, w])), [watches])

  if (rows.length === 0) {
    return (
      <Card title="Sellability">
        <div className="text-xs text-text-muted">No owned watches to rank.</div>
      </Card>
    )
  }

  function scoreColor(score: number): string {
    if (score >= 60) return 'var(--color-danger)'
    if (score >= 35) return 'var(--color-warning)'
    return 'var(--color-success)'
  }

  return (
    <Card title="Sellability · owned watches ranked by wear-pattern signals">
      <div className="text-[11px] text-text-muted mb-3">
        Higher = more sellable. Composite of dormancy (45%, saturates at 6
        months idle), wear-rate drop-off vs lifetime (40%, never-worn after
        90 days = max signal), and one-off-ness (15%, brief-fling bonus).
        Pure wear-pattern derived — no price input.
      </div>
      <ul className="divide-y divide-border -mx-3 sm:-mx-4">
        {rows.map((r) => {
          const w = watchById.get(r.watchId)
          if (!w) return null
          const color = watchColors.get(w.id) ?? '#cccccc'
          return (
            <li
              key={r.watchId}
              className="px-3 sm:px-4 py-2 grid grid-cols-[1fr_auto] gap-3 items-center"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="inline-block w-2.5 h-2.5 rounded-sm shrink-0"
                    style={{ backgroundColor: color }}
                  />
                  <span className="text-sm text-text truncate">
                    {w.brand}{' '}
                    <span className="text-text-muted">{w.model}</span>
                  </span>
                </div>
                <div className="text-[11px] text-text-muted mt-0.5 truncate">
                  {r.rationale} · {r.wearsTotal} total wear{r.wearsTotal === 1 ? '' : 's'}
                  {r.wearsLast365 !== r.wearsTotal && (
                    <> · {r.wearsLast365} in last 365d</>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <div
                  className="w-24 h-1.5 rounded-full bg-surface-2 overflow-hidden"
                  title={`${r.score}/100`}
                >
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${r.score}%`,
                      backgroundColor: scoreColor(r.score),
                    }}
                  />
                </div>
                <div
                  className="text-sm font-semibold tabular-nums w-8 text-right"
                  style={{ color: scoreColor(r.score) }}
                >
                  {r.score}
                </div>
              </div>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}

function WatchYearHeatmapCard({
  watches,
  wearLog,
  watchColors,
}: {
  watches: Watch[]
  wearLog: WearLogEntry[]
  watchColors: Map<string, string>
}) {
  const { rows, years, maxByWatch } = useMemo(() => {
    if (wearLog.length === 0) return { rows: [], years: [], maxByWatch: new Map<string, number>() }
    const overall = new Map<string, number>()
    const cell = new Map<string, Map<number, number>>()
    let minY = Infinity
    let maxY = -Infinity
    for (const e of wearLog) {
      const y = parseInt(e.date.slice(0, 4), 10)
      if (y < minY) minY = y
      if (y > maxY) maxY = y
      if (!cell.has(e.watchId)) cell.set(e.watchId, new Map())
      const m = cell.get(e.watchId)!
      m.set(y, (m.get(y) ?? 0) + 1)
      overall.set(e.watchId, (overall.get(e.watchId) ?? 0) + 1)
    }
    maxY = Math.max(maxY, new Date().getFullYear())
    const years: number[] = []
    for (let y = minY; y <= maxY; y++) years.push(y)
    const sortedWatches = [...watches]
      .filter((w) => (overall.get(w.id) ?? 0) > 0)
      .sort((a, b) => {
        const aInactive = a.status === 'sold' || a.status === 'gifted'
        const bInactive = b.status === 'sold' || b.status === 'gifted'
        if (aInactive !== bInactive) return aInactive ? 1 : -1
        return (overall.get(b.id) ?? 0) - (overall.get(a.id) ?? 0)
      })
    // Per-watch max so each row is normalized within itself
    const maxByWatch = new Map<string, number>()
    for (const w of sortedWatches) {
      const m = cell.get(w.id)!
      let max = 0
      for (const v of m.values()) if (v > max) max = v
      maxByWatch.set(w.id, max)
    }
    const rows = sortedWatches.map((w) => ({
      watch: w,
      cells: years.map((y) => ({
        year: y,
        count: cell.get(w.id)?.get(y) ?? 0,
      })),
      total: overall.get(w.id) ?? 0,
    }))
    return { rows, years, maxByWatch }
  }, [watches, wearLog])

  if (rows.length === 0) {
    return (
      <Card title="Wear heatmap · watch × year">
        <div className="text-xs text-text-muted">No wear data.</div>
      </Card>
    )
  }

  const narrow = useIsNarrow()
  const LABEL_W = narrow ? 84 : 180
  const TOTAL_W = narrow ? 26 : 50
  const CELL_MIN = narrow ? 4 : 8
  // CSS grid: label column | N year columns (flex-equal) | total column
  const gridTemplate = `${LABEL_W}px repeat(${years.length}, minmax(${CELL_MIN}px, 1fr)) ${TOTAL_W}px`
  // Only force a minWidth (and enable horizontal scroll) when the natural
  // minimum would overflow even a phone-width viewport. For typical year
  // counts the grid now fluidly fills the card without scrolling.
  const naturalMin = LABEL_W + years.length * CELL_MIN + TOTAL_W

  return (
    <Card title="Wear heatmap · watch × year" padding={false}>
      <div className={`p-3 w-full${naturalMin > 360 ? ' overflow-x-auto' : ''}`}>
        {/* Year header */}
        <div
          className="grid gap-x-1 items-end mb-1"
          style={{ gridTemplateColumns: gridTemplate, minWidth: naturalMin }}
        >
          <div />
          {years.map((y) => (
            <div key={y} className="text-[10px] text-text-muted text-center">
              {String(y).slice(2)}
            </div>
          ))}
          <div className="text-[10px] text-text-muted text-left pl-2">total</div>
        </div>

        {/* Rows */}
        {rows.map(({ watch, cells, total }, idx) => {
          const max = maxByWatch.get(watch.id) ?? 1
          const baseColor = watchColors.get(watch.id) ?? '#cccccc'
          const inactive = watch.status === 'sold' || watch.status === 'gifted'
          const prevInactive =
            idx > 0 &&
            (rows[idx - 1].watch.status === 'sold' ||
              rows[idx - 1].watch.status === 'gifted')
          const isFirstInactive = inactive && !prevInactive
          return (
            <div
              key={watch.id}
              className="grid gap-x-1 items-center mb-0.5"
              style={{
                gridTemplateColumns: gridTemplate,
                minWidth: naturalMin,
                ...(isFirstInactive
                  ? {
                      borderTop: '1px dashed var(--color-border-strong)',
                      paddingTop: 6,
                      marginTop: 6,
                    }
                  : {}),
              }}
            >
              <div
                className={`text-xs truncate pr-2${inactive ? ' opacity-60' : ''}`}
              >
                <span
                  className="inline-block w-2 h-2 rounded-sm align-middle mr-1.5"
                  style={{ backgroundColor: baseColor }}
                />
                <span className="text-text">{watch.brand}</span>{' '}
                <span className="text-text-muted">{watch.model}</span>
              </div>
              {cells.map((c) => {
                // Normalize within this watch's row
                const intensity = c.count > 0 ? 0.2 + 0.8 * (c.count / max) : 0
                return (
                  <div
                    key={c.year}
                    title={`${watch.brand} ${watch.model} · ${c.year}: ${c.count} wears`}
                    style={{
                      height: 22,
                      borderRadius: 3,
                      backgroundColor:
                        intensity > 0 ? baseColor : 'var(--color-surface-2)',
                      opacity: intensity > 0 ? intensity : 1,
                    }}
                  />
                )
              })}
              <div className="text-xs text-text-muted tabular-nums pl-2">
                {total}
              </div>
            </div>
          )
        })}
      </div>
    </Card>
  )
}

// Cities considered "home" — places the user has lived or had a long-term base
const HOME_CITIES = new Set(['amersham', 'london', 'toronto', 'kingston'])

function TravelCompanionCard({
  watches,
  wearLog,
  watchColors,
}: {
  watches: Watch[]
  wearLog: WearLogEntry[]
  watchColors: Map<string, string>
}) {
  const narrow = useIsNarrow()
  const rows = useMemo(() => {
    const counts = new Map<string, { home: number; away: number }>()
    for (const e of wearLog) {
      const ent = counts.get(e.watchId) ?? { home: 0, away: 0 }
      const city = e.location?.city?.toLowerCase()
      if (city && HOME_CITIES.has(city)) ent.home += 1
      else if (!e.location?.city && !e.location?.country) ent.home += 1 // unlocated → home
      else ent.away += 1
      counts.set(e.watchId, ent)
    }
    return watches
      .map((w) => {
        const c = counts.get(w.id) ?? { home: 0, away: 0 }
        if (c.home === 0 && c.away === 0) return null
        const inactive = w.status === 'sold' || w.status === 'gifted'
        return {
          id: w.id,
          name: `${w.brand} ${w.model}${inactive ? ` · ${w.status}` : ''}`,
          home: c.home,
          away: c.away,
          total: c.home + c.away,
          color: watchColors.get(w.id) ?? '#cccccc',
          inactive,
        }
      })
      .filter((r): r is NonNullable<typeof r> => Boolean(r))
      // Owned watches first (by total desc), then sold/gifted (also by total desc)
      .sort((a, b) => {
        if (a.inactive !== b.inactive) return a.inactive ? 1 : -1
        return b.total - a.total
      })
  }, [watches, wearLog, watchColors])

  return (
    <Card title="Travel companions · home (Amersham / London / Toronto / Kingston) vs away">
      {rows.length === 0 ? (
        <div className="text-xs text-text-muted">No location data.</div>
      ) : (
        <div style={{ height: Math.max(180, rows.length * 24) }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} layout="vertical" margin={{ left: 8, right: 8 }}>
              <CartesianGrid stroke="#f4f4f3" />
              <XAxis
                type="number"
                scale="log"
                domain={[1, 'auto']}
                allowDataOverflow
                fontSize={10}
              />
              <YAxis
                dataKey="name"
                type="category"
                width={narrow ? 96 : 170}
                fontSize={10}
                interval={0}
              />
              <Tooltip
                cursor={{ fill: 'rgba(0,0,0,0.03)' }}
                contentStyle={{ fontSize: 11 }}
                formatter={(v, name) => [v, name === 'home' ? 'Home' : 'Away']}
              />
              <Bar dataKey="home" stackId="loc" fill="#2563eb" radius={[0, 0, 0, 0]}>
                {rows.map((r) => (
                  <Cell key={`${r.id}-h`} fill={r.color} fillOpacity={r.inactive ? 0.5 : 1} />
                ))}
              </Bar>
              <Bar dataKey="away" stackId="loc" fill="#cbd5e1">
                {rows.map((r) => (
                  <Cell
                    key={`${r.id}-a`}
                    fill="#cbd5e1"
                    fillOpacity={r.inactive ? 0.5 : 1}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      <div className="mt-2 flex gap-3 text-[11px] text-text-muted">
        <span className="inline-flex items-center gap-1">
          <span className="inline-block w-2.5 h-2.5 rounded-sm bg-text-muted" />
          Watch color = Home
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block w-2.5 h-2.5 rounded-sm bg-slate-300" />
          Slate = Away
        </span>
      </div>
    </Card>
  )
}

/** Case- and punctuation-insensitive key so e.g. "St. Kitts" / "Saint Kitts"
 *  / "St Kitts" collapse onto one location. Display string keeps the first
 *  variant we saw. */
function normalizeLocPart(s: string | undefined): string {
  return (s ?? '')
    .toLowerCase()
    .replace(/[.,]/g, '')
    .replace(/^saint\s+/, 'st ')
    .replace(/\s+saint\s+/, ' st ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Collapse the (city, country) pair into a single grouping key. Handles the
 *  asymmetric case where the same place got recorded with either the city or
 *  the country field populated but not both, so they group together. */
function travelLocKey(loc: { city?: string; country?: string }): string {
  const cityN = normalizeLocPart(loc.city)
  const ctyN = normalizeLocPart(loc.country)
  if (!cityN) return `${ctyN}|`
  if (!ctyN) return `${cityN}|`
  if (cityN === ctyN) return `${cityN}|`
  return `${cityN}|${ctyN}`
}

function TravelMapCard({ wearLog }: { wearLog: WearLogEntry[] }) {
  const { resolvedPoints, unresolvedCount } = useMemo(() => {
    const groups = new Map<
      string,
      { count: number; lat?: number; lng?: number; city: string; country?: string }
    >()
    for (const e of wearLog) {
      if (!e.location?.city && !e.location?.country) continue
      const key = travelLocKey(e.location)
      const existing = groups.get(key)
      if (existing) {
        existing.count += 1
        if (existing.lat == null && e.location.lat != null) {
          existing.lat = e.location.lat
          existing.lng = e.location.lng
        }
      } else {
        groups.set(key, {
          count: 1,
          city: e.location.city ?? e.location.country ?? '',
          country: e.location.country,
          lat: e.location.lat,
          lng: e.location.lng,
        })
      }
    }
    const out: MapPoint[] = []
    let unresolved = 0
    for (const g of groups.values()) {
      let lat = g.lat
      let lng = g.lng
      if (lat == null || lng == null) {
        const coords = lookupCoords(g.city, g.country)
        if (coords) {
          lat = coords.lat
          lng = coords.lng
        }
      }
      if (lat != null && lng != null) {
        out.push({ city: g.city, country: g.country, lat, lng, count: g.count })
      } else {
        unresolved++
      }
    }
    return { resolvedPoints: out, unresolvedCount: unresolved }
  }, [wearLog])

  const tableRows = useMemo(
    () => [...resolvedPoints].sort((a, b) => b.count - a.count),
    [resolvedPoints],
  )

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-4">
      <Card title="Travel map" padding={false}>
        <div className="flex-1 min-h-80 w-full relative">
          {unresolvedCount > 0 && (
            <div className="absolute top-2 right-2 z-[1000] bg-bg/90 px-2 py-1 rounded text-[11px] text-text-muted border border-border">
              {unresolvedCount} locations not on map
            </div>
          )}
          <MapContainer
            center={[30, 0]}
            zoom={2}
            scrollWheelZoom={false}
            style={{ height: '100%', width: '100%' }}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {resolvedPoints.map((p, i) => {
              // Log scale so a 1-wear pin (~4px) and a 1000-wear pin (~30px)
              // both stay readable. Was sqrt-based which hit the cap fast
              // once Amersham accumulated hundreds of wears.
              const radius = Math.max(4, Math.min(30, 4 + Math.log10(p.count + 1) * 7))
              return (
                <CircleMarker
                  key={i}
                  center={[p.lat, p.lng]}
                  radius={radius}
                  pathOptions={{ color: '#2563eb', fillColor: '#2563eb', fillOpacity: 0.5, weight: 1 }}
                >
                  <LeafletTooltip>
                    <div className="text-xs">
                      <div className="font-medium">
                        {p.city}
                        {p.country && p.city !== p.country ? `, ${p.country}` : ''}
                      </div>
                      <div>
                        {p.count} {p.count === 1 ? 'wear' : 'wears'}
                      </div>
                    </div>
                  </LeafletTooltip>
                </CircleMarker>
              )
            })}
          </MapContainer>
        </div>
      </Card>
      <Card title="Top locations">
        {tableRows.length === 0 ? (
          <div className="text-xs text-text-muted">No locations.</div>
        ) : (
          <ul className="divide-y divide-border -mx-4 flex-1 overflow-y-auto">
            {tableRows.map((p, i) => (
              <li
                key={i}
                className="flex items-baseline justify-between px-4 py-1.5 text-xs"
              >
                <span className="truncate">
                  <span className="text-text">{p.city}</span>
                  {p.country && p.city !== p.country && (
                    <span className="text-text-muted">, {p.country}</span>
                  )}
                </span>
                <span className="text-text-subtle ml-2">{p.count}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
