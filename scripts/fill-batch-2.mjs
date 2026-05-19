// Second travel/known-history batch:
//
// REPLACE:
//   2023-07-27 → 2023-07-29  Cartier Tank, Edinburgh UK
//   2024-03-02 → 2024-03-04  Cartier Tank, Paris FR
//
// NEW:
//   2025-09-09 → 2025-09-11  Cartier Santos, Amersham UK
//
// ROTATION (every day filled, overwrite anything except previously-set
// travel segments):
//   2025-09-17 → 2025-12-04  Ultra Thin / Santos / Tank / Seamaster 1948 +
//                            1 Corum wear, Amersham UK
//   2025-12-08 → 2025-12-24  same rotation, Amersham UK
//     (Dec 24 already has Corum Toronto from earlier batch — preserve, so
//      the effective range is Dec 8-23)
//
// SPARSE (fill only currently-blank days, ~3.5/week density, picking from
// Seamaster / Tank / Santos):
//   2026-01-01 → 2026-01-14  early January (Amersham UK)
//   2026-02-18 → 2026-04-16  blank-fill within the Feb 18 → Apr 16 window,
//                            preserving Bled (Apr 3-6) and anything else
//                            already filled

import { readFileSync, writeFileSync } from 'node:fs'
import { argv } from 'node:process'

