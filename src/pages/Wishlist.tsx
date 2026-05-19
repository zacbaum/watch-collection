import { useState } from 'react'
import { nanoid } from 'nanoid'
import { Gate } from '../components/Gate'
import { Card } from '../components/Card'
import { Empty } from '../components/Empty'
import { useData, useDataContext } from '../hooks/useData'
import type { Currency, WishlistItem } from '../types'
import { formatMoney, todayIso, classNames, currencySymbols } from '../lib/utils'
import { Plus, Trash2, Heart } from 'lucide-react'
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

      {adding && <AddForm onCancel={() => setAdding(false)} onSubmit={add} />}

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
          {sorted.map((w) => (
            <Card key={w.id}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-medium text-sm">{w.brand}</div>
                  <div className="text-xs text-text-muted">
                    {w.model}
                    {w.reference && ` · ${w.reference}`}
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <Priority value={w.priority} />
                  <button
                    onClick={() => void remove(w.id)}
                    className="text-text-subtle hover:text-danger"
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
          ))}
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

function AddForm({
  onCancel,
  onSubmit,
}: {
  onCancel: () => void
  onSubmit: (item: Omit<WishlistItem, 'id' | 'addedDate'>) => Promise<void>
}) {
  const [brand, setBrand] = useState('')
  const [model, setModel] = useState('')
  const [reference, setReference] = useState('')
  const [priority, setPriority] = useState<1 | 2 | 3 | 4 | 5>(3)
  const [currency, setCurrency] = useState<Currency>('GBP')
  const [amount, setAmount] = useState('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)

  return (
    <Card title="Add wishlist item">
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
          placeholder="Notes / links (one per line)"
          rows={2}
          className="sm:col-span-2 px-2 py-1.5 text-sm border border-border rounded-md bg-bg"
        />
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
