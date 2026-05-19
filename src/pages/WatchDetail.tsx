import { useMemo, useState } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { Gate } from '../components/Gate'
import { Card } from '../components/Card'
import { StatusBadge } from '../components/StatusBadge'
import { useData, useDataContext } from '../hooks/useData'
import type { Currency, Money, Watch, WatchCategory, WatchStatus, Movement } from '../types'
import {
  daysSince,
  formatDate,
  formatMoney,
  formatGbp,
  currencySymbols,
  formatLocation,
  titleCase,
} from '../lib/utils'
import { toGbp } from '../lib/fx'
import { ChevronLeft, Trash2, Save } from 'lucide-react'

export function WatchDetail() {
  return (
    <Gate>
      <WatchDetailInner />
    </Gate>
  )
}

const CURRENCIES: Currency[] = ['GBP', 'USD', 'EUR', 'CAD', 'CHF', 'AUD', 'JPY', 'SGD', 'HKD']
const MOVEMENTS: Movement[] = [
  'automatic',
  'manual',
  'quartz',
  'spring-drive',
  'solar',
  'kinetic',
  'smart',
  'other',
]
const CATEGORIES: WatchCategory[] = [
  'dress',
  'sport',
  'diver',
  'chronograph',
  'gmt',
  'pilot',
  'field',
  'racing',
  'casual',
  'smart',
  'other',
]

