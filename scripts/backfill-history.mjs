// Backfill fabricated historical wear entries for specific watches.
//
// Usage:
//   node scripts/backfill-history.mjs <input.json> <output.json> [seed]
//
// Deterministic given the seed. Re-running with the same input + seed yields
// identical entries (stable IDs hashed from watchId+date).
//
// Currently configured for the three watches Zac asked about:
//   - Seiko 7T94: 400 wears, 2008-10-02 → 2018-12-31, uniform, Toronto
//   - Corum Admiral's Cup: 600 wears, 2017-07-02 → 2022-12-31,
//       linear decline (front-loaded), Kingston CA pre-2019-09, London UK after
//   - Apple Watch SE 2: 60 wears, 2022-09-23 → 2025-08-25, uniform, Amersham
//
// Constraints:
//   - Never overlap a date already present in the wear log (one watch/day)
//   - source: 'manual' so backfilled entries are distinguishable in git history
//   - Output is the merged data.json; preview/summary printed to stdout

import { readFileSync, writeFileSync } from 'node:fs'
import { argv } from 'node:process'

const [, , inputPath, outputPath, seedArg] = argv
if (!inputPath || !outputPath) {
  console.error('Usage: node scripts/backfill-history.mjs <input.json> <output.json> [seed]')
  process.exit(1)
}
const seed = seedArg ? parseInt(seedArg, 10) : 20260519

