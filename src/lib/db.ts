// On-device storage: IndexedDB with two object stores —
//   kv:     the AppData document under key 'data'
//   photos: photo Blobs keyed by their path (same 'photos/...' paths the
//           GitHub backup uses, so local and remote stay interchangeable)
import type { AppData } from '../types'

const DB_NAME = 'watch-collection'
const DB_VERSION = 1

let dbPromise: Promise<IDBDatabase> | null = null

function open(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION)
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv')
        if (!db.objectStoreNames.contains('photos')) db.createObjectStore('photos')
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  }
  return dbPromise
}

function run<T>(
  store: string,
  mode: IDBTransactionMode,
  op: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode)
        const r = op(t.objectStore(store))
        r.onsuccess = () => resolve(r.result)
        r.onerror = () => reject(r.error)
      }),
  )
}

export async function dbGetData(): Promise<AppData | null> {
  return ((await run('kv', 'readonly', (s) => s.get('data'))) as AppData | undefined) ?? null
}

export function dbPutData(data: AppData): Promise<unknown> {
  return run('kv', 'readwrite', (s) => s.put(data, 'data'))
}

export async function dbGetPhoto(path: string): Promise<Blob | null> {
  return ((await run('photos', 'readonly', (s) => s.get(path))) as Blob | undefined) ?? null
}

export function dbPutPhoto(path: string, blob: Blob): Promise<unknown> {
  return run('photos', 'readwrite', (s) => s.put(blob, path))
}

export function dbDeletePhoto(path: string): Promise<unknown> {
  return run('photos', 'readwrite', (s) => s.delete(path))
}

export async function dbListPhotoPaths(): Promise<string[]> {
  return (await run('photos', 'readonly', (s) => s.getAllKeys())) as string[]
}

/** Ask the browser not to evict our storage under pressure. Best-effort —
 *  installed PWAs are usually granted this silently. */
export function requestPersistence(): void {
  try {
    void navigator.storage?.persist?.()
  } catch {
    /* unsupported */
  }
}
