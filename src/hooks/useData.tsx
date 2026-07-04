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
import { loadAuth } from '../lib/auth'
import { loadData, saveData } from '../lib/storage'

export type DataState =
  | { kind: 'unconfigured' }
  | { kind: 'loading' }
  | { kind: 'ready'; data: AppData }
  | { kind: 'error'; error: string }

export interface DataContextValue {
  state: DataState
  auth: AuthConfig | null
  syncing: boolean
  /** Message from the most recent failed save, or null. Cleared on the next
   *  mutate. The in-memory state is still updated optimistically, so a
   *  non-null value means local changes may not have reached the repo. */
  saveError: string | null
  reload: () => Promise<void>
  setAuth: (cfg: AuthConfig | null) => void
  mutate: (
    fn: (data: AppData) => AppData,
    options?: { message?: string },
  ) => Promise<void>
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

interface DataProviderProps {
  children: ReactNode
}

export function DataProvider({ children }: DataProviderProps) {
  const [auth, setAuthState] = useState<AuthConfig | null>(() => loadAuth())
  const [state, setState] = useState<DataState>(() =>
    loadAuth() ? { kind: 'loading' } : { kind: 'unconfigured' },
  )
  const [syncing, setSyncing] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const writeQueue = useRef<Promise<void>>(Promise.resolve())

  const reload = useCallback(async () => {
    const cfg = loadAuth()
    if (!cfg) {
      setState({ kind: 'unconfigured' })
      return
    }
    setState({ kind: 'loading' })
    try {
      const data = await loadData(cfg)
      setState({ kind: 'ready', data })
    } catch (e) {
      setState({ kind: 'error', error: (e as Error).message })
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  const setAuth = useCallback((cfg: AuthConfig | null) => {
    setAuthState(cfg)
    if (cfg) {
      setState({ kind: 'loading' })
      void (async () => {
        try {
          const data = await loadData(cfg)
          setState({ kind: 'ready', data })
        } catch (e) {
          setState({ kind: 'error', error: (e as Error).message })
        }
      })()
    } else {
      setState({ kind: 'unconfigured' })
    }
  }, [])

  const mutate = useCallback<DataContextValue['mutate']>(
    async (fn, options) => {
      const cfg = loadAuth()
      if (!cfg) throw new Error('Not authenticated')
      if (state.kind !== 'ready') throw new Error('Data not ready')
      const next = fn(state.data)
      setState({ kind: 'ready', data: next })
      setSyncing(true)
      setSaveError(null)
      // Failures are recorded in saveError rather than rethrown: the queue
      // must always resolve, otherwise one failed save leaves .then() on a
      // rejected promise and every subsequent write silently never runs.
      const job = writeQueue.current.then(async () => {
        try {
          await saveData(cfg, next, options?.message ?? 'Update data')
        } catch (e) {
          setSaveError((e as Error).message)
        } finally {
          setSyncing(false)
        }
      })
      writeQueue.current = job
      return job
    },
    [state],
  )

  const value = useMemo<DataContextValue>(
    () => ({ state, auth, syncing, saveError, reload, setAuth, mutate }),
    [state, auth, syncing, saveError, reload, setAuth, mutate],
  )

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}
