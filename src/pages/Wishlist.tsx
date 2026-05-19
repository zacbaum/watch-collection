import { useRef, useState } from 'react'
import { nanoid } from 'nanoid'
import { Gate } from '../components/Gate'
import { Card } from '../components/Card'
import { Empty } from '../components/Empty'
import { Photo } from '../components/Photo'
import { useData, useDataContext } from '../hooks/useData'
import type { Currency, WishlistItem } from '../types'
import { formatMoney, todayIso, classNames, currencySymbols } from '../lib/utils'
import { loadAuth } from '../lib/auth'
import { uploadPhoto } from '../lib/storage'
import { Plus, Trash2, Heart, Pencil, ImagePlus, X } from 'lucide-react'
import { computeInsights } from '../lib/insights'

const CURRENCIES: Currency[] = ['GBP', 'USD', 'EUR', 'CHF', 'JPY']

export function Wishlist() {
  return (
    <Gate>
      <WishlistInner />
    </Gate>
  )
}

function WishlistInner() {
  const data = useData()
  const { mutate } = useDataContext()
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  const insights = computeInsights(data.watches)

  async function add(item: Omit<WishlistItem, 'id' | 'addedDate'>) {
    const wi: WishlistItem = {
      ...item,
      id: nanoid(8),
      addedDate: todayIso(),
    }
    await mutate((d) => ({ ...d, wishlist: [...d.wishlist, wi] }), {
      message: `Add wishlist: ${wi.brand} ${wi.model}`,
    })
    setAdding(false)
  }

  async function update(id: string, patch: Omit<WishlistItem, 'id' | 'addedDate'>) {
    await mutate(
      (d) => ({
        ...d,
        wishlist: d.wishlist.map((w) =>
          w.id === id ? { ...w, ...patch, id: w.id, addedDate: w.addedDate } : w,
        ),
      }),
      { message: `Update wishlist: ${patch.brand} ${patch.model}` },
    )
    setEditingId(null)
  }

  async function remove(id: string) {
    await mutate((d) => ({ ...d, wishlist: d.wishlist.filter((w) => w.id !== id) }), {
      message: 'Remove wishlist item',
    })
  }

  const sorted = [...data.wishlist].sort((a, b) => b.priority - a.priority)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Wishlist</h1>
        <button
          onClick={() => setAdding((a) => !a)}
          className="px-3 py-1.5 text-xs rounded-md bg-accent text-white flex items-center gap-1"
        >
          <Plus size={14} /> Add want
        </button>
      </div>

      {adding && <Form onCancel={() => setAdding(false)} onSubmit={add} />}

      {insights.gaps.length > 0 && (
        <Card title="Suggested by gap analysis">
          <ul className="space-y-2 text-sm">
            {insights.gaps.map((g, i) => (
              <li key={i} className="flex items-start gap-2">
                <Heart size={14} className="text-accent mt-0.5 shrink-0" />
                <div>
                  <div className="font-medium">{g.title}</div>
                  <div className="text-xs text-text-muted">{g.detail}</div>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {sorted.length === 0 ? (
        <Empty title="No wants yet" body="Add watches you're hunting for and tag them with priority." />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {sorted.map((w) =>
            editingId === w.id ? (
              <Form
                key={w.id}
                initial={w}
                onCancel={() => setEditingId(null)}
                onSubmit={(patch) => update(w.id, patch)}
              />
            ) : (
              <Card key={w.id}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-3 min-w-0">
                    {w.imageUrl && (
                      <Photo
                        path={w.imageUrl}
                        className="w-14 h-14 rounded-md object-cover border border-border shrink-0"
                      />
                    )}
                    <div className="min-w-0">
                      <div className="font-medium text-sm truncate">{w.brand}</div>
                      <div className="text-xs text-text-muted truncate">
                        {w.model}
                        {w.reference && ` · ${w.reference}`}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Priority value={w.priority} />
                    <button
                      onClick={() => setEditingId(w.id)}
                      className="text-text-subtle hover:text-text"
                      title="Edit"
                      aria-label="Edit wishlist item"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => void remove(w.id)}
                      className="text-text-subtle hover:text-danger"
                      title="Remove"
                      aria-label="Remove wishlist item"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                {w.targetPrice && (
                  <div className="text-xs text-text-muted mt-2">
                    Target: {formatMoney(w.targetPrice)}
                  </div>
                )}
                {w.notes && <div className="text-xs mt-2 whitespace-pre-wrap">{w.notes}</div>}
                {w.links && w.links.length > 0 && (
                  <div className="text-xs mt-2 space-y-0.5">
                    {w.links.map((l, i) => (
                      <div key={i}>
                        <a
                          href={l}
                          target="_blank"
                          rel="noreferrer"
                          className="text-accent underline truncate block"
                        >
                          {l}
                        </a>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            ),
          )}
        </div>
      )}
    </div>
  )
}

function Priority({ value }: { value: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <div
          key={i}
          className={classNames(
            'w-1.5 h-3 rounded-sm',
            i <= value ? 'bg-accent' : 'bg-border',
          )}
        />
      ))}
    </div>
  )
}

function Form({
  initial,
  onCancel,
  onSubmit,
}: {
  initial?: WishlistItem
  onCancel: () => void
  onSubmit: (item: Omit<WishlistItem, 'id' | 'addedDate'>) => Promise<void>
}) {
  const [brand, setBrand] = useState(initial?.brand ?? '')
  const [model, setModel] = useState(initial?.model ?? '')
  const [reference, setReference] = useState(initial?.reference ?? '')
  const [priority, setPriority] = useState<1 | 2 | 3 | 4 | 5>(initial?.priority ?? 3)
  const [currency, setCurrency] = useState<Currency>(
    initial?.targetPrice?.currency ?? 'GBP',
  )
  const [amount, setAmount] = useState(
    initial?.targetPrice ? String(initial.targetPrice.amount) : '',
  )
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [imageUrl, setImageUrl] = useState<string | undefined>(initial?.imageUrl)
  const [busy, setBusy] = useState(false)
  const [photoBusy, setPhotoBusy] = useState(false)
  const [photoError, setPhotoError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)

  async function handlePhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const cfg = loadAuth()
    if (!cfg) {
      setPhotoError('Not authenticated.')
      return
    }
    setPhotoBusy(true)
    setPhotoError(null)
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
      const idSlug = initial?.id ?? 'wishlist'
      const filename = `${idSlug}-${nanoid(6)}.${ext}`
      const path = await uploadPhoto(cfg, filename, file)
      setImageUrl(path)
    } catch (err) {
      setPhotoError((err as Error).message)
    } finally {
      setPhotoBusy(false)
    }
  }

  return (
    <Card title={initial ? 'Edit wishlist item' : 'Add wishlist item'}>
      <form
        onSubmit={async (e) => {
          e.preventDefault()
          if (!brand.trim() || !model.trim()) return
          setBusy(true)
          try {
            await onSubmit({
              brand: brand.trim(),
              model: model.trim(),
              reference: reference.trim() || undefined,
              priority,
              targetPrice: amount
                ? { amount: Number(amount), currency }
                : undefined,
              notes: notes.trim() || undefined,
              imageUrl,
              // Preserve fields not exposed in the form
              links: initial?.links,
              targetPriceGbp: initial?.targetPriceGbp,
              category: initial?.category,
            })
          } finally {
            setBusy(false)
          }
        }}
        className="grid grid-cols-1 sm:grid-cols-2 gap-2"
      >
        <input
          value={brand}
          onChange={(e) => setBrand(e.target.value)}
          placeholder="Brand"
          autoFocus
          className="px-2 py-1.5 text-sm border border-border rounded-md bg-bg"
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
          placeholder="Reference"
          className="px-2 py-1.5 text-sm border border-border rounded-md bg-bg"
        />
        <div className="flex items-center gap-2 text-xs">
          <span className="text-text-muted">Priority</span>
          {[1, 2, 3, 4, 5].map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPriority(p as 1 | 2 | 3 | 4 | 5)}
              className={classNames(
                'w-6 h-6 text-xs rounded-md border',
                p <= priority ? 'bg-accent text-white border-accent' : 'border-border',
              )}
            >
              {p}
            </button>
          ))}
        </div>
        <div className="flex gap-1">
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value as Currency)}
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
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Target price"
            className="flex-1 text-sm px-2 py-1.5 border border-border rounded-md bg-bg"
          />
        </div>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notes"
          rows={2}
          className="sm:col-span-2 px-2 py-1.5 text-sm border border-border rounded-md bg-bg"
        />
        <div className="sm:col-span-2 flex items-start gap-3">
          {imageUrl ? (
            <div className="relative">
              <Photo
                path={imageUrl}
                className="w-20 h-20 rounded-md object-cover border border-border"
              />
              <button
                type="button"
                onClick={() => setImageUrl(undefined)}
                className="absolute top-1 right-1 w-5 h-5 rounded-full bg-bg/90 border border-border text-text-muted hover:text-danger flex items-center justify-center"
                title="Remove photo"
                aria-label="Remove photo"
              >
                <X size={11} />
              </button>
            </div>
          ) : (
            <div className="w-20 h-20 rounded-md border border-dashed border-border bg-surface-2 flex items-center justify-center text-text-subtle text-[10px]">
              no photo
            </div>
          )}
          <div className="flex flex-col gap-1">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={photoBusy}
              className="px-2 py-1 text-xs rounded-md border border-border inline-flex items-center gap-1 disabled:opacity-50"
            >
              <ImagePlus size={12} />
              {photoBusy ? 'Uploading…' : imageUrl ? 'Replace photo' : 'Upload photo'}
            </button>
            {photoError && (
              <div className="text-[11px] text-danger">{photoError}</div>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handlePhotoSelect}
            />
          </div>
        </div>
        <div className="sm:col-span-2 flex justify-end gap-2">
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
