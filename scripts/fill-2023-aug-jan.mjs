// More 2023 backfills from known history:
//
//   2023-08-23 → 2023-09-03  Carling Township (Ontario, Canada).
//     Fill EMPTY dates with Seamaster 1948. Existing entries (e.g. Apple
//     Watch from the earlier random backfill) are preserved.
//
//   2023-12-02 → 2023-12-04  Copenhagen, Constellation. OVERWRITES existing.
//
//   2023-12-19 → 2024-01-06  Saint Kitts and Nevis, Seamaster 1948.
//     OVERWRITES existing.
//
// Usage: node scripts/fill-2023-aug-jan.mjs <input.json> <output.json>

import { readFileSync, writeFileSync } from 'node:fs'
import { argv } from 'node:process'

const [, , inputPath, outputPath] = argv
if (!inputPath || !outputPath) {
  console.error('Usage: node scripts/fill-2023-aug-jan.mjs <input.json> <output.json>')
  process.exit(1)
}

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

function findWatch(brand, modelPrefix) {
  return data.watches.find(
    (w) =>
      w.brand.toLowerCase() === brand.toLowerCase() &&
      w.model.toLowerCase().startsWith(modelPrefix.toLowerCase()),
  )
}

const constellation = findWatch('Omega', 'Constellation')
const seamaster = data.watches.find(
  (w) => w.brand === 'Omega' && w.model.toLowerCase().startsWith('seamaster 1948'),
)
const apple = findWatch('Apple', 'Apple Watch SE 2')
const watchById = new Map(data.watches.map((w) => [w.id, w]))
if (!constellation || !seamaster || !apple) {
  console.error('Could not find a required watch', {
    constellation: constellation?.id,
    seamaster: seamaster?.id,
    apple: apple?.id,
  })
  process.exit(1)
}

// Seeded RNG for stable redistribution picks
function mulberry32(s) {
  return function () {
    let t = (s += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rng = mulberry32(20260519)

const NOW = '2026-05-19T00:00:00.000Z'
const CARLING = { city: 'Carling Township', region: 'Ontario', country: 'Canada' }
const COPENHAGEN = { city: 'Copenhagen', country: 'Denmark' }
const SAINT_KITTS = { country: 'Saint Kitts and Nevis' }

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

// ── Segment 1: 2023-08-23 → 2023-09-03 Carling, Seamaster on empty dates ──
const carlingDays = dateRangeIso('2023-08-23', '2023-09-03')
const carlingTaken = new Map()
for (const e of data.wearLog) {
  if (carlingDays.includes(e.date)) {
    carlingTaken.set(e.date, watchById.get(e.watchId))
  }
}

console.log(`Carling segment (${carlingDays.length} days):`)
for (const d of carlingDays) {
  const taken = carlingTaken.get(d)
  if (taken) console.log(`  ${d}  TAKEN  ${taken.brand} ${taken.model}  → kept`)
}
const carlingAdded = []
for (const d of carlingDays) {
  if (!carlingTaken.has(d)) {
    carlingAdded.push(
      entry(seamaster.id, d, CARLING, `aug-2023|${seamaster.id}|${d}`),
    )
  }
}
console.log(`  Adding ${carlingAdded.length} new Seamaster entries in Carling Township`)
data.wearLog.push(...carlingAdded)

// ── Segment 2: 2023-12-02 → 2023-12-04 Copenhagen, Constellation, OVERWRITE ──
const cphDays = dateRangeIso('2023-12-02', '2023-12-04')
const cphRemoved = []
data.wearLog = data.wearLog.filter((e) => {
  if (cphDays.includes(e.date)) {
    const w = watchById.get(e.watchId)
    cphRemoved.push(`${e.date} ${w?.brand} ${w?.model}`)
    return false
  }
  return true
})
console.log(`\nCopenhagen segment (${cphDays.length} days):`)
if (cphRemoved.length > 0) {
  console.log(`  Overwriting ${cphRemoved.length} existing entries:`)
  for (const r of cphRemoved) console.log(`    ${r}`)
}
const cphAdded = cphDays.map((d) =>
  entry(constellation.id, d, COPENHAGEN, `dec-2023|${constellation.id}|${d}`),
)
data.wearLog.push(...cphAdded)
console.log(`  Adding ${cphAdded.length} Constellation entries in Copenhagen`)

// ── Segment 3: 2023-12-19 → 2024-01-06 SKN, Seamaster, OVERWRITE ──
const sknDays = dateRangeIso('2023-12-19', '2024-01-06')
const sknRemoved = []
data.wearLog = data.wearLog.filter((e) => {
  if (sknDays.includes(e.date)) {
    const w = watchById.get(e.watchId)
    sknRemoved.push(`${e.date} ${w?.brand} ${w?.model}`)
    return false
  }
  return true
})
console.log(`\nSaint Kitts and Nevis segment (${sknDays.length} days):`)
if (sknRemoved.length > 0) {
  console.log(`  Overwriting ${sknRemoved.length} existing entries:`)
  for (const r of sknRemoved) console.log(`    ${r}`)
}
const sknAdded = sknDays.map((d) =>
  entry(seamaster.id, d, SAINT_KITTS, `dec-2023-skn|${seamaster.id}|${d}`),
)
data.wearLog.push(...sknAdded)
console.log(`  Adding ${sknAdded.length} Seamaster entries in Saint Kitts and Nevis`)

// ── Segment 4: Redistribute Apple Watch entries displaced by overwrites ──
// 4 Apple wears were overwritten above. Add 4 fresh ones on empty days
// within the original Apple Watch backfill window (2023-05-29 → 2024-03-06).
const APPLE_WINDOW = dateRangeIso('2023-05-29', '2024-03-06')
const takenDates = new Set(data.wearLog.map((e) => e.date))
const empty = APPLE_WINDOW.filter((d) => !takenDates.has(d))
// Shuffle deterministically
const shuffledEmpty = [...empty].sort(() => rng() - 0.5)
const APPLE_AMERSHAM = { city: 'Amersham', region: 'England', country: 'United Kingdom' }
const displaced = cphRemoved.length + sknRemoved.length
const applePicks = shuffledEmpty.slice(0, displaced).sort()
const appleAdded = applePicks.map((d) =>
  entry(apple.id, d, APPLE_AMERSHAM, `apple-redistrib|${apple.id}|${d}`),
)
data.wearLog.push(...appleAdded)
console.log(`\nApple Watch redistribution:`)
console.log(`  Empty days available in window: ${empty.length}`)
console.log(`  Adding ${appleAdded.length} Apple Watch entries on: ${applePicks.join(', ')}`)

// Sort and write
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
const byDate = new Map()
for (const e of data.wearLog) {
  byDate.set(e.date, (byDate.get(e.date) ?? 0) + 1)
}
let multi = 0
for (const c of byDate.values()) if (c > 1) multi++

console.log(`\nFinal:`)
console.log(`  Total wear log: ${data.wearLog.length}`)
console.log(
  `  Added this run: ${carlingAdded.length + cphAdded.length + sknAdded.length + appleAdded.length}`,
)
console.log(`  Removed this run: ${cphRemoved.length + sknRemoved.length}`)
console.log(`  Duplicate (watch, date) entries: ${dupes} (should be 0)`)
console.log(`  Days with multiple watches: ${multi} (should be 1 — pre-existing 2024-03-21)`)

writeFileSync(outputPath, JSON.stringify(data, null, 2))
console.log(`\nWrote ${outputPath}`)