// ── Seeded PRNG (mulberry32) ───────────────────────────────────────────────
function mulberry32(s) {
  return function () {
    let t = (s += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rng = mulberry32(seed)

// ── Date utilities (UTC, ISO yyyy-MM-dd) ───────────────────────────────────
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

// ── Stable ID hash (same shape as seed-from-csv.mjs) ───────────────────────
function makeId(seedStr, prefix = 'e') {
  let h = 2166136261
  for (let i = 0; i < seedStr.length; i++) {
    h ^= seedStr.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return `${prefix}_${(h >>> 0).toString(36).padStart(7, '0').slice(0, 7)}`
}

// ── Weighted sampling without replacement ──────────────────────────────────
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

// ── Load data ──────────────────────────────────────────────────────────────
const data = JSON.parse(readFileSync(inputPath, 'utf8'))
const existingDates = new Set(data.wearLog.map((e) => e.date))

function findWatch(brand, modelPrefix) {
  return data.watches.find(
    (w) =>
      w.brand.toLowerCase() === brand.toLowerCase() &&
      (w.model.toLowerCase() === modelPrefix.toLowerCase() ||
        w.model.toLowerCase().startsWith(modelPrefix.toLowerCase())),
  )
}

const seiko = findWatch('Seiko', '7T94')
const corum = findWatch('Corum', "Admiral's Cup Legend")
const apple = findWatch('Apple', 'Apple Watch SE 2')
if (!seiko || !corum || !apple) {
  console.error('Could not find one of the target watches in data.json')
  console.error({ seiko: seiko?.id, corum: corum?.id, apple: apple?.id })
  process.exit(1)
}

const NOW = '2026-05-19T00:00:00.000Z'

function entry(watchId, date, location) {
  return {
    id: makeId(`backfill|${watchId}|${date}`, 'e'),
    watchId,
    date,
    location,
    source: 'manual',
    createdAt: NOW,
  }
}

const summary = {}

// ── Seiko ──────────────────────────────────────────────────────────────────
{
  const days = dateRangeIso('2008-10-02', '2018-12-31')
  const weights = days.map(() => 1)
  const picks = sampleWeighted(days, weights, 400, existingDates)
  for (const d of picks) existingDates.add(d)
  for (const d of picks) {
    data.wearLog.push(entry(seiko.id, d, { city: 'Toronto', country: 'Canada' }))
  }
  summary.seiko = { picks, location: 'Toronto, Canada' }
}

// ── Corum ──────────────────────────────────────────────────────────────────
{
  const days = dateRangeIso('2017-07-02', '2022-12-31')
  // Aggressive year-stepped weights: 2017-2018 dense, 2019 moderate,
  // 2020+ almost trace. Yields roughly:
  //   2017 H2 ~150, 2018 ~290, 2019 ~120, 2020 ~25, 2021 ~12, 2022 ~5
  const yearWeights = { 2017: 50, 2018: 50, 2019: 20, 2020: 4, 2021: 2, 2022: 1 }
  const weights = days.map((d) => yearWeights[parseInt(d.slice(0, 4), 10)] ?? 1)
  const picks = sampleWeighted(days, weights, 600, existingDates)
  for (const d of picks) existingDates.add(d)
  const cutoff = '2019-09-01'
  for (const d of picks) {
    const location =
      d < cutoff
        ? { city: 'Kingston', country: 'Canada' }
        : { city: 'London', country: 'United Kingdom' }
    data.wearLog.push(entry(corum.id, d, location))
  }
  summary.corum = {
    picks,
    locations: { 'Kingston, Canada': picks.filter((d) => d < cutoff).length, 'London, United Kingdom': picks.filter((d) => d >= cutoff).length },
  }
}

// ── Apple ──────────────────────────────────────────────────────────────────
{
  const days = dateRangeIso('2022-09-23', '2025-08-25')
  const weights = days.map(() => 1)
  const picks = sampleWeighted(days, weights, 60, existingDates)
  for (const d of picks) existingDates.add(d)
  for (const d of picks) {
    data.wearLog.push(entry(apple.id, d, { city: 'Amersham', country: 'United Kingdom' }))
  }
  summary.apple = { picks, location: 'Amersham, United Kingdom' }
}

data.updatedAt = NOW

writeFileSync(outputPath, JSON.stringify(data, null, 2))

// ── Print summary ──────────────────────────────────────────────────────────
function yearHistogram(dates) {
  const m = new Map()
  for (const d of dates) {
    const y = d.slice(0, 4)
    m.set(y, (m.get(y) ?? 0) + 1)
  }
  return Array.from(m.entries()).sort()
}

function preview(name, label, picks, extra) {
  console.log(`\n${name} — ${picks.length} entries (location: ${label})`)
  console.log(`  Year histogram:`)
  for (const [y, c] of yearHistogram(picks)) {
    const bar = '█'.repeat(Math.round(c / 5))
    console.log(`    ${y}: ${String(c).padStart(3, ' ')}  ${bar}`)
  }
  if (extra) {
    console.log(`  Locations:`)
    for (const [loc, count] of Object.entries(extra)) {
      console.log(`    ${loc}: ${count}`)
    }
  }
  console.log(`  First 5: ${picks.slice(0, 5).join(', ')}`)
  console.log(`  Last 5:  ${picks.slice(-5).join(', ')}`)
}

console.log(`Backfill seed: ${seed}`)
console.log(`Wear log: ${data.wearLog.length - summary.seiko.picks.length - summary.corum.picks.length - summary.apple.picks.length} existing → ${data.wearLog.length} after backfill`)
console.log(`Added: ${summary.seiko.picks.length + summary.corum.picks.length + summary.apple.picks.length} entries`)

preview('Seiko 7T94', summary.seiko.location, summary.seiko.picks)
preview('Corum Admiral\'s Cup', 'split by date', summary.corum.picks, summary.corum.locations)
preview('Apple Watch SE 2', summary.apple.location, summary.apple.picks)

// Sanity check: no duplicate (watchId, date) entries
const seen = new Set()
let dupes = 0
for (const e of data.wearLog) {
  const k = `${e.watchId}|${e.date}`
  if (seen.has(k)) dupes++
  seen.add(k)
}
console.log(`\nDuplicate (watchId, date) entries: ${dupes} (should be 0)`)

// Sanity check: no two-watches-on-same-day
const byDate = new Map()
for (const e of data.wearLog) {
  if (!byDate.has(e.date)) byDate.set(e.date, [])
  byDate.get(e.date).push(e.watchId)
}
let twoOnSameDay = 0
for (const [, ids] of byDate) if (ids.length > 1) twoOnSameDay++
console.log(`Dates with multiple watches: ${twoOnSameDay} (should be 0)`)

console.log(`\nWrote ${outputPath}`)
