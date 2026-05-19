// Weighted rotation fill for 2023-06-03 → 2024-03-06.
//
// Phase A (2023-06-03 → 2023-10-31): Tank-heavy after its 2023-07-05 acquisition
// Phase B (2023-11-01 → 2024-03-06): pivot to slightly Santos-heavy after its acquisition
//
// - Skips dates that already have an entry (preserves Carling, Copenhagen, SKN,
//   Apple Watch baseline, existing stubs, etc.)
// - Excludes the Apple Watch from the rotation since it already has its own
//   baseline of ~60 entries spanning this period; rotation fills the other days
// - All entries default to Amersham, England, United Kingdom
//
// Usage: node scripts/fill-2023-rotation.mjs <input.json> <output.json> [seed]

import { readFileSync, writeFileSync } from 'node:fs'
import { argv } from 'node:process'

const [, , inputPath, outputPath, seedArg] = argv
if (!inputPath || !outputPath) {
  console.error('Usage: node scripts/fill-2023-rotation.mjs <input.json> <output.json> [seed]')
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
  seiko: findWatch('Seiko', "Men's Chrono") || findWatch('Seiko', '7T94'),
  corum: findWatch('Corum', "Admiral's"),
  constellation: findWatch('Omega', 'Constellation'),
  seamaster: data.watches.find(
    (w) => w.brand === 'Omega' && w.model.toLowerCase().startsWith('seamaster 1948'),
  ),
  tank: findWatch('Cartier', 'Tank'),
  santos: findWatch('Cartier', 'Santos'),
  gshock: findWatch('Casio', 'G-SHOCK'),
  fink: findWatch('Fink', 'Stirling'),
  apple: findWatch('Apple', 'Apple Watch'),
}
for (const [k, v] of Object.entries(W)) {
  if (!v) {
    console.error(`Missing watch: ${k}`)
    process.exit(1)
  }
}

const AMERSHAM = { city: 'Amersham', region: 'England', country: 'United Kingdom' }
const NOW = '2026-05-19T00:00:00.000Z'

function entry(watchId, date) {
  return {
    id: makeId(`rotation-2023|${watchId}|${date}`, 'e'),
    watchId,
    date,
    location: AMERSHAM,
    source: 'manual',
    createdAt: NOW,
  }
}

// Phase weights — Apple intentionally excluded from rotation
function weightsForDate(date) {
  // Returns { watchId: weight } for watches owned on this date
  const out = []
  const acquired = (w) => w.acquisitionDate && date >= w.acquisitionDate
  const PHASE_B = date >= '2023-11-01'

  // Seiko intentionally excluded — keep its sporadic-only feel; only the
  // already-logged Seiko wears (mostly pre-2018) remain.
  if (acquired(W.corum)) out.push([W.corum.id, 1])
  if (acquired(W.constellation)) out.push([W.constellation.id, 2])
  if (acquired(W.seamaster)) out.push([W.seamaster.id, 3])
  if (acquired(W.tank)) out.push([W.tank.id, PHASE_B ? 3 : 5])
  if (acquired(W.gshock)) out.push([W.gshock.id, 1])
  if (acquired(W.santos) && PHASE_B) out.push([W.santos.id, 4])
  if (acquired(W.fink)) out.push([W.fink.id, 1])
  return out
}

function pickWeighted(weights) {
  const total = weights.reduce((s, [, w]) => s + w, 0)
  let r = rng() * total
  for (const [id, w] of weights) {
    r -= w
    if (r <= 0) return id
  }
  return weights[weights.length - 1][0]
}

// Find days to fill
const allDays = dateRangeIso('2023-06-03', '2024-03-06')
const takenDates = new Set(data.wearLog.map((e) => e.date))
const emptyDays = allDays.filter((d) => !takenDates.has(d))

console.log(`Window: 2023-06-03 → 2024-03-06 (${allDays.length} days)`)
console.log(`  Already filled: ${allDays.length - emptyDays.length}`)
console.log(`  To fill: ${emptyDays.length}`)

const additions = []
const pickCounts = new Map()
for (const d of emptyDays) {
  const weights = weightsForDate(d)
  const id = pickWeighted(weights)
  additions.push(entry(id, d))
  pickCounts.set(id, (pickCounts.get(id) ?? 0) + 1)
}

data.wearLog.push(...additions)
data.wearLog.sort((a, b) => a.date.localeCompare(b.date))
data.updatedAt = NOW

// ── Summary ────────────────────────────────────────────────────────────────
console.log(`\nAdded ${additions.length} rotation entries.`)
console.log(`\nDistribution in this fill (rotation only, excludes preserved entries):`)
const rows = Array.from(pickCounts.entries())
  .map(([id, c]) => {
    const w = watchById.get(id)
    return { name: `${w.brand} ${w.model}`, count: c }
  })
  .sort((a, b) => b.count - a.count)
const max = Math.max(...rows.map((r) => r.count))
for (const r of rows) {
  const bar = '█'.repeat(Math.round((r.count / max) * 30))
  console.log(`  ${r.name.padEnd(55)} ${String(r.count).padStart(3)}  ${bar}`)
}

// Phase breakdown
const phaseA = additions.filter((e) => e.date < '2023-11-01')
const phaseB = additions.filter((e) => e.date >= '2023-11-01')
function phaseHist(entries, label) {
  const m = new Map()
  for (const e of entries) m.set(e.watchId, (m.get(e.watchId) ?? 0) + 1)
  console.log(`\n${label} (${entries.length} entries):`)
  for (const [id, c] of [...m].sort((a, b) => b[1] - a[1])) {
    const w = watchById.get(id)
    console.log(`  ${(w.brand + ' ' + w.model).padEnd(55)} ${String(c).padStart(3)}`)
  }
}
phaseHist(phaseA, 'Phase A — 2023-06-03 → 2023-10-31 (Tank-heavy)')
phaseHist(phaseB, 'Phase B — 2023-11-01 → 2024-03-06 (Santos-heavy)')

// Total counts in window per watch (including preserved entries)
console.log(`\nTotal wear counts in window 2023-06-03 → 2024-03-06 per watch:`)
const totalInWindow = new Map()
for (const e of data.wearLog) {
  if (e.date >= '2023-06-03' && e.date <= '2024-03-06') {
    totalInWindow.set(e.watchId, (totalInWindow.get(e.watchId) ?? 0) + 1)
  }
}
const totalRows = Array.from(totalInWindow.entries())
  .map(([id, c]) => ({ name: `${watchById.get(id).brand} ${watchById.get(id).model}`, count: c }))
  .sort((a, b) => b.count - a.count)
for (const r of totalRows) {
  console.log(`  ${r.name.padEnd(55)} ${String(r.count).padStart(3)}`)
}

// Sanity
let dupes = 0
const seen = new Set()
for (const e of data.wearLog) {
  const k = `${e.watchId}|${e.date}`
  if (seen.has(k)) dupes++
  seen.add(k)
}
const dayCounts = new Map()
for (const e of data.wearLog) dayCounts.set(e.date, (dayCounts.get(e.date) ?? 0) + 1)
const multi = [...dayCounts.values()].filter((c) => c > 1).length
console.log(`\nSanity:`)
console.log(`  Total wear log: ${data.wearLog.length}`)
console.log(`  Duplicate (watch, date) entries: ${dupes} (should be 0)`)
console.log(`  Days with multiple watches: ${multi} (should be 0)`)

writeFileSync(outputPath, JSON.stringify(data, null, 2))
console.log(`\nWrote ${outputPath}`)
