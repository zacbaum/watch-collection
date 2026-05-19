import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts'
import { Gate } from '../components/Gate'
import { Card } from '../components/Card'
import { Empty } from '../components/Empty'
import { StatusBadge } from '../components/StatusBadge'
import { Monogram } from '../components/Monogram'
import { useData, useDataContext } from '../hooks/useData'
import type { Watch, WatchStatus } from '../types'
import { daysSince, formatGbp, classNames, titleCase } from '../lib/utils'
import { differenceInDays, parseISO } from 'date-fns'
import { colorFor, PALETTE } from '../lib/palette'
import { nanoid } from 'nanoid'
import { Plus } from 'lucide-react'

export function Collection() {
  return (
    <Gate>
      <CollectionInner />
    </Gate>
  )
}

const STATUS_TABS: Array<{ key: WatchStatus | 'all'; label: string }> = [
  { key: 'owned', label: 'Owned' },
  { key: 'sold', label: 'Sold' },
  { key: 'gifted', label: 'Gifted' },
  { key: 'all', label: 'All' },
]

function CollectionInner() {
  const data = useData()
  const { mutate } = useDataContext()
  const [status, setStatus] = useState<WatchStatus | 'all'>('owned')
  const [adding, setAdding] = useState(false)

  const counts = useMemo(() => {
    const c: Record<string, number> = { owned: 0, sold: 0, gifted: 0, all: data.watches.length }
    for (const w of data.watches) c[w.status] = (c[w.status] ?? 0) + 1
    return c
  }, [data.watches])

  const lastWorn = useMemo(() => {
    const m = new Map<string, string>()
    for (const e of data.wearLog) {
      const prev = m.get(e.watchId)
      if (!prev || e.date > prev) m.set(e.watchId, e.date)
    }
    return m
  }, [data.wearLog])

  const wearCount = useMemo(() => {
    const m = new Map<string, number>()
    for (const e of data.wearLog) m.set(e.watchId, (m.get(e.watchId) ?? 0) + 1)
    return m
  }, [data.wearLog])

  const filtered = data.watches
    .filter((w) => (status === 'all' ? true : w.status === status))
    .sort((a, b) => {
      const la = lastWorn.get(a.id) ?? ''
      const lb = lastWorn.get(b.id) ?? ''
      return lb.localeCompare(la)
    })

  async function handleAdd(form: { brand: string; model: string; reference?: string }) {
    const watch: Watch = {
      id: nanoid(8),
      brand: form.brand.trim(),
      model: form.model.trim(),
      reference: form.reference?.trim() || undefined,
      status: 'owned',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    await mutate((d) => ({ ...d, watches: [...d.watches, watch] }), {
      message: `Add ${watch.brand} ${watch.model}`,
    })
    setAdding(false)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Collection</h1>
        <button
          onClick={() => setAdding((a) => !a)}
          className="px-3 py-1.5 text-xs rounded-md bg-accent text-white flex items-center gap-1"
        >
          <Plus size={14} /> Add watch
        </button>
      </div>

      {adding && <AddWatchForm onCancel={() => setAdding(false)} onSubmit={handleAdd} />}

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex border border-border rounded-md overflow-hidden">
          {STATUS_TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setStatus(t.key)}
              className={classNames(
                'px-3 py-1.5 text-xs',
                status === t.key
                  ? 'bg-surface-2 text-text font-medium'
                  : 'text-text-muted hover:bg-surface',
              )}
            >
              {t.label} <span className="text-text-subtle">{counts[t.key] ?? 0}</span>
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <Empty
          title="No watches in this view"
          body={
            status === 'owned'
              ? 'Import your CSV from Settings or add one above.'
              : 'Nothing here yet.'
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filtered.map((w) => (
              <WatchTile
                key={w.id}
                watch={w}
                lastWorn={lastWorn.get(w.id)}
                wearCount={wearCount.get(w.id) ?? 0}
              />
            ))}
          </div>

          <CompositionSection watches={filtered} />
        </>
      )}
    </div>
  )
}

