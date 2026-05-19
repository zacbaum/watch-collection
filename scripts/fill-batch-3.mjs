// Batch 3: light fills
//
//   2026-01-15 → 2026-02-06  Sporadic Seamaster/Tank/Santos, Amersham (~30% density)
//   2026-05-01 → 2026-05-19  Fixed counts in Amersham:
//                              3 Seamaster 1948
//                              2 Cartier Tank
//                              1 Cartier Santos (Cartier total: 3)
//                              2 Graham Silverstone
//                              2 Corum Admiral's Cup
//                            Total 10 wears in 19 days

import { readFileSync, writeFileSync } from 'node:fs'
import { argv } from 'node:process'

const [, , inputPath, outputPath, seedArg] = argv
if (!inputPath || !outputPath) {
  console.error('Usage: node scripts/fill-batch-3.mjs <input.json> <output.json> [seed]')
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
  graham: findWatch('Graham', 'Silverstone'),
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

// ── 2026-01-15 → 2026-02-06 sporadic ───────────────────────────────────────
{
  const allDays = dateRangeIso('2026-01-15', '2026-02-06')
  const takenDates = new Set(data.wearLog.map((e) => e.date))
  const blanks = allDays.filter((d) => !takenDates.has(d))

  // ~30% density of "popular": Seamaster / Tank / Santos
  const popular = [W.seamaster.id, W.tank.id, W.santos.id]
  const targetCount = Math.round(blanks.length * 0.3)
  const shuffled = [...blanks].sort(() => rng() - 0.5)
  const picks = shuffled.slice(0, targetCount).sort()

  const counts = new Map()
  const added = picks.map((d) => {
    const id = popular[Math.floor(rng() * popular.length)]
    counts.set(id, (counts.get(id) ?? 0) + 1)
    return entry(id, d, AMERSHAM, `b3-jan26-feb|${id}|${d}`)
  })
  data.wearLog.push(...added)
  summary.push({
    label: '2026-01-15 to 2026-02-06 sporadic',
    days: allDays.length,
    blanks: blanks.length,
    added: added.length,
    counts,
  })
}

// ── 2026-05-01 → 2026-05-19 fixed-count rotation ───────────────────────────
{
  const allDays = dateRangeIso('2026-05-01', '2026-05-19')
  const takenDates = new Set(data.wearLog.map((e) => e.date))
  const blanks = allDays.filter((d) => !takenDates.has(d))

  // Fixed counts: 3 Seamaster, 2 Tank, 1 Santos, 2 Graham, 2 Corum = 10
  const placements = [
    ...Array(3).fill(W.seamaster.id),
    ...Array(2).fill(W.tank.id),
    ...Array(1).fill(W.santos.id),
    ...Array(2).fill(W.graham.id),
    ...Array(2).fill(W.corum.id),
  ]
  if (placements.length > blanks.length) {
    console.error(`Not enough blank days (${blanks.length}) for placements (${placements.length})`)
    process.exit(1)
  }
  // Seed-shuffle both blanks and placements so the assignment is varied
  const shuffledBlanks = [...blanks].sort(() => rng() - 0.5)
  const shuffledPlacements = [...placements].sort(() => rng() - 0.5)

  const counts = new Map()
  const added = []
  for (let i = 0; i < shuffledPlacements.length; i++) {
    const id = shuffledPlacements[i]
    const d = shuffledBlanks[i]
    counts.set(id, (counts.get(id) ?? 0) + 1)
    added.push(entry(id, d, AMERSHAM, `b3-may26|${id}|${d}`))
  }
  data.wearLog.push(...added)
  summary.push({
    label: '2026-05-01 to 2026-05-19 fixed-count',
    days: allDays.length,
    blanks: blanks.length,
    added: added.length,
    counts,
  })
}

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

console.log(`Batch 3 — summary\n`)
let totalAdded = 0
for (const s of summary) {
  totalAdded += s.added
  console.log(`${s.label}: ${s.added} wears across ${s.blanks} blanks / ${s.days} days`)
  for (const [id, c] of s.counts) {
    const w = watchById.get(id)
    console.log(`  ${w?.brand} ${w?.model}: ${c}`)
  }
}
console.log(`\nFinal:`)
console.log(`  Wear log: ${data.wearLog.length}`)
console.log(`  Added: ${totalAdded}`)
console.log(`  Duplicate (watch, date): ${dupes} (should be 0)`)
console.log(`  Days with multiple watches: ${multi} (should be 0)`)

writeFileSync(outputPath, JSON.stringify(data, null, 2))
console.log(`\nWrote ${outputPath}`)
