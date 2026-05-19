import type { AuthConfig } from '../types'

const KEY = 'watch-collection.auth.v1'

export function loadAuth(): AuthConfig | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (
      typeof parsed?.username === 'string' &&
      typeof parsed?.dataRepo === 'string' &&
      typeof parsed?.branch === 'string' &&
      typeof parsed?.token === 'string'
    ) {
      return parsed
    }
    return null
  } catch {
    return null
  }
}

export function saveAuth(cfg: AuthConfig): void {
  localStorage.setItem(KEY, JSON.stringify(cfg))
}

export function clearAuth(): void {
  localStorage.removeItem(KEY)
}

/** Verify the token can read the data repo. Throws on failure. */
export async function verifyAuth(cfg: AuthConfig): Promise<{ ok: true; private: boolean }> {
  const res = await fetch(`https://api.github.com/repos/${cfg.username}/${cfg.dataRepo}`, {
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      Accept: 'application/vnd.github+json',
    },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`GitHub API ${res.status}: ${text || res.statusText}`)
  }
  const json = await res.json()
  return { ok: true, private: !!json.private }
}
