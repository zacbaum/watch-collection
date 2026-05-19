import { useEffect, useState } from 'react'
import { loadAuth } from '../lib/auth'
import { fetchPhoto } from '../lib/storage'

/** Module-level cache so a photo path only fetches once per session.
 *  Blob URLs are stable strings the browser keeps alive until revoke. */
const blobCache = new Map<string, string>()
const inflight = new Map<string, Promise<string>>()

function isExternal(path: string): boolean {
  return /^(https?:|data:)/i.test(path)
}

async function resolve(path: string): Promise<string> {
  if (isExternal(path)) return path
  const cached = blobCache.get(path)
  if (cached) return cached
  const pending = inflight.get(path)
  if (pending) return pending
  const cfg = loadAuth()
  if (!cfg) throw new Error('Not authenticated')
  const p = fetchPhoto(cfg, path).then((url) => {
    blobCache.set(path, url)
    inflight.delete(path)
    return url
  })
  inflight.set(path, p)
  return p
}

interface PhotoProps {
  path: string
  alt?: string
  className?: string
  /** Optional click handler — useful when the photo is also a thumbnail. */
  onClick?: () => void
}

/** Renders an image from either an external URL or a repo path (`photos/...`).
 *  Repo paths require auth and are fetched as authed blob URLs, then cached
 *  for the rest of the session. */
export function Photo({ path, alt, className, onClick }: PhotoProps) {
  const [src, setSrc] = useState<string | null>(() =>
    isExternal(path) ? path : (blobCache.get(path) ?? null),
  )
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    if (isExternal(path)) {
      setSrc(path)
      setError(null)
      return
    }
    const cached = blobCache.get(path)
    if (cached) {
      setSrc(cached)
      setError(null)
      return
    }
    setSrc(null)
    setError(null)
    resolve(path)
      .then((url) => {
        if (!cancelled) setSrc(url)
      })
      .catch((e) => {
        if (!cancelled) setError((e as Error).message)
      })
    return () => {
      cancelled = true
    }
  }, [path])

  if (error) {
    return (
      <div
        className={`flex items-center justify-center bg-surface-2 text-text-subtle text-[10px] p-1 ${className ?? ''}`}
        title={error}
      >
        broken
      </div>
    )
  }
  if (!src) {
    return (
      <div
        className={`bg-surface-2 animate-pulse ${className ?? ''}`}
        aria-label="loading photo"
      />
    )
  }
  return (
    <img
      src={src}
      alt={alt ?? ''}
      className={className}
      onClick={onClick}
      loading="lazy"
    />
  )
}