function WatchDetailInner() {
  const { id } = useParams()
  const navigate = useNavigate()
  const data = useData()
  const { mutate } = useDataContext()
  const watch = data.watches.find((w) => w.id === id)
  const [editing, setEditing] = useState(false)

  const wears = useMemo(
    () =>
      data.wearLog
        .filter((e) => e.watchId === id)
        .sort((a, b) => b.date.localeCompare(a.date)),
    [data.wearLog, id],
  )

  async function handleDelete() {
    if (!watch) return
    if (!confirm('Delete this watch and all its wear entries? This cannot be undone outside git history.'))
      return
    await mutate(
      (d) => ({
        ...d,
        watches: d.watches.filter((w) => w.id !== watch.id),
        wearLog: d.wearLog.filter((e) => e.watchId !== watch.id),
        valuations: d.valuations.filter((v) => v.watchId !== watch.id),
        serviceLog: d.serviceLog.filter((s) => s.watchId !== watch.id),
      }),
      { message: `Delete ${watch.brand} ${watch.model}` },
    )
    navigate('/collection')
  }

  if (!watch) {
    return (
      <div className="space-y-3">
        <Link to="/collection" className="text-xs text-accent inline-flex items-center gap-1">
          <ChevronLeft size={12} /> Collection
        </Link>
        <div className="text-sm">Watch not found.</div>
      </div>
    )
  }

  const lastWorn = wears[0]?.date
  const firstWorn = wears[wears.length - 1]?.date

  return (
    <div className="space-y-4">
      <Link to="/collection" className="text-xs text-accent inline-flex items-center gap-1">
        <ChevronLeft size={12} /> Collection
      </Link>

      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{watch.brand}</h1>
          <div className="text-sm text-text-muted">
            {watch.model}
            {watch.reference && ` · Ref ${watch.reference}`}
          </div>
          {watch.nickname && (
            <div className="text-xs text-text-subtle italic mt-0.5">"{watch.nickname}"</div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={watch.status} />
          <button
            onClick={() => setEditing((v) => !v)}
            className="px-3 py-1.5 text-xs rounded-md border border-border"
          >
            {editing ? 'Cancel' : 'Edit'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Tile label="Times worn" value={wears.length} />
        <Tile
          label="Last worn"
          value={lastWorn ? `${daysSince(lastWorn)}d ago` : 'never'}
          sub={lastWorn && formatDate(lastWorn)}
        />
        <Tile label="First worn" value={firstWorn ? formatDate(firstWorn) : '—'} />
        <Tile
          label="Acquisition"
          value={watch.acquisitionPriceGbp ? formatGbp(watch.acquisitionPriceGbp) : '—'}
          sub={watch.acquisitionDate ? formatDate(watch.acquisitionDate) : undefined}
        />
      </div>

      {watch.status === 'sold' && <SaleSummary watch={watch} />}

      {editing ? (
        <EditForm watch={watch} onClose={() => setEditing(false)} />
      ) : (
        <MetadataView watch={watch} />
      )}

      <Card title={`Wear log (${wears.length})`}>
        {wears.length === 0 ? (
          <div className="text-xs text-text-muted">No wears yet.</div>
        ) : (
          <ul className="divide-y divide-border -mx-4 max-h-[400px] overflow-y-auto">
            {wears.map((e) => (
              <li key={e.id} className="px-4 py-1.5 flex items-center justify-between text-xs">
                <span>{formatDate(e.date)}</span>
                <span className="text-text-muted truncate ml-3">
                  {formatLocation(e.location) || (e.source === 'imported' ? 'imported' : '')}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="flex justify-end">
        <button
          onClick={handleDelete}
          className="px-3 py-1.5 text-xs rounded-md border border-border text-danger inline-flex items-center gap-1"
        >
          <Trash2 size={12} /> Delete watch
        </button>
      </div>
    </div>
  )
}

function SaleSummary({ watch }: { watch: Watch }) {
  const cost = watch.acquisitionPriceGbp
  const proceeds = watch.salePriceGbp
  const pl = cost != null && proceeds != null ? proceeds - cost : null
  const pct = cost != null && proceeds != null && cost > 0 ? (proceeds - cost) / cost : null
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      <Tile
        label="Sale price"
        value={proceeds != null ? formatGbp(proceeds) : '—'}
        sub={watch.saleDate ? formatDate(watch.saleDate) : undefined}
      />
      <Tile label="Cost basis" value={cost != null ? formatGbp(cost) : '—'} />
      <Tile
        label="Realised P/L"
        value={
          pl == null ? (
            '—'
          ) : (
            <span className={pl > 0 ? 'text-success' : pl < 0 ? 'text-danger' : undefined}>
              {pl > 0 ? '+' : pl < 0 ? '−' : ''}
              {formatGbp(Math.abs(pl))}
            </span>
          )
        }
        sub={
          pct != null
            ? `${pct > 0 ? '+' : ''}${(pct * 100).toFixed(1)}%`
            : undefined
        }
      />
    </div>
  )
}

function Tile({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="border border-border rounded-lg p-3 bg-surface">
      <div className="text-[11px] uppercase tracking-wide text-text-muted">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
      {sub && <div className="text-[11px] text-text-muted">{sub}</div>}
    </div>
  )
}

function MetadataView({ watch }: { watch: Watch }) {
  const rows: Array<[string, React.ReactNode]> = [
    ['Status', <StatusBadge status={watch.status} size="xs" />],
    ['Reference', watch.reference],
    ['Category', titleCase(watch.category) || null],
    ['Movement', titleCase(watch.movement) || null],
    ['Caliber', watch.caliber],
    ['Case material', titleCase(watch.caseMaterial) || null],
    ['Case Ø', watch.caseDiameterMm ? `${watch.caseDiameterMm} mm` : null],
    ['Thickness', watch.caseThicknessMm ? `${watch.caseThicknessMm} mm` : null],
    ['Lug width', watch.lugWidthMm ? `${watch.lugWidthMm} mm` : null],
    ['Water resistance', watch.waterResistanceM ? `${watch.waterResistanceM} m` : null],
    ['Dial', titleCase(watch.dialColor) || null],
    ['Bezel', titleCase(watch.bezel) || null],
    ['Crystal', titleCase(watch.crystal) || null],
    ['Year produced', watch.yearProduced],
    ['Acquired', watch.acquisitionDate ? formatDate(watch.acquisitionDate) : null],
    ['Price', formatMoney(watch.acquisitionPrice)],
    ['Price (GBP)', watch.acquisitionPriceGbp ? formatGbp(watch.acquisitionPriceGbp) : null],
    ['Source', watch.wasGift ? 'Gift' : watch.acquisitionSource],
    ['Current value', formatMoney(watch.currentValue)],
    ['Current value (GBP)', watch.currentValueGbp ? formatGbp(watch.currentValueGbp) : null],
    ['Valued on', watch.valueDate ? formatDate(watch.valueDate) : null],
    ['Sale date', watch.saleDate ? formatDate(watch.saleDate) : null],
    ['Sale price', formatMoney(watch.salePrice)],
    ['Gifted to', watch.giftedTo],
    ['Gifted on', watch.giftedDate ? formatDate(watch.giftedDate) : null],
  ]
  return (
    <Card title="Details">
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
        {rows
          .filter(([, v]) => v != null && v !== '—' && v !== '')
          .map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3 border-b border-border/50 py-1">
              <dt className="text-text-muted text-xs">{k}</dt>
              <dd className="text-text text-right">{v}</dd>
            </div>
          ))}
      </dl>
      {watch.notes && (
        <div className="mt-3 text-sm whitespace-pre-wrap">{watch.notes}</div>
      )}
    </Card>
  )
}

function EditForm({ watch, onClose }: { watch: Watch; onClose: () => void }) {
  const { mutate } = useDataContext()
  const [w, setW] = useState<Watch>({ ...watch })
  const [busy, setBusy] = useState(false)

  function update<K extends keyof Watch>(key: K, value: Watch[K]) {
    setW((prev) => ({ ...prev, [key]: value }))
  }

  function updateMoney(
    key: 'acquisitionPrice' | 'currentValue' | 'salePrice',
    patch: Partial<Money>,
  ) {
    setW((prev) => {
      const current: Money = prev[key] ?? { amount: 0, currency: 'GBP' }
      return { ...prev, [key]: { ...current, ...patch } }
    })
  }

  async function handleSave() {
    setBusy(true)
    try {
      const updated: Watch = { ...w, updatedAt: new Date().toISOString() }

      // Recompute GBP snapshots from each money field if dates available
      if (updated.acquisitionPrice && updated.acquisitionPrice.amount > 0) {
        const date = updated.acquisitionDate || w.acquisitionDate
        const fallbackDate = date ?? new Date().toISOString().slice(0, 10)
        updated.acquisitionPriceGbp = await toGbp(updated.acquisitionPrice, fallbackDate)
      } else {
        updated.acquisitionPriceGbp = undefined
      }
      if (updated.currentValue && updated.currentValue.amount > 0) {
        const date = updated.valueDate ?? new Date().toISOString().slice(0, 10)
        updated.currentValueGbp = await toGbp(updated.currentValue, date)
      } else {
        updated.currentValueGbp = undefined
      }
      if (updated.salePrice && updated.salePrice.amount > 0) {
        const date = updated.saleDate ?? new Date().toISOString().slice(0, 10)
        updated.salePriceGbp = await toGbp(updated.salePrice, date)
      } else {
        updated.salePriceGbp = undefined
      }

      await mutate(
        (d) => ({
          ...d,
          watches: d.watches.map((x) => (x.id === updated.id ? updated : x)),
        }),
        { message: `Update ${updated.brand} ${updated.model}` },
      )
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card title="Edit watch">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Input label="Brand" value={w.brand} onChange={(v) => update('brand', v)} />
        <Input label="Model" value={w.model} onChange={(v) => update('model', v)} />
        <Input
          label="Reference"
          value={w.reference ?? ''}
          onChange={(v) => update('reference', v || undefined)}
        />
        <Input
          label="Nickname"
          value={w.nickname ?? ''}
          onChange={(v) => update('nickname', v || undefined)}
        />
        <Select<WatchStatus>
          label="Status"
          value={w.status}
          options={['owned', 'sold', 'gifted']}
          onChange={(v) => update('status', v)}
        />
        <Select<WatchCategory | ''>
          label="Category"
          value={w.category ?? ''}
          options={['', ...CATEGORIES]}
          onChange={(v) => update('category', (v || undefined) as WatchCategory | undefined)}
        />
        <Select<Movement | ''>
          label="Movement"
          value={w.movement ?? ''}
          options={['', ...MOVEMENTS]}
          onChange={(v) => update('movement', (v || undefined) as Movement | undefined)}
        />
        <Input
          label="Caliber"
          value={w.caliber ?? ''}
          onChange={(v) => update('caliber', v || undefined)}
        />
        <Input
          label="Case material"
          value={w.caseMaterial ?? ''}
          onChange={(v) => update('caseMaterial', v || undefined)}
        />
        <NumberInput
          label="Case Ø (mm)"
          value={w.caseDiameterMm}
          onChange={(v) => update('caseDiameterMm', v)}
        />
        <NumberInput
          label="Thickness (mm)"
          value={w.caseThicknessMm}
          onChange={(v) => update('caseThicknessMm', v)}
        />
        <NumberInput
          label="Lug width (mm)"
          value={w.lugWidthMm}
          onChange={(v) => update('lugWidthMm', v)}
        />
        <NumberInput
          label="Water resistance (m)"
          value={w.waterResistanceM}
          onChange={(v) => update('waterResistanceM', v)}
        />
        <Input
          label="Dial color"
          value={w.dialColor ?? ''}
          onChange={(v) => update('dialColor', v || undefined)}
        />
        <Input
          label="Bezel"
          value={w.bezel ?? ''}
          onChange={(v) => update('bezel', v || undefined)}
        />
        <Input
          label="Crystal"
          value={w.crystal ?? ''}
          onChange={(v) => update('crystal', v || undefined)}
        />
        <NumberInput
          label="Year produced"
          value={w.yearProduced}
          onChange={(v) => update('yearProduced', v)}
        />

        <Input
          label="Acquisition date"
          type="date"
          value={w.acquisitionDate ?? ''}
          onChange={(v) => update('acquisitionDate', v || undefined)}
        />
        <MoneyInput
          label="Acquisition price"
          value={w.acquisitionPrice}
          onAmount={(amount) => updateMoney('acquisitionPrice', { amount })}
          onCurrency={(currency) => updateMoney('acquisitionPrice', { currency })}
        />
        <Input
          label="Source"
          value={w.acquisitionSource ?? ''}
          onChange={(v) => update('acquisitionSource', v || undefined)}
        />
        <label className="text-xs text-text-muted flex items-center gap-2 self-end pb-2">
          <input
            type="checkbox"
            checked={!!w.wasGift}
            onChange={(e) => update('wasGift', e.target.checked || undefined)}
          />
          Received as a gift (exclude from spend metrics)
        </label>

        <MoneyInput
          label="Current value"
          value={w.currentValue}
          onAmount={(amount) => updateMoney('currentValue', { amount })}
          onCurrency={(currency) => updateMoney('currentValue', { currency })}
        />
        <Input
          label="Valued on"
          type="date"
          value={w.valueDate ?? ''}
          onChange={(v) => update('valueDate', v || undefined)}
        />

        {w.status === 'sold' && (
          <>
            <Input
              label="Sale date"
              type="date"
              value={w.saleDate ?? ''}
              onChange={(v) => update('saleDate', v || undefined)}
            />
            <MoneyInput
              label="Sale price"
              value={w.salePrice}
              onAmount={(amount) => updateMoney('salePrice', { amount })}
              onCurrency={(currency) => updateMoney('salePrice', { currency })}
            />
          </>
        )}
        {w.status === 'gifted' && (
          <>
            <Input
              label="Gifted to"
              value={w.giftedTo ?? ''}
              onChange={(v) => update('giftedTo', v || undefined)}
            />
            <Input
              label="Gifted on"
              type="date"
              value={w.giftedDate ?? ''}
              onChange={(v) => update('giftedDate', v || undefined)}
            />
          </>
        )}
      </div>
      <div className="mt-3">
        <label className="text-xs text-text-muted">Notes</label>
        <textarea
          value={w.notes ?? ''}
          onChange={(e) => update('notes', e.target.value || undefined)}
          rows={3}
          className="mt-1 block w-full text-sm px-2 py-1.5 border border-border rounded-md bg-bg"
        />
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button onClick={onClose} className="px-3 py-1.5 text-xs rounded-md border border-border">
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={busy}
          className="px-3 py-1.5 text-xs rounded-md bg-accent text-white flex items-center gap-1 disabled:opacity-50"
        >
          <Save size={12} /> {busy ? 'Saving…' : 'Save'}
        </button>
      </div>
    </Card>
  )
}

function Input({
  label,
  value,
  onChange,
  type = 'text',
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: 'text' | 'date'
}) {
  return (
    <label className="text-xs text-text-muted block">
      {label}
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 block w-full text-sm px-2 py-1.5 border border-border rounded-md bg-bg"
      />
    </label>
  )
}

function NumberInput({
  label,
  value,
  onChange,
}: {
  label: string
  value: number | undefined
  onChange: (v: number | undefined) => void
}) {
  return (
    <label className="text-xs text-text-muted block">
      {label}
      <input
        type="number"
        value={value ?? ''}
        onChange={(e) => {
          const v = e.target.value
          onChange(v === '' ? undefined : Number(v))
        }}
        className="mt-1 block w-full text-sm px-2 py-1.5 border border-border rounded-md bg-bg"
      />
    </label>
  )
}

function Select<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: readonly T[]
  onChange: (v: T) => void
}) {
  return (
    <label className="text-xs text-text-muted block">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="mt-1 block w-full text-sm px-2 py-1.5 border border-border rounded-md bg-bg"
      >
        {options.map((o) => (
          <option key={o || '_'} value={o}>
            {o ? titleCase(o) : '—'}
          </option>
        ))}
      </select>
    </label>
  )
}

function MoneyInput({
  label,
  value,
  onAmount,
  onCurrency,
}: {
  label: string
  value: Money | undefined
  onAmount: (n: number) => void
  onCurrency: (c: Currency) => void
}) {
  return (
    <label className="text-xs text-text-muted block">
      {label}
      <div className="mt-1 flex gap-1">
        <select
          value={value?.currency ?? 'GBP'}
          onChange={(e) => onCurrency(e.target.value as Currency)}
          className="text-sm px-1.5 py-1.5 border border-border rounded-md bg-bg w-16"
        >
          {CURRENCIES.map((c) => (
            <option key={c} value={c}>
              {currencySymbols[c].trim() || c}
            </option>
          ))}
        </select>
        <input
          type="number"
          step="any"
          value={value?.amount ?? ''}
          onChange={(e) =>
            onAmount(e.target.value === '' ? 0 : Number(e.target.value))
          }
          className="flex-1 text-sm px-2 py-1.5 border border-border rounded-md bg-bg"
        />
      </div>
    </label>
  )
}
