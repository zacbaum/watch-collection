/** Stable categorical color palette. Same seed → same color. */

export const PALETTE = [
  '#2563eb', // blue
  '#7c3aed', // violet
  '#15803d', // green
  '#b45309', // amber
  '#b91c1c', // red
  '#0891b2', // cyan
  '#db2777', // pink
  '#65a30d', // lime
  '#9333ea', // purple
  '#0369a1', // sky
  '#ca8a04', // yellow
  '#0d9488', // teal
  '#c2410c', // orange
  '#4d7c0f', // moss
  '#a21caf', // fuchsia
  '#1d4ed8', // indigo
]

function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export function colorFor(seed: string): string {
  return PALETTE[hash(seed) % PALETTE.length]
}

import type { Watch, WearLogEntry } from '../types'

/**
 * Build a stable per-watch color map. Watches are ranked by all-time wear count
 * (descending), then assigned palette colors by rank. Ties break by createdAt
 * so the order doesn't shift unexpectedly between renders.
 *
 * This is the single source of truth for "what color is this watch?" across
 * every analytics chart in the app.
 */
export function buildWatchColorMap(
  watches: Watch[],
  wearLog: WearLogEntry[],
): Map<string, string> {
  const wearCounts = new Map<string, number>()
  for (const e of wearLog) wearCounts.set(e.watchId, (wearCounts.get(e.watchId) ?? 0) + 1)
  const sorted = [...watches].sort((a, b) => {
    const wa = wearCounts.get(a.id) ?? 0
    const wb = wearCounts.get(b.id) ?? 0
    if (wa !== wb) return wb - wa
    return a.createdAt.localeCompare(b.createdAt)
  })
  const map = new Map<string, string>()
  sorted.forEach((w, i) => map.set(w.id, PALETTE[i % PALETTE.length]))
  return map
}

/** Lighten/darken via mix with white/black. ratio 0..1 toward target. */
function mix(hex: string, target: 'white' | 'black', ratio: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  const t = target === 'white' ? 255 : 0
  const mixCh = (c: number) => Math.round(c + (t - c) * ratio)
  return `#${[mixCh(r), mixCh(g), mixCh(b)]
    .map((x) => x.toString(16).padStart(2, '0'))
    .join('')}`
}

export function tint(hex: string, ratio = 0.85): string {
  return mix(hex, 'white', ratio)
}

export function shade(hex: string, ratio = 0.3): string {
  return mix(hex, 'black', ratio)
}
