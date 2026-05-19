import { useState, type FormEvent } from 'react'
import { useDataContext } from '../hooks/useData'
import { clearAuth, saveAuth, verifyAuth } from '../lib/auth'
import { importFromCsv, mergeImport } from '../lib/importer'
import type { AppData, AuthConfig, Watch } from '../types'
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
        <SpecBackfillSection
          watches={state.data.watches}
          onApply={async (patch) => {
            const result = applySpecPatch(state.data, patch)
            await mutate(() => result.next, {
              message: `Backfill specs for ${result.updatedCount} watches`,
            })
            return result
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

// ─── Spec backfill ──────────────────────────────────────────────────────────

/** Fields the backfill tool is allowed to set on a watch. */
const PATCHABLE_FIELDS = [
  'caseDiameterMm',
  'caseThicknessMm',
  'lugWidthMm',
  'waterResistanceM',
] as const
type PatchableField = (typeof PATCHABLE_FIELDS)[number]
type SpecPatch = Record<string, Partial<Record<PatchableField, number>>>

interface PatchResult {
  next: AppData
  updatedCount: number
  unknownKeys: string[]
  changedFields: number
}

/** Apply a patch dict to a copy of AppData, only touching the patchable fields.
 *  Keys can be either watch IDs or `brand|model|reference` strings. */
function applySpecPatch(data: AppData, patch: SpecPatch): PatchResult {
  const byId = new Map(data.watches.map((w) => [w.id, w]))
  const byKey = new Map<string, Watch>()
  for (const w of data.watches) {
    byKey.set(`${w.brand}|${w.model}|${w.reference ?? ''}`.toLowerCase(), w)
  }

  const touched = new Map<string, Watch>()
  const unknown: string[] = []
  let changedFields = 0

  for (const [rawKey, values] of Object.entries(patch)) {
    const target =
      byId.get(rawKey) ??
      byKey.get(rawKey.toLowerCase()) ??
      byKey.get(`${rawKey}|`.toLowerCase())
    if (!target) {
      unknown.push(rawKey)
      continue
    }
    const current = touched.get(target.id) ?? { ...target }
    for (const f of PATCHABLE_FIELDS) {
      const v = values[f]
      if (typeof v === 'number' && Number.isFinite(v) && current[f] !== v) {
        ;(current as unknown as Record<string, unknown>)[f] = v
        changedFields++
      }
    }
    current.updatedAt = new Date().toISOString()
    touched.set(target.id, current)
  }

  const next: AppData = {
    ...data,
    watches: data.watches.map((w) => touched.get(w.id) ?? w),
    updatedAt: new Date().toISOString(),
  }
  return { next, updatedCount: touched.size, unknownKeys: unknown, changedFields }
}

function SpecBackfillSection({
  watches,
  onApply,
}: {
  watches: Watch[]
  onApply: (patch: SpecPatch) => Promise<PatchResult>
}) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [result, setResult] = useState<PatchResult | null>(null)

  async function handleApply() {
    setBusy(true)
    setErr(null)
    setResult(null)
    try {
      const parsed = JSON.parse(text) as unknown
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new Error('Patch must be a JSON object keyed by watch id (or brand|model|reference).')
      }
      const r = await onApply(parsed as SpecPatch)
      setResult(r)
      if (r.unknownKeys.length === 0) setText('')
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card title="Backfill watch specs">
      <div className="text-xs text-text-muted mb-3">
        Paste a JSON map keyed by watch id (or{' '}
        <code className="px-1 bg-surface-2 rounded">brand|model|reference</code>) with any of{' '}
        <code className="px-1 bg-surface-2 rounded">caseDiameterMm</code>,{' '}
        <code className="px-1 bg-surface-2 rounded">caseThicknessMm</code>,{' '}
        <code className="px-1 bg-surface-2 rounded">lugWidthMm</code>,{' '}
        <code className="px-1 bg-surface-2 rounded">waterResistanceM</code>. Other fields and
        unmentioned watches are left untouched.
      </div>
      <details className="mb-2 text-[11px] text-text-muted">
        <summary className="cursor-pointer select-none">
          Show watch ids in this collection ({watches.length})
        </summary>
        <ul className="mt-1 max-h-40 overflow-y-auto font-mono space-y-0.5">
          {watches.map((w) => (
            <li key={w.id}>
              <code className="text-text">{w.id}</code>{' '}
              <span className="text-text-subtle">
                {w.brand} {w.model}
                {w.reference ? ` · ${w.reference}` : ''}
              </span>
            </li>
          ))}
        </ul>
      </details>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={8}
        placeholder={`{\n  "w_xxxxxxx": { "caseDiameterMm": 40, "waterResistanceM": 100 }\n}`}
        className="w-full font-mono text-xs px-2 py-1.5 border border-border rounded-md bg-bg"
      />
      <div className="mt-2 flex items-center gap-2">
        <button
          onClick={handleApply}
          disabled={busy || !text.trim()}
          className="px-3 py-1.5 text-xs rounded-md bg-accent text-white disabled:opacity-50"
        >
          {busy ? 'Applying…' : 'Apply patch'}
        </button>
        {err && (
          <span className="text-xs text-danger flex items-center gap-1">
            <AlertCircle size={14} /> {err}
          </span>
        )}
        {result && (
          <span className="text-xs text-success flex items-center gap-1">
            <CheckCircle2 size={14} />
            Patched {result.updatedCount} watch{result.updatedCount === 1 ? '' : 'es'} ·{' '}
            {result.changedFields} field{result.changedFields === 1 ? '' : 's'} changed
            {result.unknownKeys.length > 0 &&
              ` · ${result.unknownKeys.length} unknown key${result.unknownKeys.length === 1 ? '' : 's'}`}
          </span>
        )}
      </div>
      {result && result.unknownKeys.length > 0 && (
        <div className="mt-1 text-[11px] text-danger">
          Unknown keys (skipped): {result.unknownKeys.join(', ')}
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
