// Light/dark mode controller. The app has ONE palette (Gilt Champagne,
// defined in index.css); the only preference is mode:
//   'auto' | 'light' | 'dark' — auto tracks prefers-color-scheme.
// Stored in localStorage and applied as [data-dark="1"] on <html>.

export type ModeName = 'auto' | 'light' | 'dark'

export const MODES: Array<{ key: ModeName; label: string }> = [
  { key: 'auto', label: 'Auto (system)' },
  { key: 'light', label: 'Light' },
  { key: 'dark', label: 'Dark' },
]

const MODE_KEY = 'watch-collection.mode.v1'

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
