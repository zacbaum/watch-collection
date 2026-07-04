import { useMemo, useRef, useState } from 'react'
import { nanoid } from 'nanoid'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { Gate } from '../components/Gate'
import { Card } from '../components/Card'
import { Photo } from '../components/Photo'
import { StatusBadge } from '../components/StatusBadge'
import { useData, useDataContext } from '../hooks/useData'
import type {
  Currency,
  Location,
  Money,
  ServiceLogEntry,
  ServiceType,
  Watch,
  WatchCategory,
  WatchStatus,
  WearLogEntry,
  Movement,
} from '../types'
import { serviceDue } from '../lib/service'
import {
  daysSince,
  formatDate,
  formatMoney,
  formatGbp,
  currencySymbols,
  formatLocation,
  titleCase,
  todayIso,
} from '../lib/utils'
import { toGbp } from '../lib/fx'
import { compressImage } from '../lib/image'
import { dbDeletePhoto } from '../lib/db'
import { getCurrentPosition, reverseGeocode } from '../lib/geocode'
import { findNearestKnownCity } from '../lib/cityCoords'
import {
  ChevronLeft,
  Trash2,
  Save,
  ImagePlus,
  X,
  CalendarCheck,
  RefreshCw,
  Wrench,
  Plus,
} from 'lucide-react'
import { differenceInDays, parseISO } from 'date-fns'

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
  const [wearingBusy, setWearingBusy] = useState(false)
  const [wearMessage, setWearMessage] = useState<string | null>(null)

  const wears = useMemo(
    () =>
      data.wearLog
        .filter((e) => e.watchId === id)
        .sort((a, b) => b.date.localeCompare(a.date)),
    [data.wearLog, id],
  )

  async function handleWearToday() {
    if (!watch) return
    setWearingBusy(true)
    setWearMessage(null)
    try {
      // Try geolocation; fall through on denial / failure so we still log the
      // wear (just without a location).
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
            /* lookup failed — still have coords */
          }
        }
        location = { city, country, lat, lng }
        source = 'geolocation'
      } catch {
        /* geolocation denied or unavailable */
      }

      const date = todayIso()
      const entry: WearLogEntry = {
        id: nanoid(10),
        watchId: watch.id,
        date,
        location,
        source,
        createdAt: new Date().toISOString(),
      }
      let replaced = false
      await mutate(
        (d) => {
          const existing = d.wearLog.findIndex((e) => e.date === date)
          const wearLog = [...d.wearLog]
          if (existing >= 0) {
            replaced = true
            wearLog[existing] = { ...entry, id: wearLog[existing].id }
          } else {
            wearLog.push(entry)
          }
          return { ...d, wearLog }
        },
        { message: `Log ${watch.brand} ${watch.model} on ${date}` },
      )
      const locSuffix = location ? '' : ' (no location)'
      setWearMessage(replaced ? `Replaced today's wear ✓${locSuffix}` : `Logged ✓${locSuffix}`)
    } finally {
      setWearingBusy(false)
    }
  }

  async function handleDelete() {
    if (!watch) return
    if (!confirm('Delete this watch and all its wear entries? This cannot be undone outside backup history.'))
      return
    // Drop local photo blobs too (the backup repo keeps its copies in history).
    for (const p of watch.photos ?? []) void dbDeletePhoto(p)
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

      {!editing && watch.photos && watch.photos.length > 0 && (
        <div className="-mx-4 sm:mx-0 sm:rounded-xl overflow-hidden bg-surface-2">
          <Photo
            path={watch.photos[0]}
            alt={`${watch.brand} ${watch.model}`}
            className="w-full aspect-[16/9] object-cover"
          />
        </div>
      )}

      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-display font-medium tracking-tight leading-tight">{watch.brand}</h1>
          <div className="text-sm text-text-muted mt-0.5">
            {watch.model}
            {watch.reference && ` · Ref ${watch.reference}`}
          </div>
          {watch.nickname && (
            <div className="text-xs text-text-subtle italic mt-0.5">"{watch.nickname}"</div>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <StatusBadge status={watch.status} />
          {watch.status === 'owned' && (
            <button
              onClick={handleWearToday}
              disabled={wearingBusy}
              className="px-3 py-1.5 text-xs rounded-md bg-accent text-white disabled:opacity-50 inline-flex items-center gap-1"
            >
              {wearingBusy ? (
                <RefreshCw size={12} className="animate-spin" />
              ) : (
                <CalendarCheck size={12} />
              )}
              Wear today
            </button>
          )}
          <button
            onClick={() => setEditing((v) => !v)}
            className="px-3 py-1.5 text-xs rounded-md border border-border"
          >
            {editing ? 'Cancel' : 'Edit'}
          </button>
        </div>
      </div>
      {wearMessage && (
        <div className="text-xs text-success -mt-2">{wearMessage}</div>
      )}

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

      {!editing && watch.photos && watch.photos.length > 1 && (
        <PhotoGallery photos={watch.photos.slice(1)} />
      )}

      {editing ? (
        <EditForm watch={watch} onClose={() => setEditing(false)} />
      ) : (
        <MetadataView watch={watch} />
      )}

      <WearInsights wears={wears} />

      <ServiceSection watch={watch} serviceLog={data.serviceLog} />

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

function PhotoGallery({ photos }: { photos: string[] }) {
  return (
    <Card title={`Photos (${photos.length})`} padding={false}>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 p-3">
        {photos.map((p) => (
          <Photo
            key={p}
            path={p}
            className="w-full aspect-square object-cover rounded-md border border-border"
          />
        ))}
      </div>
    </Card>
  )
}

function WearInsights({ wears }: { wears: WearLogEntry[] }) {
  // `wears` arrives sorted newest-first (see WatchDetailInner). Reverse a copy
  // for chronological scans.
  const insights = useMemo(() => {
    const asc = [...wears].sort((a, b) => a.date.localeCompare(b.date))
    if (asc.length === 0) return null

    // Longest consecutive-day run wearing this watch
    let bestStreak = 1
    let curLen = 1
    for (let i = 1; i < asc.length; i++) {
      const gap = differenceInDays(parseISO(asc[i].date), parseISO(asc[i - 1].date))
      curLen = gap === 1 ? curLen + 1 : 1
      if (curLen > bestStreak) bestStreak = curLen
    }

    // Longest gap between two wears
    let bestGap = 0
    let bestGapFrom: string | undefined
    let bestGapTo: string | undefined
    for (let i = 1; i < asc.length; i++) {
      const gap = differenceInDays(parseISO(asc[i].date), parseISO(asc[i - 1].date))
      if (gap > bestGap) {
        bestGap = gap
        bestGapFrom = asc[i - 1].date
        bestGapTo = asc[i].date
      }
    }

    const avgGap =
      asc.length < 2
        ? null
        : differenceInDays(parseISO(asc[asc.length - 1].date), parseISO(asc[0].date)) /
          (asc.length - 1)

    const todayMs = Date.now()
    const within = (days: number) => {
      const cutoff = todayMs - days * 86_400_000
      return asc.filter((e) => parseISO(e.date).getTime() >= cutoff).length
    }

    return {
      bestStreak,
      bestGap,
      bestGapFrom,
      bestGapTo,
      avgGap,
      last30: within(30),
      last90: within(90),
      last365: within(365),
    }
  }, [wears])

  if (!insights) return null

  return (
    <Card title="Wear insights">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <InsightTile label="Longest streak" value={`${insights.bestStreak}d`} />
        <InsightTile
          label="Longest gap"
          value={insights.bestGap > 0 ? `${insights.bestGap}d` : '—'}
          sub={
            insights.bestGapFrom && insights.bestGapTo
              ? `${formatDate(insights.bestGapFrom)} → ${formatDate(insights.bestGapTo)}`
              : undefined
          }
        />
        <InsightTile
          label="Avg between wears"
          value={insights.avgGap == null ? '—' : `${insights.avgGap.toFixed(1)}d`}
        />
        <InsightTile label="Last 30 days" value={insights.last30} />
        <InsightTile label="Last 90 days" value={insights.last90} />
        <InsightTile label="Last 365 days" value={insights.last365} />
      </div>
    </Card>
  )
}

function InsightTile({
  label,
  value,
  sub,
}: {
  label: string
  value: React.ReactNode
  sub?: React.ReactNode
}) {
  return (
    <div className="border border-border rounded-md p-2 bg-surface-2/40">
      <div className="text-[10px] uppercase tracking-wide text-text-muted">{label}</div>
      <div className="text-base font-semibold mt-0.5 tabular-nums">{value}</div>
      {sub && <div className="text-[10px] text-text-muted mt-0.5">{sub}</div>}
    </div>
  )
}

const SERVICE_TYPES: ServiceType[] = [
  'full-service',
  'battery',
  'regulation',
  'gasket',
  'polish',
  'repair',
  'other',
]

function ServiceSection({
  watch,
  serviceLog,
}: {
  watch: Watch
  serviceLog: ServiceLogEntry[]
}) {
  const { mutate } = useDataContext()
  const entries = useMemo(
    () =>
      serviceLog
        .filter((e) => e.watchId === watch.id)
        .sort((a, b) => b.date.localeCompare(a.date)),
    [serviceLog, watch.id],
  )
  const due = serviceDue(watch, serviceLog)
  const [adding, setAdding] = useState(false)
  const [date, setDate] = useState(todayIso())
  const [type, setType] = useState<ServiceType>('full-service')
  const [watchmaker, setWatchmaker] = useState('')
  const [cost, setCost] = useState<Money | undefined>(undefined)
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function handleAdd() {
    setBusy(true)
    setErr(null)
    try {
      let costGbp: number | undefined
      if (cost && cost.amount > 0) costGbp = await toGbp(cost, date)
      const entry: ServiceLogEntry = {
        id: nanoid(8),
        watchId: watch.id,
        date,
        type,
        watchmaker: watchmaker.trim() || undefined,
        cost: cost && cost.amount > 0 ? cost : undefined,
        costGbp,
        notes: notes.trim() || undefined,
      }
      await mutate((d) => ({ ...d, serviceLog: [...d.serviceLog, entry] }), {
        message: `Log ${type} for ${watch.brand} ${watch.model}`,
      })
      setAdding(false)
      setDate(todayIso())
      setType('full-service')
      setWatchmaker('')
      setCost(undefined)
      setNotes('')
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete(id: string) {
    await mutate((d) => ({ ...d, serviceLog: d.serviceLog.filter((e) => e.id !== id) }), {
      message: 'Delete service entry',
    })
  }

  // Due status: alarm only on derivable dates (never guess for vintage
  // pieces with no recorded history).
  let dueLine: React.ReactNode = null
  if (due.dueDate != null && due.daysUntil != null) {
    dueLine =
      due.daysUntil < 0 ? (
        <span className="text-danger">
          Service overdue — was due {formatDate(due.dueDate)}
        </span>
      ) : due.daysUntil <= 90 ? (
        <span className="text-warning">
          Service due in {due.daysUntil} day{due.daysUntil === 1 ? '' : 's'} (
          {formatDate(due.dueDate)})
        </span>
      ) : (
        <span className="text-text-muted">Next service due {formatDate(due.dueDate)}</span>
      )
  } else if (watch.serviceIntervalMonths && !due.lastFullService) {
    dueLine = (
      <span className="text-text-subtle">
        No full service recorded yet — log one to start the {watch.serviceIntervalMonths}
        -month countdown.
      </span>
    )
  }

  return (
    <Card
      title={`Service${entries.length > 0 ? ` (${entries.length})` : ''}`}
      action={
        <button
          type="button"
          onClick={() => setAdding((a) => !a)}
          className="text-xs text-accent inline-flex items-center gap-1"
        >
          <Plus size={12} /> {adding ? 'Cancel' : 'Add'}
        </button>
      }
    >
      {dueLine && (
        <div className="text-xs mb-2 flex items-center gap-1.5">
          <Wrench size={12} className="shrink-0 text-text-muted" />
          {dueLine}
        </div>
      )}

      {adding && (
        <div className="border border-border rounded-md p-3 mb-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
          <Input label="Date" type="date" value={date} onChange={setDate} />
          <Select<ServiceType>
            label="Type"
            value={type}
            options={SERVICE_TYPES}
            onChange={setType}
          />
          <Input label="Watchmaker" value={watchmaker} onChange={setWatchmaker} />
          <MoneyInput
            label="Cost"
            value={cost}
            onAmount={(amount) =>
              setCost((prev) => ({ amount, currency: prev?.currency ?? 'GBP' }))
            }
            onCurrency={(currency) =>
              setCost((prev) => ({ amount: prev?.amount ?? 0, currency }))
            }
          />
          <label className="text-xs text-text-muted block sm:col-span-2">
            Notes
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="mt-1 block w-full text-sm px-2 py-1.5 border border-border rounded-md bg-bg"
            />
          </label>
          {err && <div className="text-xs text-danger sm:col-span-2">{err}</div>}
          <div className="sm:col-span-2 flex justify-end">
            <button
              type="button"
              onClick={() => void handleAdd()}
              disabled={busy}
              className="px-3 py-1.5 text-xs rounded-md bg-accent text-white disabled:opacity-50"
            >
              {busy ? 'Saving…' : 'Save service'}
            </button>
          </div>
        </div>
      )}

      {entries.length === 0 ? (
        !dueLine && (
          <div className="text-xs text-text-muted">
            No service history. Set a service interval in Edit to get due dates.
          </div>
        )
      ) : (
        <ul className="divide-y divide-border -mx-3 sm:-mx-4">
          {entries.map((e) => (
            <li key={e.id} className="px-3 sm:px-4 py-2 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm text-text">
                  {titleCase(e.type)}
                  {e.watchmaker && (
                    <span className="text-text-muted"> · {e.watchmaker}</span>
                  )}
                </div>
                <div className="text-[11px] text-text-muted mt-0.5">
                  {formatDate(e.date)}
                  {e.costGbp != null && <> · {formatGbp(e.costGbp)}</>}
                </div>
                {e.notes && (
                  <div className="text-[11px] text-text-subtle mt-0.5 whitespace-pre-wrap">
                    {e.notes}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => void handleDelete(e.id)}
                className="text-text-subtle hover:text-danger shrink-0"
                title="Delete entry"
              >
                <Trash2 size={13} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
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
    <div className="border border-border rounded-lg p-4 bg-surface">
      <div className="text-[11px] uppercase tracking-wide text-text-muted">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      {sub && <div className="text-[11px] text-text-muted mt-0.5">{sub}</div>}
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
  const { mutate, backupPhoto } = useDataContext()
  const [w, setW] = useState<Watch>({ ...watch })
  const [busy, setBusy] = useState(false)
  const [saveErr, setSaveErr] = useState<string | null>(null)
  const [photoBusy, setPhotoBusy] = useState(false)
  const [photoError, setPhotoError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)

  function update<K extends keyof Watch>(key: K, value: Watch[K]) {
    setW((prev) => ({ ...prev, [key]: value }))
  }

  async function handlePhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // reset so same file can be re-picked
    if (!file) return
    setPhotoBusy(true)
    setPhotoError(null)
    try {
      const blob = await compressImage(file)
      const path = `photos/${watch.id}-${nanoid(6)}.jpg`
      await backupPhoto(path, blob) // stores locally; pushes to backup if configured
      setW((prev) => ({ ...prev, photos: [...(prev.photos ?? []), path] }))
    } catch (err) {
      setPhotoError((err as Error).message)
    } finally {
      setPhotoBusy(false)
    }
  }

  function removePhoto(path: string) {
    setW((prev) => ({
      ...prev,
      photos: (prev.photos ?? []).filter((p) => p !== path),
    }))
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
    setSaveErr(null)
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
    } catch (e) {
      // Typically an FX lookup failure — nothing was saved; the user can
      // retry once online or switch the price currency to GBP.
      setSaveErr((e as Error).message)
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
        <NumberInput
          label="Service interval (months)"
          value={w.serviceIntervalMonths}
          onChange={(v) => update('serviceIntervalMonths', v)}
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
      <div className="mt-4">
        <div className="flex items-center justify-between gap-2">
          <label className="text-xs text-text-muted">
            Photos {(w.photos?.length ?? 0) > 0 && `(${w.photos!.length})`}
          </label>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={photoBusy}
            className="px-2 py-1 text-xs rounded-md border border-border inline-flex items-center gap-1 disabled:opacity-50"
          >
            <ImagePlus size={12} />
            {photoBusy ? 'Uploading…' : 'Upload'}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handlePhotoSelect}
          />
        </div>
        {photoError && (
          <div className="text-[11px] text-danger mt-1">{photoError}</div>
        )}
        {(w.photos?.length ?? 0) > 0 && (
          <div className="mt-2 grid grid-cols-3 sm:grid-cols-4 gap-2">
            {w.photos!.map((p) => (
              <div key={p} className="relative group">
                <Photo
                  path={p}
                  className="w-full aspect-square object-cover rounded-md border border-border"
                />
                <button
                  type="button"
                  onClick={() => removePhoto(p)}
                  className="absolute top-1 right-1 w-5 h-5 rounded-full bg-bg/90 border border-border text-text-muted hover:text-danger flex items-center justify-center"
                  title="Remove photo"
                  aria-label="Remove photo"
                >
                  <X size={11} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      {saveErr && <div className="mt-3 text-xs text-danger">{saveErr}</div>}
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