const [, , inputPath, outputPath, seedArg] = argv
if (!inputPath || !outputPath) {
  console.error('Usage: node scripts/fill-batch-2.mjs <input.json> <output.json> [seed]')
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
const pad = (n) => String(n).padStart(2, '0')
const isoFromMs = (ms) => {
  const d = new Date(ms)
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}
const msFromIso = (s) => {
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

const data = JSON.parse(readFileSync(inputPath, 'utf8'))
const watchById = new Map(data.watches.map((w) => [w.id, w]))

function findWatch(brand, modelPrefix) {
  return data.watches.find(
    (w) =>
      w.brand.toLowerCase() === brand.toLowerCase() &&
      w.model.toLowerCase().startsWith(modelPrefix.toLowerCase()),
  )
}

const W = {
  seamaster: data.watches.find(
    (w) => w.brand === 'Omega' && w.model.toLowerCase().startsWith('seamaster 1948'),
  ),
  tank: findWatch('Cartier', 'Tank'),
  santos: findWatch('Cartier', 'Santos'),
  ultrathin: findWatch('Audemars Piguet', 'Ultra Thin'),
  corum: findWatch('Corum', "Admiral's"),
}
for (const [k, v] of Object.entries(W)) {
  if (!v) {
    console.error(`Missing watch: ${k}`)
    process.exit(1)
  }
}

const NOW = '2026-05-19T00:00:00.000Z'
const AMERSHAM = { city: 'Amersham', region: 'England', country: 'United Kingdom' }
const EDINBURGH = { city: 'Edinburgh', region: 'Scotland', country: 'United Kingdom' }
const PARIS = { city: 'Paris', country: 'France' }

function entry(watchId, date, location, idSeed) {
  return {
    id: makeId(idSeed, 'e'),
    watchId,
    date,
    location,
    source: 'manual',
    createdAt: NOW,
  }
}

const summary = []

// ── Helper: remove days from wear log + return what was there ──────────────
function purgeDays(days) {
  const removed = []
  const set = new Set(days)
  data.wearLog = data.wearLog.filter((e) => {
    if (set.has(e.date)) {
      removed.push({ date: e.date, watch: watchById.get(e.watchId) })
      return false
    }
    return true
  })
  return removed
}

// ── Replace segments ───────────────────────────────────────────────────────
function replaceSegment(label, from, to, watchId, location, idPrefix) {
  const days = dateRangeIso(from, to)
  const removed = purgeDays(days)
  const added = days.map((d) => entry(watchId, d, location, `${idPrefix}|${watchId}|${d}`))
  data.wearLog.push(...added)
  summary.push({ label, from, to, days: days.length, removed, added, watches: [{ id: watchId, count: days.length }] })
}

replaceSegment('Edinburgh Jul23 (Tank)', '2023-07-27', '2023-07-29', W.tank.id, EDINBURGH, 'b2-edin')
replaceSegment('Paris Mar24 (Tank)', '2024-03-02', '2024-03-04', W.tank.id, PARIS, 'b2-paris')

// ── Sep 9-11 2025 Santos Amersham ──────────────────────────────────────────
replaceSegment('Sep 9-11 25 Santos', '2025-09-09', '2025-09-11', W.santos.id, AMERSHAM, 'b2-sep25-santos')

// ── Rotation periods (4-way split + 1 Corum each) ──────────────────────────
function fillRotation(label, from, to, idPrefix, opts = {}) {
  const skipDates = new Set(opts.skipDates ?? [])
  const allDays = dateRangeIso(from, to)
  const days = allDays.filter((d) => !skipDates.has(d))
  // Overwrite anything currently in this range that isn't explicitly skipped
  const removed = purgeDays(days)

  // Assign target counts: 1 Corum + remainder split across 4 main watches.
  // Distribute remainder so totals match exactly.
  const mains = [W.ultrathin.id, W.santos.id, W.tank.id, W.seamaster.id]
  const totalToFill = days.length
  const corumCount = totalToFill > 0 ? 1 : 0
  const remainder = totalToFill - corumCount
  const perMain = Math.floor(remainder / mains.length)
  let leftover = remainder - perMain * mains.length
  const targets = new Map()
  for (const id of mains) {
    targets.set(id, perMain + (leftover > 0 ? 1 : 0))
    if (leftover > 0) leftover--
  }
  if (corumCount > 0) targets.set(W.corum.id, corumCount)

  // Build a list of watch IDs to place, then seed-shuffle and assign to days
  const placements = []
  for (const [id, count] of targets) {
    for (let i = 0; i < count; i++) placements.push(id)
  }
  // Seed-shuffle
  for (let i = placements.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[placements[i], placements[j]] = [placements[j], placements[i]]
  }

  const added = []
  const counts = new Map()
  for (let i = 0; i < days.length; i++) {
    const id = placements[i]
    counts.set(id, (counts.get(id) ?? 0) + 1)
    added.push(entry(id, days[i], AMERSHAM, `${idPrefix}|${id}|${days[i]}`))
  }
  data.wearLog.push(...added)
  summary.push({
    label,
    from,
    to,
    days: days.length,
    removed,
    added,
    watches: Array.from(counts.entries()).map(([id, count]) => ({ id, count })),
  })
}

fillRotation(
  'Sep 17 - Dec 4 25 rotation',
  '2025-09-17',
  '2025-12-04',
  'b2-fall25',
)

// Dec 8-24 has Dec 24 already taken by Corum Toronto from earlier batch — preserve
fillRotation(
  'Dec 8-23 25 rotation',
  '2025-12-08',
  '2025-12-24',
  'b2-dec25',
  { skipDates: ['2025-12-24'] },
)

// ── Sparse fills (50% density, Seamaster/Tank/Santos) ──────────────────────
function sparseFill(label, from, to, idPrefix) {
  const allDays = dateRangeIso(from, to)
  const takenDates = new Set(data.wearLog.map((e) => e.date))
  const blanks = allDays.filter((d) => !takenDates.has(d))

  const watches = [W.seamaster.id, W.tank.id, W.santos.id]
  const added = []
  const counts = new Map()
  for (const d of blanks) {
    // ~50% chance per blank day -> targets 3-4/week
    if (rng() >= 0.5) continue
    const id = watches[Math.floor(rng() * watches.length)]
    counts.set(id, (counts.get(id) ?? 0) + 1)
    added.push(entry(id, d, AMERSHAM, `${idPrefix}|${id}|${d}`))
  }
  data.wearLog.push(...added)
  summary.push({
    label,
    from,
    to,
    days: allDays.length,
    blanks: blanks.length,
    removed: [],
    added,
    watches: Array.from(counts.entries()).map(([id, count]) => ({ id, count })),
  })
}

sparseFill('Early Jan 26 sparse', '2026-01-01', '2026-01-14', 'b2-jan26')
sparseFill('Feb 18 - Apr 16 26 sparse', '2026-02-18', '2026-04-16', 'b2-spring26')

// ── Finalize ───────────────────────────────────────────────────────────────
data.wearLog.sort((a, b) => a.date.localeCompare(b.date))
data.updatedAt = NOW

// Sanity
const seen = new Set()
let dupes = 0
for (const e of data.wearLog) {
  const k = `${e.watchId}|${e.date}`
  if (seen.has(k)) dupes++
  seen.add(k)
}
const dayCounts = new Map()
for (const e of data.wearLog) dayCounts.set(e.date, (dayCounts.get(e.date) ?? 0) + 1)
const multi = [...dayCounts.values()].filter((c) => c > 1).length

console.log(`Batch 2 — summary\n`)
let totalAdded = 0
let totalRemoved = 0
for (const s of summary) {
  totalAdded += s.added.length
  totalRemoved += s.removed.length
  const blanks = s.blanks != null ? ` (${s.blanks} blanks of ${s.days})` : ''
  console.log(`${s.label}: ${s.from} → ${s.to}${blanks}`)
  if (s.removed.length > 0) {
    console.log(`  overwrote ${s.removed.length}:`)
    for (const r of s.removed) {
      console.log(`    ${r.date}  ${r.watch?.brand} ${r.watch?.model}`)
    }
  }
  for (const { id, count } of s.watches) {
    const w = watchById.get(id)
    console.log(`  ${w?.brand} ${w?.model}: ${count}`)
  }
}

console.log(`\nFinal:`)
console.log(`  Wear log: ${data.wearLog.length}`)
console.log(`  Added: ${totalAdded}`)
console.log(`  Removed (overwrites): ${totalRemoved}`)
console.log(`  Duplicate (watch, date) entries: ${dupes} (should be 0)`)
console.log(`  Days with multiple watches: ${multi} (should be 0)`)

writeFileSync(outputPath, JSON.stringify(data, null, 2))
console.log(`\nWrote ${outputPath}`)