function CompositionSection({ watches }: { watches: Watch[] }) {
  return (
    <div className="mt-6 pt-6 border-t border-border space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-text-muted">
        Composition
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <BrandMixCard watches={watches} />
        <MovementMixCard watches={watches} />
        <CategoryMixCard watches={watches} />
        <CaseSizeHistogramCard watches={watches} />
        <CaseMaterialMixCard watches={watches} />
        <DecadeHistogramCard watches={watches} />
      </div>
    </div>
  )
}

function WatchTile({
  watch,
  lastWorn,
  wearCount,
}: {
  watch: Watch
  lastWorn?: string
  wearCount: number
}) {
  const muted = watch.status !== 'owned'
  const accent = colorFor(`${watch.brand}|${watch.model}`)
  const daysAgo = lastWorn ? daysSince(lastWorn) : null

  // Sold watches: show days-since-sold and days-owned instead of days-since-worn
  const isSold = watch.status === 'sold'
  const daysSinceSold =
    isSold && watch.saleDate ? daysSince(watch.saleDate) : null
  const daysOwned =
    isSold && watch.acquisitionDate && watch.saleDate
      ? differenceInDays(parseISO(watch.saleDate), parseISO(watch.acquisitionDate))
      : null

  return (
    <Link
      to={`/collection/${watch.id}`}
      className={classNames(
        'group relative block border border-border rounded-lg overflow-hidden bg-surface hover:border-border-strong hover:shadow-sm transition',
        muted && 'opacity-75',
      )}
    >
      <div
        className="absolute left-0 top-0 bottom-0 w-1"
        style={{ backgroundColor: accent }}
      />
      <div className="p-3 pl-4">
        <div className="flex items-start gap-3">
          <Monogram brand={watch.brand} model={watch.model} size={36} rounded="lg" />
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-sm text-text leading-tight truncate">
                  {watch.brand}
                </div>
                <div className="text-xs text-text-muted leading-tight flex items-baseline gap-1 min-w-0">
                  <span className="truncate min-w-0">
                    {watch.model}
                    {watch.reference && (
                      <span className="text-text-subtle"> · {watch.reference}</span>
                    )}
                  </span>
                  {watch.caseDiameterMm != null && (
                    <span className="text-text-subtle shrink-0">
                      · {watch.caseDiameterMm}mm
                    </span>
                  )}
                </div>
              </div>
              <StatusBadge status={watch.status} size="xs" />
            </div>
            {watch.nickname && (
              <div className="text-[11px] text-text-subtle italic mt-0.5 truncate">
                "{watch.nickname}"
              </div>
            )}
          </div>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-[11px] items-baseline">
          <div className="flex items-baseline gap-1">
            <span className="text-text font-medium tabular-nums">{wearCount}</span>
            <span className="text-text-subtle">wears</span>
          </div>
          {isSold ? (
            <div className="flex items-baseline gap-1 justify-center">
              <span className="text-text font-medium tabular-nums">
                {daysSinceSold == null ? '—' : `${daysSinceSold}d`}
              </span>
              <span className="text-text-subtle">since sold</span>
            </div>
          ) : (
            <div className="flex items-baseline gap-1 justify-center">
              <span
                className={classNames(
                  'font-medium tabular-nums',
                  daysAgo == null
                    ? 'text-text-subtle'
                    : daysAgo > 90
                      ? 'text-warning'
                      : 'text-text',
                )}
              >
                {daysAgo == null ? '—' : `${daysAgo}d`}
              </span>
              <span className="text-text-subtle">since worn</span>
            </div>
          )}
          <div className="flex justify-end items-baseline">
            <TileValue watch={watch} />
          </div>
        </div>
        {isSold && daysOwned != null && (
          <div className="mt-1.5 text-[10px] text-text-subtle">
            owned for {daysOwned} days
          </div>
        )}
      </div>
    </Link>
  )
}

