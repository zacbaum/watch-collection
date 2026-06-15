import { useMemo, useState, type FormEvent } from 'react'
import { useDataContext } from '../hooks/useData'
import { clearAuth, saveAuth, verifyAuth } from '../lib/auth'
import { importFromCsv, mergeImport } from '../lib/importer'
import type { AuthConfig, WearLogEntry } from '../types'
import { Card } from '../components/Card'
import { CheckCircle2, AlertCircle, Upload, Trash2, LogOut } from 'lucide-react'
import {
  THEMES,
  MODES,
  getTheme,
  getMode,
  setTheme,
  setMode,
  type ThemeName,
  type ModeName,
} from '../lib/theme'
import { classNames } from '../lib/utils'

export function Settings() {
  const { auth, setAuth, state, mutate } = useDataContext()
  const [form, setForm] = useState<AuthConfig>({
    username: auth?.username ?? 'zacbaum',
    dataRepo: auth?.dataRepo ?? 'watch-collection-data',
    branch: auth?.branch ?? 'main',
    token: auth?.token ?? '',
  })
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<
    { ok: boolean; message: string } | null
  >(null)
  const [theme, setThemeState] = useState<ThemeName>(getTheme())
  const [mode, setModeState] = useState<ModeName>(getMode())

  function pickTheme(t: ThemeName) {
    setThemeState(t)
    setTheme(t)
  }
  function pickMode(m: ModeName) {
    setModeState(m)
    setMode(m)
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault()
    setTesting(true)
    setTestResult(null)
    try {
      const r = await verifyAuth(form)
      if (!r.private) {
        setTestResult({
          ok: false,
          message: 'Warning: this repo is public. Switch to a private repo or stop here.',
        })
      } else {
        setTestResult({ ok: true, message: 'Connected. Data repo is private.' })
      }
      saveAuth(form)
      setAuth(form)
    } catch (err) {
      setTestResult({ ok: false, message: (err as Error).message })
    } finally {
      setTesting(false)
    }
  }

  function handleDisconnect() {
    clearAuth()
    setAuth(null)
    setTestResult(null)
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Settings</h1>

      <Card title="Appearance">
        <div className="space-y-4">
          <div>
            <div className="text-xs text-text-muted mb-2">Theme</div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {THEMES.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => pickTheme(t.key)}
                  className={classNames(
                    'rounded-md border px-3 py-2 text-left transition',
                    theme === t.key
                      ? 'border-accent ring-1 ring-accent'
                      : 'border-border hover:border-border-strong',
                  )}
                >
                  <div className="text-xs font-medium mb-1.5">{t.label}</div>
                  <div className="flex gap-1">
                    {t.swatch.map((c, i) => (
                      <span
                        key={i}
                        className="block w-4 h-4 rounded-sm border border-black/10"
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="text-xs text-text-muted mb-2">Mode</div>
            <div className="inline-flex border border-border rounded-md overflow-hidden text-xs">
              {MODES.map((m) => (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => pickMode(m.key)}
                  className={classNames(
                    'px-3 py-1.5',
                    mode === m.key
                      ? 'bg-surface-2 text-text font-medium'
                      : 'text-text-muted hover:bg-surface',
                  )}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <div className="text-[11px] text-text-subtle mt-1">
              "Auto" follows your OS preference and updates if you toggle it system-wide.
            </div>
          </div>
        </div>
      </Card>

      <Card title="GitHub data repo connection">
        <form onSubmit={handleSave} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field
              label="GitHub username"
              value={form.username}
              onChange={(v) => setForm((f) => ({ ...f, username: v }))}
              placeholder="zacbaum"
            />
            <Field
              label="Data repo name"
              value={form.dataRepo}
              onChange={(v) => setForm((f) => ({ ...f, dataRepo: v }))}
              placeholder="watch-collection-data"
            />
            <Field
              label="Branch"
              value={form.branch}
              onChange={(v) => setForm((f) => ({ ...f, branch: v }))}
              placeholder="main"
            />
            <Field
              label="Personal access token"
              value={form.token}
              onChange={(v) => setForm((f) => ({ ...f, token: v }))}
              type="password"
              placeholder="github_pat_…"
            />
          </div>
          <div className="text-xs text-text-muted">
            Create a fine-grained token at{' '}
            <a
              href="https://github.com/settings/personal-access-tokens"
              target="_blank"
              rel="noreferrer"
              className="text-accent underline"
            >
              github.com/settings/personal-access-tokens
            </a>{' '}
            scoped to <code className="px-1 bg-surface-2 rounded">{form.dataRepo || 'watch-collection-data'}</code> with{' '}
            <strong>Contents: Read &amp; write</strong>. Stored only in your browser.
          </div>
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={testing || !form.token || !form.username || !form.dataRepo}
              className="px-3 py-1.5 text-xs rounded-md bg-accent text-white disabled:opacity-50"
            >
              {testing ? 'Testing…' : auth ? 'Save & reconnect' : 'Connect'}
            </button>
            {auth && (
              <button
                type="button"
                onClick={handleDisconnect}
                className="px-3 py-1.5 text-xs rounded-md border border-border flex items-center gap-1"
              >
                <LogOut size={12} /> Disconnect
              </button>
            )}
            {testResult && (
              <span
                className={`text-xs flex items-center gap-1 ${
                  testResult.ok ? 'text-success' : 'text-danger'
                }`}
              >
                {testResult.ok ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                {testResult.message}
              </span>
            )}
          </div>
        </form>
      </Card>

      {state.kind === 'ready' && (
        <ImportSection
          onImport={async (text) => {
            const result = importFromCsv(text)
            await mutate((d) => mergeImport(d, result), {
              message: `Import ${result.summary.distinctWatches} watches, ${result.wearLog.length} wear entries`,
            })
            return result.summary
          }}
        />
      )}

      {state.kind === 'ready' && (
        <LocationMergeSection
          wearLog={state.data.wearLog}
          onMerge={async (entryIds, target) => {
            const ids = new Set(entryIds)
            await mutate(
              (d) => ({
                ...d,
                wearLog: d.wearLog.map((e) => {
                  if (!ids.has(e.id) || !e.location) return e
                  return {
                    ...e,
                    location: {
                      ...e.location,
                      city: target.city || undefined,
                      country: target.country || undefined,
                    },
                  }
                }),
              }),
              {
                message: `Merge ${entryIds.length} wear locations → ${target.city || target.country}`,
              },
            )
          }}
        />
      )}

      {state.kind === 'ready' && (
        <Card title="Data">
          <div className="text-xs text-text-muted mb-2">
            {state.data.watches.length} watches · {state.data.wearLog.length} wear log entries ·{' '}
            {state.data.wishlist.length} wishlist items
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => {
                const blob = new Blob([JSON.stringify(state.data, null, 2)], {
                  type: 'application/json',
                })
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = `watch-collection-${new Date().toISOString().slice(0, 10)}.json`
                a.click()
                URL.revokeObjectURL(url)
              }}
              className="px-3 py-1.5 text-xs rounded-md border border-border"
            >
              Export JSON
            </button>
            <button
              onClick={() => {
                if (
                  !confirm(
                    'Replace ALL data with an empty dataset and commit? This cannot be undone (except via git history).',
                  )
                )
                  return
                void mutate(
                  () => ({
                    watches: [],
                    wearLog: [],
                    wishlist: [],
                    serviceLog: [],
                    valuations: [],
                    schemaVersion: 1,
                    updatedAt: new Date().toISOString(),
                  }),
                  { message: 'Reset data' },
                )
              }}
              className="px-3 py-1.5 text-xs rounded-md border border-border text-danger flex items-center gap-1"
            >
              <Trash2 size={12} /> Reset
            </button>
          </div>
        </Card>
      )}
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: 'text' | 'password'
  placeholder?: string
}) {
  return (
    <label className="text-xs text-text-muted block">
      {label}
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 block w-full text-sm px-2.5 py-1.5 border border-border rounded-md bg-bg text-text focus:outline-none focus:border-accent"
      />
    </label>
  )
}

// ─── Location merge tool ────────────────────────────────────────────────────

interface MergeTarget {
  city?: string
  country?: string
}

interface LocVariant {
  city?: string
  country?: string
  count: number
  entryIds: string[]
}

interface LocCluster {
  key: string
  variants: LocVariant[]
}

/** Aggressive normaliser used only for clustering — folds diacritics,
 *  &/and, Saint/St, punctuation, and case. False positives are OK because
 *  the user confirms each merge. */
function looseLocNorm(s: string | undefined): string {
  return (s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, 'and')
    .replace(/[.,'\-]/g, ' ')
    .replace(/\bsaint\b/g, 'st')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Collapse the (city, country) pair into a single cluster key. Mirrors the
 *  travel-map key in Analytics — handles the asymmetric case where the same
 *  place ended up stored with only the city or only the country populated. */
function locClusterKey(city: string | undefined, country: string | undefined): string {
  const cityN = looseLocNorm(city)
  const ctyN = looseLocNorm(country)
  if (!cityN) return `${ctyN}|`
  if (!ctyN) return `${cityN}|`
  if (cityN === ctyN) return `${cityN}|`
  return `${cityN}|${ctyN}`
}

function buildLocClusters(wearLog: WearLogEntry[]): LocCluster[] {
  // Step 1: tally each exact (city, country) tuple
  const tuples = new Map<string, LocVariant>()
  for (const e of wearLog) {
    if (!e.location?.city && !e.location?.country) continue
    const city = e.location.city
    const country = e.location.country
    const tupKey = `${city ?? ''}|${country ?? ''}`
    const existing = tuples.get(tupKey)
    if (existing) {
      existing.count++
      existing.entryIds.push(e.id)
    } else {
      tuples.set(tupKey, { city, country, count: 1, entryIds: [e.id] })
    }
  }
  // Step 2: group tuples by loose-normalised key
  const clusterMap = new Map<string, LocCluster>()
  for (const t of tuples.values()) {
    const looseKey = locClusterKey(t.city, t.country)
    const c = clusterMap.get(looseKey)
    if (c) c.variants.push(t)
    else clusterMap.set(looseKey, { key: looseKey, variants: [t] })
  }
  // Step 3: keep only clusters with >1 variant; sort variants by count desc
  return Array.from(clusterMap.values())
    .filter((c) => c.variants.length > 1)
    .map((c) => ({
      ...c,
      variants: c.variants.sort((a, b) => b.count - a.count),
    }))
    .sort((a, b) => {
      // Heaviest clusters first
      const at = a.variants.reduce((s, v) => s + v.count, 0)
      const bt = b.variants.reduce((s, v) => s + v.count, 0)
      return bt - at
    })
}

function formatVariant(v: LocVariant): string {
  return [v.city, v.country].filter(Boolean).join(', ') || '(unlabeled)'
}

function variantKey(v: LocVariant): string {
  return `${v.city ?? ''}|${v.country ?? ''}`
}

function LocationMergeSection({
  wearLog,
  onMerge,
}: {
  wearLog: WearLogEntry[]
  onMerge: (entryIds: string[], target: MergeTarget) => Promise<void>
}) {
  const clusters = useMemo(() => buildLocClusters(wearLog), [wearLog])
  // Per-cluster chosen canonical (defaults to the most-common variant)
  const [canonical, setCanonical] = useState<Record<string, string>>({})
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  if (clusters.length === 0) {
    return (
      <Card title="Merge duplicate locations">
        <div className="text-xs text-text-muted">
          No likely-duplicate location clusters found. Anything you do see on
          the map as duplicates may genuinely be distinct strings — paste an
          example and I'll add a rule.
        </div>
      </Card>
    )
  }

  async function applyCluster(c: LocCluster) {
    const targetKey = canonical[c.key] ?? variantKey(c.variants[0])
    const target = c.variants.find((v) => variantKey(v) === targetKey)
    if (!target) return
    const otherVariants = c.variants.filter((v) => variantKey(v) !== targetKey)
    const entryIds = otherVariants.flatMap((v) => v.entryIds)
    if (entryIds.length === 0) {
      setMsg('Nothing to merge — only the canonical variant has entries.')
      return
    }
    setBusyKey(c.key)
    setMsg(null)
    try {
      await onMerge(entryIds, { city: target.city, country: target.country })
      setMsg(`Merged ${entryIds.length} entries into "${formatVariant(target)}".`)
    } catch (e) {
      setMsg(`Merge failed: ${(e as Error).message}`)
    } finally {
      setBusyKey(null)
    }
  }

  return (
    <Card title={`Merge duplicate locations (${clusters.length} cluster${clusters.length === 1 ? '' : 's'})`}>
      <div className="text-xs text-text-muted mb-3">
        Wear log entries that probably refer to the same place but were
        recorded with different spellings. Pick the canonical name per
        cluster and apply — the entries are rewritten in place.
      </div>
      <div className="space-y-3">
        {clusters.map((c) => {
          const defaultTarget = variantKey(c.variants[0])
          const chosen = canonical[c.key] ?? defaultTarget
          return (
            <div key={c.key} className="border border-border rounded-md p-3 bg-surface">
              <div className="space-y-1.5 mb-2">
                {c.variants.map((v) => {
                  const vKey = variantKey(v)
                  return (
                    <label
                      key={vKey}
                      className="flex items-center gap-2 text-xs cursor-pointer"
                    >
                      <input
                        type="radio"
                        name={`canon-${c.key}`}
                        checked={chosen === vKey}
                        onChange={() =>
                          setCanonical((prev) => ({ ...prev, [c.key]: vKey }))
                        }
                        className="accent-accent"
                      />
                      <span className="text-text">{formatVariant(v)}</span>
                      <span className="text-text-subtle ml-auto tabular-nums">
                        {v.count} {v.count === 1 ? 'wear' : 'wears'}
                      </span>
                    </label>
                  )
                })}
              </div>
              <button
                type="button"
                onClick={() => void applyCluster(c)}
                disabled={busyKey === c.key}
                className="px-2 py-1 text-[11px] rounded-md bg-accent text-white disabled:opacity-50"
              >
                {busyKey === c.key ? 'Merging…' : 'Merge into selected'}
              </button>
            </div>
          )
        })}
      </div>
      {msg && (
        <div className="text-xs text-success mt-3 flex items-center gap-1">
          <CheckCircle2 size={14} /> {msg}
        </div>
      )}
    </Card>
  )
}

function ImportSection({
  onImport,
}: {
  onImport: (
    text: string,
  ) => Promise<{
    rowsParsed: number
    rowsSkipped: number
    distinctWatches: number
    dateRange: { from: string; to: string } | null
  }>
}) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{
    rowsParsed: number
    rowsSkipped: number
    distinctWatches: number
    dateRange: { from: string; to: string } | null
  } | null>(null)
  const [err, setErr] = useState<string | null>(null)

  async function handleFile(f: File) {
    const t = await f.text()
    setText(t)
  }

  async function handleImport() {
    setBusy(true)
    setErr(null)
    setResult(null)
    try {
      const r = await onImport(text)
      setResult(r)
      setText('')
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card title="Import wear log CSV">
      <div className="text-xs text-text-muted mb-3">
        Paste tab- or comma-separated rows with columns:{' '}
        <code className="px-1 bg-surface-2 rounded">Date, Weekday, Month, Brand, Model, City, Region, Country</code>.
        Dates in DD/MM/YYYY. The importer infers your collection from distinct Brand+Model pairs and de-duplicates against existing entries.
      </div>
      <div className="flex items-center gap-2 mb-2">
        <label className="px-3 py-1.5 text-xs rounded-md border border-border cursor-pointer inline-flex items-center gap-1">
          <Upload size={12} /> Choose file
          <input
            type="file"
            accept=".csv,.tsv,.txt"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void handleFile(f)
            }}
          />
        </label>
        <button
          onClick={handleImport}
          disabled={busy || !text.trim()}
          className="px-3 py-1.5 text-xs rounded-md bg-accent text-white disabled:opacity-50"
        >
          {busy ? 'Importing…' : 'Import'}
        </button>
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={6}
        placeholder="Paste sheet rows here…"
        className="w-full font-mono text-xs px-2 py-1.5 border border-border rounded-md bg-bg"
      />
      {err && (
        <div className="text-xs text-danger mt-2 flex items-center gap-1">
          <AlertCircle size={14} /> {err}
        </div>
      )}
      {result && (
        <div className="text-xs text-success mt-2 flex items-center gap-1">
          <CheckCircle2 size={14} />
          Imported {result.rowsParsed} rows · {result.distinctWatches} watches
          {result.dateRange &&
            ` · ${result.dateRange.from} → ${result.dateRange.to}`}
          {result.rowsSkipped > 0 && ` · ${result.rowsSkipped} skipped`}
        </div>
      )}
    </Card>
  )
}
