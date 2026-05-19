// One-off fix:
//   1. Remove all source='manual' Apple Watch entries (60 mis-windowed by my
//      first backfill which started 2022-09-23 — before purchase date).
//   2. Remove the duplicate Omega Seamaster 1948 entry on 2024-03-21
//      (Fink Stirling Pilot stays, as the less-worn watch).
//   3. Regenerate 60 Apple Watch entries in the correct window
//      2023-05-29 → 2024-03-06, uniform, Amersham UK.
//
// Usage: node scripts/fix-history.mjs <input.json> <output.json> [seed]

import { readFileSync, writeFileSync } from 'node:fs'
import { argv } from 'node:process'

const [, , inputPath, outputPath, seedArg] = argv
if (!inputPath || !outputPath) {
  console.error('Usage: node scripts/fix-history.mjs <input.json> <output.json> [seed]')
  process.exit(1)
}
const seed = seedArg ? parseInt(seedArg, 10) : 20260519

function mulberry32(s) {
  return function () {
    let t = (s += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rng = mulberry32(seed)

const DAY = 86_400_000
function pad(n) {
  return String(n).padStart(2, '0')
}
function isoFromMs(ms) {
  const d = new Date(ms)
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}
function msFromIso(s) {
  const [y, m, d] = s.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}
function dateRangeIso(fromIso, toIso) {
  const out = []
  for (let ms = msFromIso(fromIso); ms <= msFromIso(toIso); ms += DAY) {
    out.push(isoFromMs(ms))
  }
  return out
}

function makeId(seedStr, prefix = 'e') {
  let h = 2166136261
  for (let i = 0; i < seedStr.length; i++) {
    h ^= seedStr.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return `${prefix}_${(h >>> 0).toString(36).padStart(7, '0').slice(0, 7)}`
}

function sampleWeighted(candidates, weights, n, taken) {
  const pickable = candidates
    .map((d, i) => ({ d, w: weights[i] }))
    .filter((x) => !taken.has(x.d))
  if (pickable.length === 0) return []
  let total = pickable.reduce((s, x) => s + x.w, 0)
  const out = []
  while (out.length < n && pickable.length > 0 && total > 0) {
    let r = rng() * total
    let idx = -1
    for (let j = 0; j < pickable.length; j++) {
      r -= pickable[j].w
      if (r <= 0) {
        idx = j
        break
      }
    }
    if (idx === -1) idx = pickable.length - 1
    out.push(pickable[idx].d)
    total -= pickable[idx].w
    pickable.splice(idx, 1)
  }
  return out.sort()
}

const data = JSON.parse(readFileSync(inputPath, 'utf8'))

function findWatch(brand, modelPrefix) {
  return data.watches.find(
    (w) =>
      w.brand.toLowerCase() === brand.toLowerCase() &&
      (w.model.toLowerCase() === modelPrefix.toLowerCase() ||
        w.model.toLowerCase().startsWith(modelPrefix.toLowerCase())),
  )
}

const apple = findWatch('Apple', 'Apple Watch SE 2')
const omegaSeamaster = data.watches.find(
  (w) => w.brand === 'Omega' && w.model === 'Seamaster' && w.reference === '1948',
)
const fink = findWatch('Fink', 'Stirling Pilot')
if (!apple || !omegaSeamaster || !fink) {
  console.error('Could not find target watches', {
    apple: apple?.id,
    omegaSeamaster: omegaSeamaster?.id,
    fink: fink?.id,
  })
  process.exit(1)
}

// ── 1. Count + remove old Apple manual entries ─────────────────────────────
const appleManualBefore = data.wearLog.filter(
  (e) => e.watchId === apple.id && e.source === 'manual',
)
console.log(`Found ${appleManualBefore.length} existing manual Apple entries — removing`)

// ── 2. Find duplicate 2024-03-21 entries ───────────────────────────────────
const dup = data.wearLog.filter((e) => e.date === '2024-03-21')
console.log(`\n2024-03-21 entries before fix:`)
for (const e of dup) {
  const w = data.watches.find((x) => x.id === e.watchId)
  console.log(`  ${w?.brand} ${w?.model} (id=${e.id}, source=${e.source})`)
}

// Apply removals
data.wearLog = data.wearLog.filter((e) => {
  if (e.watchId === apple.id && e.source === 'manual') return false
  if (e.date === '2024-03-21' && e.watchId === omegaSeamaster.id) return false
  return true
})

// Confirm dedupe worked
const dupAfter = data.wearLog.filter((e) => e.date === '2024-03-21')
console.log(`\n2024-03-21 entries after dedupe: ${dupAfter.length}`)
for (const e of dupAfter) {
  const w = data.watches.find((x) => x.id === e.watchId)
  console.log(`  ${w?.brand} ${w?.model} (kept)`)
}

// ── 3. Regenerate Apple entries with correct window ────────────────────────
const NOW = '2026-05-19T00:00:00.000Z'
const existingDates = new Set(data.wearLog.map((e) => e.date))
const appleWindow = dateRangeIso('2023-05-29', '2024-03-06')
const appleWeights = appleWindow.map(() => 1)
const applePicks = sampleWeighted(appleWindow, appleWeights, 60, existingDates)
console.log(`\nApple Watch: ${applePicks.length} new entries between 2023-05-29 and 2024-03-06`)

for (const d of applePicks) {
  data.wearLog.push({
    id: makeId(`backfill|${apple.id}|${d}`, 'e'),
    watchId: apple.id,
    date: d,
    location: { city: 'Amersham', country: 'United Kingdom' },
    source: 'manual',
    createdAt: NOW,
  })
}

data.updatedAt = NOW

// ── Year histogram of the new Apple picks ──────────────────────────────────
function yearHistogram(dates) {
  const m = new Map()
  for (const d of dates) {
    const y = d.slice(0, 4)
    m.set(y, (m.get(y) ?? 0) + 1)
  }
  return Array.from(m.entries()).sort()
}
console.log(`\nApple year histogram:`)
for (const [y, c] of yearHistogram(applePicks)) {
  console.log(`  ${y}: ${c}`)
}
console.log(`Sample dates: ${applePicks.slice(0, 3).join(', ')} … ${applePicks.slice(-3).join(', ')}`)

// ── Sanity checks ──────────────────────────────────────────────────────────
const seen = new Set()
let dupes = 0
for (const e of data.wearLog) {
  const k = `${e.watchId}|${e.date}`
  if (seen.has(k)) dupes++
  seen.add(k)
}
const byDate = new Map()
for (const e of data.wearLog) {
  if (!byDate.has(e.date)) byDate.set(e.date, [])
  byDate.get(e.date).push(e.watchId)
}
let multiWatchDays = 0
for (const [, ids] of byDate) if (ids.length > 1) multiWatchDays++

console.log(`\nFinal counts:`)
console.log(`  Total wear log: ${data.wearLog.length}`)
console.log(`  Apple Watch entries: ${data.wearLog.filter((e) => e.watchId === apple.id).length}`)
console.log(`  Duplicate (watchId, date) entries: ${dupes} (should be 0)`)
console.log(`  Days with multiple watches: ${multiWatchDays} (should be 0)`)

writeFileSync(outputPath, JSON.stringify(data, null, 2))
console.log(`\nWrote ${outputPath}`)
