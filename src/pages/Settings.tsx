import { useMemo, useRef, useState, type FormEvent } from 'react'
import { useDataContext } from '../hooks/useData'
import { clearAuth, saveAuth, verifyAuth } from '../lib/auth'
import type { AppData, AuthConfig, WearLogEntry } from '../types'
import { Card } from '../components/Card'
import { dbGetPhoto, dbListPhotoPaths, dbPutPhoto } from '../lib/db'
import {
  CheckCircle2,
  AlertCircle,
  Trash2,
  LogOut,
  Download,
  Upload,
  CloudUpload,
  History,
} from 'lucide-react'
import {
  MODES,
  THEMES,
  getMode,
  getTheme,
  setMode,
  setTheme,
  type ModeName,
  type ThemeName,
} from '../lib/theme'
import { classNames } from '../lib/utils'

export function Settings() {
  const { auth, setAuth, state, mutate, backupNow, syncing, reload } = useDataContext()
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
      <h1 className="text-2xl font-display font-medium tracking-tight">Settings</h1>

      <Card title="Appearance">
        <div className="space-y-4">
          <div>
            <div className="text-xs text-text-muted mb-2">Palette</div>
            <div className="inline-flex border border-border rounded-md overflow-hidden text-xs">
              {THEMES.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => pickTheme(t.key)}
                  className={classNames(
                    'px-3 py-1.5',
                    theme === t.key
                      ? 'bg-surface-2 text-text font-medium'
                      : 'text-text-muted hover:bg-surface',
                  )}
                >
                  {t.label}
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

      <Card title="Backup & sync">
        <div className="text-xs text-text-muted mb-3">
          Your data lives on this device. Connecting a private GitHub repo
          backs up every change as a git commit (full history) and lets any
          other device restore or stay in sync. Connecting from a fresh
          device restores the backup; when both sides have data, newer wins.
        </div>
        {auth && (
          <div className="mb-3 flex items-center gap-2">
            <button
              type="button"
              onClick={() => void backupNow()}
              disabled={syncing}
              className="px-3 py-1.5 text-xs rounded-md border border-border flex items-center gap-1 disabled:opacity-50"
            >
              <CloudUpload size={12} /> {syncing ? 'Backing up…' : 'Back up now'}
            </button>
            <a
              href={`https://github.com/${auth.username}/${auth.dataRepo}/commits/${auth.branch}`}
              target="_blank"
              rel="noreferrer"
              className="px-3 py-1.5 text-xs rounded-md border border-border flex items-center gap-1 text-text"
            >
              <History size={12} /> View history
            </a>
          </div>
        )}
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
              className="px-3 py-1.5 text-xs rounded-md bg-accent text-on-accent disabled:opacity-50"
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
        <DataSection data={state.data} onReload={reload} onReset={handleReset} />
      )}

      {state.kind === 'ready' && (
        <details className="group">
          <summary className="cursor-pointer select-none text-xs text-text-muted px-1 py-2">
            Data maintenance (merge duplicate locations)
          </summary>
          <div className="mt-2">
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
          </div>
        </details>
      )}
    </div>
  )

  function handleReset() {
    if (
      !confirm(
        'Replace ALL data with an empty dataset? This clears this device and (if connected) commits the reset to the backup — recoverable only via git history.',
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
  }
}

// ─── Data (backup file export/import, reset) ────────────────────────────────

interface BackupFile {
  app: 'watch-collection'
  version: 1
  data: AppData
  /** path → base64 (no data: prefix) */
  photos: Record<string, string>
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  for (const b of buf) binary += String.fromCharCode(b)
  return btoa(binary)
}

function base64ToBlob(b64: string): Blob {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: 'image/jpeg' })
}

function DataSection({
  data,
  onReload,
  onReset,
}: {
  data: AppData
  onReload: () => Promise<void>
  onReset: () => void
}) {
  const [busy, setBusy] = useState<'export' | 'import' | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)

  async function handleExport() {
    setBusy('export')
    setMsg(null)
    try {
      const photos: Record<string, string> = {}
      for (const path of await dbListPhotoPaths()) {
        const blob = await dbGetPhoto(path)
        if (blob) photos[path] = await blobToBase64(blob)
      }
      const payload: BackupFile = { app: 'watch-collection', version: 1, data, photos }
      const name = `watch-collection-backup-${new Date().toISOString().slice(0, 10)}.json`
      const file = new File([JSON.stringify(payload)], name, { type: 'application/json' })
      // iOS share sheet → "Save to Files" reaches iCloud Drive. Fallback to a
      // plain download elsewhere.
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file] }).catch(() => {
          /* user cancelled the sheet */
        })
      } else {
        const url = URL.createObjectURL(file)
        const a = document.createElement('a')
        a.href = url
        a.download = name
        a.click()
        URL.revokeObjectURL(url)
      }
      setMsg(`Exported ${Object.keys(photos).length} photos + data.`)
    } catch (e) {
      setMsg(`Export failed: ${(e as Error).message}`)
    } finally {
      setBusy(null)
    }
  }

  async function handleImport(file: File) {
    setBusy('import')
    setMsg(null)
    try {
      const parsed = JSON.parse(await file.text()) as BackupFile
      if (parsed.app !== 'watch-collection' || !parsed.data) {
        throw new Error('Not a watch-collection backup file.')
      }
      if (
        !confirm(
          `Replace everything on this device with the backup (${parsed.data.watches.length} watches, ${parsed.data.wearLog.length} wear entries)?`,
        )
      )
        return
      const { dbPutData } = await import('../lib/db')
      await dbPutData(parsed.data)
      for (const [path, b64] of Object.entries(parsed.photos ?? {})) {
        await dbPutPhoto(path, base64ToBlob(b64))
      }
      await onReload()
      setMsg('Backup restored.')
    } catch (e) {
      setMsg(`Import failed: ${(e as Error).message}`)
    } finally {
      setBusy(null)
    }
  }

  return (
    <Card title="Data">
      <div className="text-xs text-text-muted mb-3">
        {data.watches.length} watches · {data.wearLog.length} wear log entries ·{' '}
        {data.wishlist.length} wishlist items — stored on this device.
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => void handleExport()}
          disabled={busy != null}
          className="px-3 py-1.5 text-xs rounded-md border border-border flex items-center gap-1 disabled:opacity-50"
        >
          <Download size={12} />
          {busy === 'export' ? 'Exporting…' : 'Export backup (incl. photos)'}
        </button>
        <button
          onClick={() => fileRef.current?.click()}
          disabled={busy != null}
          className="px-3 py-1.5 text-xs rounded-md border border-border flex items-center gap-1 disabled:opacity-50"
        >
          <Upload size={12} />
          {busy === 'import' ? 'Importing…' : 'Restore from backup file'}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (f) void handleImport(f)
          }}
        />
        <button
          onClick={onReset}
          disabled={busy != null}
          className="px-3 py-1.5 text-xs rounded-md border border-border text-danger flex items-center gap-1 disabled:opacity-50"
        >
          <Trash2 size={12} /> Reset
        </button>
      </div>
      {msg && <div className="text-xs text-text-muted mt-2">{msg}</div>}
      <div className="text-[11px] text-text-subtle mt-2">
        On iPhone, Export opens the share sheet — "Save to Files" puts the
        backup in iCloud Drive.
      </div>
    </Card>
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
                className="px-2 py-1 text-[11px] rounded-md bg-accent text-on-accent disabled:opacity-50"
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
