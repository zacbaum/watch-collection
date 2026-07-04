// GitHub backup adapter. IndexedDB (lib/db.ts) is the source of truth; this
// module pushes/pulls the same document + photo blobs to a private repo so
// every change gets a git commit (history/traceability) and any device can
// restore.
import type { AppData, AuthConfig } from '../types'

const DATA_PATH = 'data.json'

interface FileMeta {
  sha: string
  content: string
}

function authHeaders(cfg: AuthConfig): HeadersInit {
  return {
    Authorization: `Bearer ${cfg.token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  }
}

function repoUrl(cfg: AuthConfig, path: string): string {
  return `https://api.github.com/repos/${cfg.username}/${cfg.dataRepo}/contents/${path}?ref=${cfg.branch}`
}

/** Base64 encode UTF-8 string (browser-safe). */
function b64encode(str: string): string {
  const bytes = new TextEncoder().encode(str)
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary)
}

/** Base64 decode to UTF-8 string. */
function b64decode(b64: string): string {
  const binary = atob(b64.replace(/\s/g, ''))
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new TextDecoder().decode(bytes)
}

async function getFile(cfg: AuthConfig, path: string): Promise<FileMeta | null> {
  const res = await fetch(repoUrl(cfg, path), { headers: authHeaders(cfg) })
  if (res.status === 404) return null
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`GitHub GET ${path} ${res.status}: ${text}`)
  }
  const json = await res.json()
  return { sha: json.sha, content: b64decode(json.content) }
}

async function putFile(
  cfg: AuthConfig,
  path: string,
  content: string,
  message: string,
  sha?: string,
): Promise<{ sha: string }> {
  const res = await fetch(
    `https://api.github.com/repos/${cfg.username}/${cfg.dataRepo}/contents/${path}`,
    {
      method: 'PUT',
      headers: { ...authHeaders(cfg), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        content: b64encode(content),
        sha,
        branch: cfg.branch,
      }),
    },
  )
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    const err = new Error(`GitHub PUT ${path} ${res.status}: ${text}`) as Error & {
      status?: number
    }
    err.status = res.status
    throw err
  }
  const json = await res.json()
  return { sha: json.content.sha }
}

let cachedSha: string | undefined

/** Pull the backup document. Returns null when the repo has no data.json —
 *  callers must NOT treat that as "empty data with a fresh timestamp" or an
 *  empty remote would win reconciliation against real local data. */
export async function loadData(cfg: AuthConfig): Promise<AppData | null> {
  const file = await getFile(cfg, DATA_PATH)
  if (!file) {
    cachedSha = undefined
    return null
  }
  cachedSha = file.sha
  try {
    const parsed = JSON.parse(file.content) as AppData
    return { ...parsed, schemaVersion: parsed.schemaVersion ?? 1 }
  } catch (e) {
    throw new Error(`Failed to parse data.json: ${(e as Error).message}`)
  }
}

/** Push the document as-is (updatedAt is stamped by the local write, not
 *  here — keeps local and remote timestamps identical after a push). */
export async function saveData(cfg: AuthConfig, data: AppData, message = 'Update data'): Promise<void> {
  const json = JSON.stringify(data, null, 2)
  try {
    const result = await putFile(cfg, DATA_PATH, json, message, cachedSha)
    cachedSha = result.sha
  } catch (e) {
    const status = (e as { status?: number }).status
    // 409/422 = our cached sha is stale (the file changed under us, e.g. a
    // write from another device). Re-fetch the current sha and retry once —
    // last write wins, which is the right trade-off for a single-user app
    // vs. silently losing this write.
    if (status !== 409 && status !== 422) throw e
    const fresh = await getFile(cfg, DATA_PATH)
    const result = await putFile(cfg, DATA_PATH, json, message, fresh?.sha)
    cachedSha = result.sha
  }
}

/** Upload a photo blob to the repo at the given path (e.g. photos/w_x-y.jpg). */
export async function uploadPhoto(
  cfg: AuthConfig,
  path: string,
  blob: Blob,
): Promise<void> {
  const buf = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  for (const b of buf) binary += String.fromCharCode(b)
  const b64 = btoa(binary)

  const existing = await getFile(cfg, path).catch(() => null)
  const res = await fetch(
    `https://api.github.com/repos/${cfg.username}/${cfg.dataRepo}/contents/${path}`,
    {
      method: 'PUT',
      headers: { ...authHeaders(cfg), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: `Upload photo ${path}`,
        content: b64,
        sha: existing?.sha,
        branch: cfg.branch,
      }),
    },
  )
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Photo upload failed ${res.status}: ${text}`)
  }
}

/** True if the repo already has a file at this path. */
export async function hasRemoteFile(cfg: AuthConfig, path: string): Promise<boolean> {
  return (await getFile(cfg, path).catch(() => null)) != null
}

/** Fetch a photo from the private repo as a Blob (authed). */
export async function fetchPhoto(cfg: AuthConfig, path: string): Promise<Blob> {
  const res = await fetch(
    `https://api.github.com/repos/${cfg.username}/${cfg.dataRepo}/contents/${path}?ref=${cfg.branch}`,
    {
      headers: { ...authHeaders(cfg), Accept: 'application/vnd.github.raw' },
    },
  )
  if (!res.ok) throw new Error(`Photo fetch failed ${res.status}`)
  return res.blob()
}
