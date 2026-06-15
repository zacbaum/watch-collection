// Theme + dark-mode controller.
//
// Two orthogonal preferences:
//   - theme: 'default' | 'slate' | 'warm' | 'mono' | 'forest'
//   - mode:  'auto' | 'light' | 'dark'
//
// 'auto' tracks the OS preference via prefers-color-scheme.
// Both preferences are stored in localStorage and applied as data-attributes
// on <html> so CSS overrides can target them.

export type ThemeName = 'default' | 'slate' | 'warm' | 'mono' | 'forest'
export type ModeName = 'auto' | 'light' | 'dark'

export const THEMES: Array<{ key: ThemeName; label: string; swatch: string[] }> = [
  { key: 'default', label: 'Default', swatch: ['#ffffff', '#1c1917', '#2563eb'] },
  { key: 'slate', label: 'Slate', swatch: ['#f8fafc', '#0f172a', '#4f46e5'] },
  { key: 'warm', label: 'Warm', swatch: ['#fdfbf6', '#292017', '#b45309'] },
  { key: 'mono', label: 'Mono', swatch: ['#ffffff', '#111827', '#111827'] },
  { key: 'forest', label: 'Forest', swatch: ['#f8faf7', '#1f2937', '#15803d'] },
]

export const MODES: Array<{ key: ModeName; label: string }> = [
  { key: 'auto', label: 'Auto (system)' },
  { key: 'light', label: 'Light' },
  { key: 'dark', label: 'Dark' },
]

const THEME_KEY = 'watch-collection.theme.v1'
const MODE_KEY = 'watch-collection.mode.v1'

export function getTheme(): ThemeName {
  const v = localStorage.getItem(THEME_KEY)
  if (THEMES.some((t) => t.key === v)) return v as ThemeName
  // Default to "warm" for the editorial Lugs-inspired feel on fresh installs.
  // Existing users keep whatever they've already picked.
  return 'warm'
}

export function getMode(): ModeName {
  const v = localStorage.getItem(MODE_KEY)
  if (MODES.some((m) => m.key === v)) return v as ModeName
  return 'auto'
}

export function setTheme(t: ThemeName): void {
  localStorage.setItem(THEME_KEY, t)
  document.documentElement.dataset.theme = t
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
}

/** Call once at app boot to apply persisted prefs and start watching system. */
export function bootTheme(): void {
  document.documentElement.dataset.theme = getTheme()
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
