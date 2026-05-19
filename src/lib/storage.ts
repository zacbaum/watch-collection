import type { AppData, AuthConfig } from '../types'
import { EMPTY_DATA } from '../types'

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
    throw new Error(`GitHub PUT ${path} ${res.status}: ${text}`)
  }
  const json = await res.json()
  return { sha: json.content.sha }
}

let cachedSha: string | undefined

export async function loadData(cfg: AuthConfig): Promise<AppData> {
  const file = await getFile(cfg, DATA_PATH)
  if (!file) {
    cachedSha = undefined
    return { ...EMPTY_DATA }
  }
  cachedSha = file.sha
  try {
    const parsed = JSON.parse(file.content) as AppData
    return {
      ...EMPTY_DATA,
      ...parsed,
      schemaVersion: parsed.schemaVersion ?? 1,
    }
  } catch (e) {
    throw new Error(`Failed to parse data.json: ${(e as Error).message}`)
  }
}

export async function saveData(cfg: AuthConfig, data: AppData, message = 'Update data'): Promise<void> {
  const next: AppData = { ...data, updatedAt: new Date().toISOString() }
  const json = JSON.stringify(next, null, 2)
  const result = await putFile(cfg, DATA_PATH, json, message, cachedSha)
  cachedSha = result.sha
}

/** Upload a binary photo (Blob) to data repo at photos/{filename}. Returns the path. */
export async function uploadPhoto(
  cfg: AuthConfig,
  filename: string,
  blob: Blob,
): Promise<string> {
  const path = `photos/${filename}`
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
        message: `Upload photo ${filename}`,
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
  return path
}

/** Fetch a photo from the private repo as a blob URL (authed). */
export async function fetchPhoto(cfg: AuthConfig, path: string): Promise<string> {
  const res = await fetch(
    `https://api.github.com/repos/${cfg.username}/${cfg.dataRepo}/contents/${path}?ref=${cfg.branch}`,
    {
      headers: { ...authHeaders(cfg), Accept: 'application/vnd.github.raw' },
    },
  )
  if (!res.ok) throw new Error(`Photo fetch failed ${res.status}`)
  const blob = await res.blob()
  return URL.createObjectURL(blob)
}
