import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { AppData, AuthConfig } from '../types'
import { EMPTY_DATA } from '../types'
import { loadAuth } from '../lib/auth'
import { dbGetData, dbPutData, dbGetPhoto, dbPutPhoto, requestPersistence } from '../lib/db'
import { loadData, saveData, uploadPhoto, hasRemoteFile } from '../lib/storage'

// Local-first data layer. IndexedDB is the source of truth: boots and writes
// never wait on the network. When a GitHub backup is configured, every local
// change is pushed in the background (one git commit per change = full
// history), and boot reconciles with the remote — newer updatedAt wins, which
// covers occasional edits from another device.

export type DataState =
  | { kind: 'loading' }
  | { kind: 'ready'; data: AppData }
  | { kind: 'error'; error: string }

export interface DataContextValue {
  state: DataState
  auth: AuthConfig | null
  /** True while a background backup push is in flight. */
  syncing: boolean
  /** Message from the most recent failed backup push, or null. The local
   *  write always succeeded — non-null just means the repo copy is behind. */
  saveError: string | null
  reload: () => Promise<void>
  setAuth: (cfg: AuthConfig | null) => void
  mutate: (
    fn: (data: AppData) => AppData,
    options?: { message?: string },
  ) => Promise<void>
  /** Store a photo locally and push it to the backup repo when configured. */
  backupPhoto: (path: string, blob: Blob) => Promise<void>
  /** Force-push the current local document to the backup repo. */
  backupNow: () => Promise<void>
}

const DataContext = createContext<DataContextValue | null>(null)

export function useDataContext(): DataContextValue {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useDataContext used outside DataProvider')
  return ctx
}

export function useData(): AppData {
  const { state } = useDataContext()
  if (state.kind !== 'ready') throw new Error('Data not ready')
  return state.data
}

function freshEmpty(): AppData {
  // Epoch timestamp, deliberately: a brand-new empty document must NEVER win
  // newest-wins reconciliation against real data anywhere. Stamping it "now"
  // is how a fresh browser once overwrote the entire backup repo on connect.
  return { ...EMPTY_DATA, updatedAt: '1970-01-01T00:00:00.000Z' }
}

/** True when the document contains no user data at all. */
function isEmptyDoc(d: AppData): boolean {
  return (
    d.watches.length === 0 &&
    d.wearLog.length === 0 &&
    d.wishlist.length === 0 &&
    d.serviceLog.length === 0 &&
    d.valuations.length === 0
  )
}

/** Collect every photo path referenced by the document. */
function referencedPhotoPaths(data: AppData): string[] {
  const out: string[] = []
  for (const w of data.watches) for (const p of w.photos ?? []) out.push(p)
  for (const wi of data.wishlist) {
    if (wi.imageUrl && !/^(https?:|data:)/i.test(wi.imageUrl)) out.push(wi.imageUrl)
  }
  return out
}

export function DataProvider({ children }: { children: ReactNode }) {
  const [auth, setAuthState] = useState<AuthConfig | null>(() => loadAuth())
  const [state, setState] = useState<DataState>({ kind: 'loading' })
  const [syncing, setSyncing] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const writeQueue = useRef<Promise<void>>(Promise.resolve())
  // Latest local doc for background jobs that outlive a render.
  const latest = useRef<AppData | null>(null)

  const setReady = useCallback((data: AppData) => {
    latest.current = data
    setState({ kind: 'ready', data })
  }, [])

  /** Push the given doc to the backup repo through the serialized queue. */
  const queuePush = useCallback((cfg: AuthConfig, data: AppData, message: string) => {
    setSyncing(true)
    setSaveError(null)
    // Failures are recorded, not rethrown — the queue must always resolve or
    // one failure would silently drop every subsequent push.
    const job = writeQueue.current.then(async () => {
      try {
        await saveData(cfg, data, message)
      } catch (e) {
        setSaveError((e as Error).message)
      } finally {
        setSyncing(false)
      }
    })
    writeQueue.current = job
    return job
  }, [])

  /** Compare local vs remote; newer updatedAt wins — EXCEPT that an empty
   *  local document never overwrites a non-empty backup, regardless of
   *  timestamps. Connecting from a fresh device is a restore, not a push.
   *  Also backfills any local photos the repo is missing. */
  const reconcile = useCallback(
    async (cfg: AuthConfig, local: AppData) => {
      try {
        const remote = await loadData(cfg)
        let current = local
        if (remote && isEmptyDoc(local) && !isEmptyDoc(remote)) {
          // Fresh/blank device + real backup → always pull.
          await dbPutData(remote)
          setReady(remote)
          current = remote
        } else if (!remote || remote.updatedAt < local.updatedAt) {
          await saveData(cfg, local, 'Sync: push local changes')
        } else if (remote.updatedAt > local.updatedAt) {
          await dbPutData(remote)
          setReady(remote)
          current = remote
        }
        // Backfill photo blobs the repo doesn't have yet (best-effort).
        for (const path of referencedPhotoPaths(current)) {
          const blob = await dbGetPhoto(path)
          if (!blob) continue
          if (!(await hasRemoteFile(cfg, path))) await uploadPhoto(cfg, path, blob)
        }
      } catch (e) {
        setSaveError((e as Error).message)
      }
    },
    [setReady],
  )

  const boot = useCallback(async () => {
    requestPersistence()
    try {
      let local = await dbGetData()
      const cfg = loadAuth()
      if (!local) {
        if (cfg) {
          // First run on this device with a backup configured: restore.
          setState({ kind: 'loading' })
          const remote = await loadData(cfg)
          local = remote ?? freshEmpty()
          // Photo blobs restore lazily as they're viewed (Photo component
          // pulls from the repo and caches into IndexedDB).
        } else {
          local = freshEmpty()
        }
        await dbPutData(local)
        setReady(local)
        return
      }
      setReady(local)
      if (cfg && navigator.onLine) void reconcile(cfg, local)
    } catch (e) {
      setState({ kind: 'error', error: (e as Error).message })
    }
  }, [reconcile, setReady])

  useEffect(() => {
    void boot()
  }, [boot])

  const setAuth = useCallback(
    (cfg: AuthConfig | null) => {
      setAuthState(cfg)
      setSaveError(null)
      if (cfg && latest.current) void reconcile(cfg, latest.current)
    },
    [reconcile],
  )

  const mutate = useCallback<DataContextValue['mutate']>(
    async (fn, options) => {
      if (state.kind !== 'ready') throw new Error('Data not ready')
      const next: AppData = { ...fn(state.data), updatedAt: new Date().toISOString() }
      setReady(next)
      await dbPutData(next) // local durability is the only thing callers wait on
      const cfg = loadAuth()
      if (cfg) void queuePush(cfg, next, options?.message ?? 'Update data')
    },
    [state, setReady, queuePush],
  )

  const backupPhoto = useCallback<DataContextValue['backupPhoto']>(async (path, blob) => {
    await dbPutPhoto(path, blob)
    const cfg = loadAuth()
    if (!cfg) return
    try {
      await uploadPhoto(cfg, path, blob)
    } catch (e) {
      setSaveError((e as Error).message)
    }
  }, [])

  const backupNow = useCallback(async () => {
    const cfg = loadAuth()
    if (!cfg || !latest.current) return
    await queuePush(cfg, latest.current, 'Manual backup')
  }, [queuePush])

  const value = useMemo<DataContextValue>(
    () => ({ state, auth, syncing, saveError, reload: boot, setAuth, mutate, backupPhoto, backupNow }),
    [state, auth, syncing, saveError, boot, setAuth, mutate, backupPhoto, backupNow],
  )

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}