function TileValue({ watch }: { watch: Watch }) {
  if (watch.status === 'sold') {
    const cost = watch.acquisitionPriceGbp
    const proceeds = watch.salePriceGbp
    if (cost == null || proceeds == null) {
      return <div className="text-text-subtle tabular-nums ml-auto">P/L —</div>
    }
    const pl = proceeds - cost
    const sign = pl > 0 ? '+' : pl < 0 ? '−' : ''
    return (
      <div
        className={classNames(
          'font-medium tabular-nums ml-auto',
          pl > 0 ? 'text-success' : pl < 0 ? 'text-danger' : 'text-text',
        )}
        title={`Sold ${formatGbp(proceeds)} − cost ${formatGbp(cost)}`}
      >
        {sign}
        {formatGbp(Math.abs(pl))}
      </div>
    )
  }

  // Hide entirely if value is zero or absent
  const value = watch.currentValueGbp
  if (value == null || value === 0) return null

  const cost = watch.acquisitionPriceGbp
  const change = cost != null && cost > 0 ? value - cost : null

  return (
    <div className="flex items-baseline gap-1.5 ml-auto">
      <span className="text-text font-medium tabular-nums">{formatGbp(value)}</span>
      {change != null && (
        <span
          className={classNames(
            'text-[10px] tabular-nums',
            change > 0
              ? 'text-success'
              : change < 0
                ? 'text-danger'
                : 'text-text-subtle',
          )}
          title={`vs cost ${formatGbp(cost!)}`}
        >
          {change > 0 ? '+' : change < 0 ? '−' : ''}
          {formatGbp(Math.abs(change))}
        </span>
      )}
    </div>
  )
}

