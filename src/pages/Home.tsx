import { Link } from 'react-router-dom'
import { Gate } from '../components/Gate'
import { Card, Stat } from '../components/Card'
import { Empty } from '../components/Empty'
import { useData } from '../hooks/useData'
import { daysSince, formatDate, formatGbp, todayIso } from '../lib/utils'
import { StatusBadge } from '../components/StatusBadge'
import { ArrowRight, Plus, Check } from 'lucide-react'

export function Home() {
  return (
    <Gate>
      <HomeInner />
    </Gate>
  )
}

function HomeInner() {
  const data = useData()
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
  const stalest = [...owned]
    .map((w) => ({ w, last: lastWornByWatch.get(w.id) ?? null }))
    .sort((a, b) => {
      if (!a.last) return -1
      if (!b.last) return 1
      return a.last.localeCompare(b.last)
    })
    .slice(0, 5)

  const recent = [...data.wearLog].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6)

  if (data.watches.length === 0) {
    return (
      <Empty
        title="No watches yet"
        body="Import your wear log CSV from Settings, or add your first watch."
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

  // Has today already been logged?
  const today = todayIso()
  const todayEntry = data.wearLog.find((e) => e.date === today)
  const todayWatch = todayEntry
    ? data.watches.find((w) => w.id === todayEntry.watchId)
    : null

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

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
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
