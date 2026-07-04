// Appearance controller. Two curated palettes (Gilt Champagne default,
// Goodwood alternative — both from the same design panel) × three modes
// ('auto' tracks prefers-color-scheme). Stored in localStorage, applied as
// [data-theme] / [data-dark] on <html>.

export type ThemeName = 'champagne' | 'goodwood'
export type ModeName = 'auto' | 'light' | 'dark'

export const THEMES: Array<{ key: ThemeName; label: string }> = [
  { key: 'champagne', label: 'Gilt Champagne' },
  { key: 'goodwood', label: 'Goodwood' },
]

export const MODES: Array<{ key: ModeName; label: string }> = [
  { key: 'auto', label: 'Auto (system)' },
  { key: 'light', label: 'Light' },
  { key: 'dark', label: 'Dark' },
]

// Reuses the pre-champagne key; stale values ('warm' etc.) fail validation
// and fall back to champagne.
const THEME_KEY = 'watch-collection.theme.v1'
const MODE_KEY = 'watch-collection.mode.v1'

export function getTheme(): ThemeName {
  const v = localStorage.getItem(THEME_KEY)
  if (THEMES.some((t) => t.key === v)) return v as ThemeName
  return 'champagne'
}

export function setTheme(t: ThemeName): void {
  localStorage.setItem(THEME_KEY, t)
  applyTheme(t)
}

function applyTheme(t: ThemeName): void {
  // Champagne is the :root default — no attribute needed.
  if (t === 'champagne') delete document.documentElement.dataset.theme
  else document.documentElement.dataset.theme = t
  syncThemeColorMeta()
}

export function getMode(): ModeName {
  const v = localStorage.getItem(MODE_KEY)
  if (MODES.some((m) => m.key === v)) return v as ModeName
  return 'auto'
}

export function setMode(m: ModeName): void {
  localStorage.setItem(MODE_KEY, m)
  applyMode(m)
}

function systemIsDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

function applyMode(mode: ModeName): void {
  const dark = mode === 'dark' || (mode === 'auto' && systemIsDark())
  if (dark) document.documentElement.dataset.dark = '1'
  else delete document.documentElement.dataset.dark
  syncThemeColorMeta()
}

/** Keep the browser-chrome / iOS-status-bar colour in step with the active
 *  mode. index.html ships static light/dark theme-color metas for first
 *  paint; this appends a dynamic one (last matching meta wins) that tracks
 *  the resolved --color-bg. */
function syncThemeColorMeta(): void {
  const bg = getComputedStyle(document.documentElement)
    .getPropertyValue('--color-bg')
    .trim()
  if (!bg) return
  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"][data-dynamic]')
  if (!meta) {
    meta = document.createElement('meta')
    meta.name = 'theme-color'
    meta.dataset.dynamic = '1'
    document.head.appendChild(meta)
  }
  meta.content = bg
}

/** Call once at app boot to apply persisted prefs and start watching system. */
export function bootTheme(): void {
  applyTheme(getTheme())
  applyMode(getMode())

  // Re-apply when the OS preference changes (only if user is on 'auto')
  if (typeof window !== 'undefined' && 'matchMedia' in window) {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => {
      if (getMode() === 'auto') applyMode('auto')
    }
    mq.addEventListener?.('change', handler)
  }
}