function BrandMixCard({ watches }: { watches: Watch[] }) {
  const counts = useMemo(() => {
    const m = new Map<string, number>()
    for (const w of watches) m.set(w.brand, (m.get(w.brand) ?? 0) + 1)
    return Array.from(m.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
  }, [watches])

  return (
    <Card title="Brand mix">
      {counts.length === 0 ? (
        <div className="text-xs text-text-muted">No watches.</div>
      ) : (
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={counts}
                dataKey="value"
                nameKey="name"
                innerRadius={32}
                outerRadius={62}
                paddingAngle={1}
              >
                {counts.map((c) => (
                  <Cell key={c.name} fill={colorFor(c.name)} />
                ))}
              </Pie>
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  )
}

function MovementMixCard({ watches }: { watches: Watch[] }) {
  const counts = useMemo(() => {
    const m = new Map<string, number>()
    for (const w of watches) {
      const k = w.movement ?? 'unknown'
      m.set(k, (m.get(k) ?? 0) + 1)
    }
    return Array.from(m.entries()).map(([name, value]) => ({ name: titleCase(name), value }))
  }, [watches])

  return (
    <Card title="Movement mix">
      {counts.length === 0 ? (
        <div className="text-xs text-text-muted">No watches.</div>
      ) : (
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={counts} dataKey="value" nameKey="name" outerRadius={62}>
                {counts.map((_, i) => (
                  <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  )
}

function CategoryMixCard({ watches }: { watches: Watch[] }) {
  const counts = useMemo(() => {
    const m = new Map<string, number>()
    for (const w of watches) {
      if (!w.category) continue
      m.set(w.category, (m.get(w.category) ?? 0) + 1)
    }
    return Array.from(m.entries()).map(([name, value]) => ({ name: titleCase(name), value }))
  }, [watches])

  const filledRatio = counts.reduce((s, c) => s + c.value, 0) / Math.max(watches.length, 1)

  return (
    <Card title="Category mix">
      {counts.length === 0 ? (
        <div className="text-xs text-text-muted">
          Set category on watches in the detail view to see this.
        </div>
      ) : (
        <>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={counts} dataKey="value" nameKey="name" outerRadius={62}>
                  {counts.map((_, i) => (
                    <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          {filledRatio < 1 && (
            <div className="text-[11px] text-text-subtle mt-1">
              {Math.round(filledRatio * 100)}% of watches have a category set
            </div>
          )}
        </>
      )}
    </Card>
  )
}

function CaseSizeHistogramCard({ watches }: { watches: Watch[] }) {
  const rows = useMemo(() => {
    const buckets = new Map<string, number>()
    for (const w of watches) {
      if (w.caseDiameterMm == null) continue
      const size = Math.round(w.caseDiameterMm)
      const key = `${size}mm`
      buckets.set(key, (buckets.get(key) ?? 0) + 1)
    }
    return Array.from(buckets.entries())
      .map(([size, count]) => ({ size, count, sortKey: parseInt(size, 10) }))
      .sort((a, b) => a.sortKey - b.sortKey)
  }, [watches])

  return (
    <Card title="Case size">
      {rows.length === 0 ? (
        <div className="text-xs text-text-muted">
          Add case diameters in the watch detail view to see this.
        </div>
      ) : (
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows}>
              <CartesianGrid stroke="#f4f4f3" vertical={false} />
              <XAxis dataKey="size" fontSize={10} />
              <YAxis fontSize={10} allowDecimals={false} />
              <Tooltip contentStyle={{ fontSize: 11 }} />
              <Bar dataKey="count" fill="#2563eb" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  )
}

function CaseMaterialMixCard({ watches }: { watches: Watch[] }) {
  const counts = useMemo(() => {
    const m = new Map<string, number>()
    for (const w of watches) {
      if (!w.caseMaterial) continue
      m.set(w.caseMaterial, (m.get(w.caseMaterial) ?? 0) + 1)
    }
    return Array.from(m.entries())
      .map(([name, value]) => ({ name: titleCase(name), value }))
      .sort((a, b) => b.value - a.value)
  }, [watches])

  return (
    <Card title="Case material">
      {counts.length === 0 ? (
        <div className="text-xs text-text-muted">
          Add case materials in the watch detail view to see this.
        </div>
      ) : (
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={counts} dataKey="value" nameKey="name" outerRadius={62}>
                {counts.map((c, i) => (
                  <Cell key={c.name} fill={PALETTE[i % PALETTE.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  )
}

function DecadeHistogramCard({ watches }: { watches: Watch[] }) {
  const rows = useMemo(() => {
    const buckets = new Map<number, number>()
    for (const w of watches) {
      if (w.yearProduced == null) continue
      const decade = Math.floor(w.yearProduced / 10) * 10
      buckets.set(decade, (buckets.get(decade) ?? 0) + 1)
    }
    if (buckets.size === 0) return []
    // Fill in gaps so the x-axis is continuous
    const min = Math.min(...buckets.keys())
    const max = Math.max(...buckets.keys())
    const out: Array<{ decade: string; count: number }> = []
    for (let d = min; d <= max; d += 10) {
      out.push({ decade: `${d}s`, count: buckets.get(d) ?? 0 })
    }
    return out
  }, [watches])

  return (
    <Card title="Decade of production">
      {rows.length === 0 ? (
        <div className="text-xs text-text-muted">
          Add production years in the watch detail view to see this.
        </div>
      ) : (
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows}>
              <CartesianGrid stroke="#f4f4f3" vertical={false} />
              <XAxis dataKey="decade" fontSize={10} />
              <YAxis fontSize={10} allowDecimals={false} />
              <Tooltip contentStyle={{ fontSize: 11 }} />
              <Bar dataKey="count" fill="#7c3aed" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  )
}

function AddWatchForm({
  onCancel,
  onSubmit,
}: {
  onCancel: () => void
  onSubmit: (f: { brand: string; model: string; reference?: string }) => Promise<void>
}) {
  const [brand, setBrand] = useState('')
  const [model, setModel] = useState('')
  const [reference, setReference] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <Card title="Add watch">
      <form
        className="grid grid-cols-1 sm:grid-cols-3 gap-2"
        onSubmit={async (e) => {
          e.preventDefault()
          if (!brand.trim() || !model.trim()) return
          setBusy(true)
          try {
            await onSubmit({ brand, model, reference: reference || undefined })
          } finally {
            setBusy(false)
          }
        }}
      >
        <input
          value={brand}
          onChange={(e) => setBrand(e.target.value)}
          placeholder="Brand"
          className="px-2 py-1.5 text-sm border border-border rounded-md bg-bg"
          autoFocus
        />
        <input
          value={model}
          onChange={(e) => setModel(e.target.value)}
          placeholder="Model"
          className="px-2 py-1.5 text-sm border border-border rounded-md bg-bg"
        />
        <input
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          placeholder="Reference (optional)"
          className="px-2 py-1.5 text-sm border border-border rounded-md bg-bg"
        />
        <div className="sm:col-span-3 flex gap-2 justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1.5 text-xs rounded-md border border-border"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy || !brand.trim() || !model.trim()}
            className="px-3 py-1.5 text-xs rounded-md bg-accent text-white disabled:opacity-50"
          >
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </Card>
  )
}
