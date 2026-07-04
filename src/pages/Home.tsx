import { useState } from 'react'
import { Link } from 'react-router-dom'
import { nanoid } from 'nanoid'
import { Gate } from '../components/Gate'
import { Card, Stat } from '../components/Card'
import { Empty } from '../components/Empty'
import { useData, useDataContext } from '../hooks/useData'
import { daysSince, formatDate, formatGbp, todayIso, classNames } from '../lib/utils'
import { getCurrentPosition, reverseGeocode } from '../lib/geocode'
import { findNearestKnownCity } from '../lib/cityCoords'
import type { Location, WearLogEntry } from '../types'
import { StatusBadge } from '../components/StatusBadge'
import { ArrowRight, Plus, Check, Cake, Repeat, RefreshCw } from 'lucide-react'

export function Home() {
  return (
    <Gate>
      <HomeInner />
    </Gate>
  )
}

function HomeInner() {
  const data = useData()
  const { mutate } = useDataContext()
  const [dormantDays, setDormantDays] = useState<10 | 30 | 90>(90)
  const [quickBusy, setQuickBusy] = useState(false)
  const owned = data.watches.filter((w) => w.status === 'owned')
  const paid = owned.filter((w) => !w.wasGift)
  const totalValue = owned.reduce((sum, w) => sum + (w.currentValueGbp ?? 0), 0)
  const totalCost = paid.reduce((sum, w) => sum + (w.acquisitionPriceGbp ?? 0), 0)
  // P/L only counts paid watches on the cost side; gifted watches add to value but not cost basis
  const paidValue = paid.reduce((sum, w) => sum + (w.currentValueGbp ?? 0), 0)
  const pl = paidValue - totalCost
  // Realized P/L: sum of (salePrice - acquisitionCost) across sold watches.
  // For previously-gifted watches that were then sold, cost basis = 0.
  const sold = data.watches.filter((w) => w.status === 'sold')
  const realizedPl = sold.reduce((sum, w) => {
    const proceeds = w.salePriceGbp ?? 0
    const cost = w.wasGift ? 0 : (w.acquisitionPriceGbp ?? 0)
    return sum + (proceeds - cost)
  }, 0)
  const hasRealized = sold.some(
    (w) => (w.salePriceGbp ?? 0) > 0 || (!w.wasGift && (w.acquisitionPriceGbp ?? 0) > 0),
  )

  // Last worn per watch
  const lastWornByWatch = new Map<string, string>()
  for (const e of data.wearLog) {
    const prev = lastWornByWatch.get(e.watchId)
    if (!prev || e.date > prev) lastWornByWatch.set(e.watchId, e.date)
  }

  // Dormant capital: paid-for owned watches unworn {dormantDays}+ days (or never)
  let dormantValue = 0
  let dormantCount = 0
  for (const w of paid) {
    if (!w.currentValueGbp) continue
    const last = lastWornByWatch.get(w.id)
    const days = last ? daysSince(last) : Infinity
    if (days >= dormantDays) {
      dormantValue += w.currentValueGbp
      dormantCount += 1
    }
  }
  const stalest = [...owned]
    .map((w) => ({ w, last: lastWornByWatch.get(w.id) ?? null }))
    .sort((a, b) => {
      if (!a.last) return -1
      if (!b.last) return 1
      return a.last.localeCompare(b.last)
    })
    .slice(0, 5)

  const recent = [...data.wearLog].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6)

  // Upcoming acquisition anniversaries within the next 30 days (owned only).
  const ANNIVERSARY_HORIZON_DAYS = 30
  const now = new Date()
  const todayMid = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const upcomingAnniversaries: Array<{
    watchId: string
    brand: string
    model: string
    date: Date
    years: number
    daysUntil: number
  }> = []
  for (const w of owned) {
    if (!w.acquisitionDate) continue
    const [acqY, acqM, acqD] = w.acquisitionDate.split('-').map(Number)
    if (!acqY || !acqM || !acqD) continue
    // Anniversary in current year — bump to next year if it's already passed
    const tM = now.getMonth() + 1
    const tD = now.getDate()
    const inYear = tM > acqM || (tM === acqM && tD > acqD) ? now.getFullYear() + 1 : now.getFullYear()
    const next = new Date(inYear, acqM - 1, acqD)
    const daysUntil = Math.round((next.getTime() - todayMid) / 86_400_000)
    if (daysUntil < 0 || daysUntil > ANNIVERSARY_HORIZON_DAYS) continue
    const years = inYear - acqY
    if (years <= 0) continue
    upcomingAnniversaries.push({
      watchId: w.id,
      brand: w.brand,
      model: w.model,
      date: next,
      years,
      daysUntil,
    })
  }
  upcomingAnniversaries.sort((a, b) => a.daysUntil - b.daysUntil)

  if (data.watches.length === 0) {
    return (
      <Empty
        title="No watches yet"
        body="Add your first watch from the Collection tab, or restore a backup in Settings."
        action={
          <Link
            to="/collection"
            className="inline-flex items-center px-3 py-1.5 text-xs rounded-md bg-accent text-white"
          >
            Open Collection
          </Link>
        }
      />
    )
  }

  // Has today already been logged?
  const today = todayIso()
  const todayEntry = data.wearLog.find((e) => e.date === today)
  const todayWatch = todayEntry
    ? data.watches.find((w) => w.id === todayEntry.watchId)
    : null

  // Most recent past wear — the one-tap "again" candidate. Only offered when
  // that watch is still owned.
  const lastEntry = [...data.wearLog]
    .filter((e) => e.date < today)
    .sort((a, b) => b.date.localeCompare(a.date))[0]
  const lastWatch = lastEntry
    ? data.watches.find((w) => w.id === lastEntry.watchId && w.status === 'owned')
    : null

  async function quickLogAgain() {
    if (!lastWatch || quickBusy) return
    setQuickBusy(true)
    try {
      // Best-effort location, same flow as the Log page — never blocks the log.
      let location: Location | undefined
      let source: WearLogEntry['source'] = 'manual'
      try {
        const pos = await getCurrentPosition()
        const lat = pos.coords.latitude
        const lng = pos.coords.longitude
        let city: string | undefined
        let country: string | undefined
        const near = findNearestKnownCity(lat, lng, 25)
        if (near) {
          city = near.city
          country = near.country
        } else {
          try {
            const loc = await reverseGeocode(lat, lng)
            city = loc.city
            country = loc.country
          } catch {
            /* lookup failed — keep coords */
          }
        }
        location = { city, country, lat, lng }
        source = 'geolocation'
      } catch {
        /* geolocation denied/unavailable */
      }
      const entry: WearLogEntry = {
        id: nanoid(10),
        watchId: lastWatch.id,
        date: today,
        location,
        source,
        createdAt: new Date().toISOString(),
      }
      await mutate(
        (d) => ({ ...d, wearLog: [...d.wearLog, entry] }),
        { message: `Log ${lastWatch.brand} ${lastWatch.model} on ${today}` },
      )
    } finally {
      setQuickBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <Link
        to="/log"
        className={
          todayWatch
            ? 'flex items-center justify-between gap-3 rounded-lg border border-border bg-surface px-4 py-3 hover:border-border-strong transition'
            : 'flex items-center justify-between gap-3 rounded-lg bg-accent text-white px-4 py-4 shadow-sm hover:opacity-95 transition'
        }
      >
        {todayWatch ? (
          <>
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-full bg-success/15 text-success flex items-center justify-center shrink-0">
                <Check size={18} />
              </div>
              <div className="min-w-0">
                <div className="text-xs text-text-muted">Today's wear is logged</div>
                <div className="text-sm font-medium truncate">
                  {todayWatch.brand}{' '}
                  <span className="text-text-muted">{todayWatch.model}</span>
                </div>
              </div>
            </div>
            <span className="text-xs text-text-muted whitespace-nowrap flex items-center gap-1">
              Change <ArrowRight size={12} />
            </span>
          </>
        ) : (
          <>
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                <Plus size={20} />
              </div>
              <div className="min-w-0">
                <div className="text-[11px] uppercase tracking-wide opacity-80">
                  {formatDate(today)}
                </div>
                <div className="text-base font-semibold">Log today's wear</div>
              </div>
            </div>
            <ArrowRight size={18} className="shrink-0" />
          </>
        )}
      </Link>

      {!todayEntry && lastWatch && (
        <button
          type="button"
          onClick={() => void quickLogAgain()}
          disabled={quickBusy}
          className="w-full flex items-center justify-between gap-3 rounded-lg border border-border bg-surface px-4 py-2.5 hover:border-border-strong transition disabled:opacity-60 -mt-3"
        >
          <span className="flex items-center gap-2 min-w-0 text-sm">
            {quickBusy ? (
              <RefreshCw size={14} className="animate-spin shrink-0 text-text-muted" />
            ) : (
              <Repeat size={14} className="shrink-0 text-text-muted" />
            )}
            <span className="text-text-muted shrink-0">
              {quickBusy ? 'Logging…' : 'Same as last time:'}
            </span>
            <span className="truncate text-text font-medium">
              {lastWatch.brand} <span className="text-text-muted">{lastWatch.model}</span>
            </span>
          </span>
          <span className="text-[11px] text-text-subtle whitespace-nowrap">one tap</span>
        </button>
      )}

      {upcomingAnniversaries.length > 0 && (
        <div className="border border-border bg-surface rounded-lg p-3">
          <div className="text-[11px] uppercase tracking-wide text-text-muted flex items-center gap-1.5 mb-1.5">
            <Cake size={12} /> Upcoming anniversaries
          </div>
          <ul className="space-y-1">
            {upcomingAnniversaries.map((a) => (
              <li key={a.watchId} className="flex items-baseline justify-between gap-2 text-sm">
                <Link
                  to={`/collection/${a.watchId}`}
                  className="truncate hover:underline"
                >
                  <span className="text-text">{a.brand}</span>{' '}
                  <span className="text-text-muted">{a.model}</span>
                </Link>
                <span className="text-xs text-text-muted whitespace-nowrap">
                  {a.years} {a.years === 1 ? 'year' : 'years'} ·{' '}
                  {a.daysUntil === 0
                    ? 'today'
                    : a.daysUntil === 1
                      ? 'tomorrow'
                      : `in ${a.daysUntil} days`}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <Stat label="Owned" value={owned.length} sub={`${data.watches.length} total tracked`} />
        <Stat
          label="Collection value"
          value={formatGbp(totalValue || null)}
          sub={totalValue ? 'at current valuations' : 'add values to see this'}
        />
        <Stat
          label="Total spent"
          value={formatGbp(totalCost || null)}
          sub={
            totalCost
              ? owned.length - paid.length > 0
                ? `gifts excluded · ${owned.length - paid.length} gifted`
                : 'acquisition cost (GBP)'
              : 'add prices to see this'
          }
        />
        <Stat
          label="Unrealised P/L"
          value={
            <span className={pl > 0 ? 'text-success' : pl < 0 ? 'text-danger' : undefined}>
              {paidValue && totalCost ? formatGbp(pl) : '—'}
            </span>
          }
          sub="vs purchase (paid only)"
        />
        <Stat
          label="Realised P/L"
          value={
            hasRealized ? (
              <span
                className={
                  realizedPl > 0
                    ? 'text-success'
                    : realizedPl < 0
                      ? 'text-danger'
                      : undefined
                }
              >
                {realizedPl > 0 ? '+' : ''}
                {formatGbp(realizedPl)}
              </span>
            ) : (
              '—'
            )
          }
          sub={`${sold.length} sold`}
        />
        <div className="border border-border rounded-lg p-4 bg-surface">
          <div className="text-[11px] uppercase tracking-wide text-text-muted">
            Dormant capital
          </div>
          <div className="mt-1 text-3xl font-semibold text-text tabular-nums">
            {dormantValue > 0 ? formatGbp(dormantValue) : '—'}
          </div>
          <div className="text-xs text-text-muted mt-0.5">
            {dormantCount > 0
              ? `${dormantCount} owned watch${dormantCount === 1 ? '' : 'es'} unworn ${dormantDays}+ days`
              : `nothing untouched for ${dormantDays}+ days`}
          </div>
          <div className="mt-2 inline-flex border border-border rounded-md overflow-hidden text-[10px] w-fit">
            {([10, 30, 90] as const).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDormantDays(d)}
                className={classNames(
                  'px-1.5 py-0.5 transition',
                  dormantDays === d
                    ? 'bg-surface-2 text-text font-medium'
                    : 'text-text-muted hover:bg-surface-2/60',
                )}
              >
                {d}d
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card
          title="Stalest watches"
          action={
            <Link to="/collection" className="text-xs text-accent inline-flex items-center gap-1">
              All <ArrowRight size={12} />
            </Link>
          }
        >
          {stalest.length === 0 ? (
            <div className="text-xs text-text-muted">No data yet.</div>
          ) : (
            <ul className="divide-y divide-border -mx-4">
              {stalest.map(({ w, last }) => (
                <li key={w.id}>
                  <Link
                    to={`/collection/${w.id}`}
                    className="flex items-center justify-between px-4 py-2 hover:bg-surface-2"
                  >
                    <div className="min-w-0">
                      <div className="text-sm truncate">
                        {w.brand} <span className="text-text-muted">{w.model}</span>
                      </div>
                      <div className="text-[11px] text-text-muted">
                        {last
                          ? `${daysSince(last)} days ago · ${formatDate(last)}`
                          : 'never worn'}
                      </div>
                    </div>
                    <StatusBadge status={w.status} size="xs" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Recent wears">
          {recent.length === 0 ? (
            <div className="text-xs text-text-muted">No wear entries yet.</div>
          ) : (
            <ul className="divide-y divide-border -mx-4">
              {recent.map((e) => {
                const w = data.watches.find((x) => x.id === e.watchId)
                if (!w) return null
                return (
                  <li
                    key={e.id}
                    className="flex items-center justify-between px-4 py-2"
                  >
                    <div className="min-w-0">
                      <div className="text-sm truncate">
                        {w.brand} <span className="text-text-muted">{w.model}</span>
                      </div>
                      <div className="text-[11px] text-text-muted">
                        {formatDate(e.date)} ·{' '}
                        {e.location?.city
                          ? `${e.location.city}${e.location.country ? `, ${e.location.country}` : ''}`
                          : 'no location'}
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>
      </div>
    </div>
  )
}
