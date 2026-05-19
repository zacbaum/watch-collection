// Replace wear log entries from 2023-01-01 to 2023-05-31 per the user's
// known-history brief:
//
//   2023-01-08 → 2023-01-31  Constellation, Amersham UK
//   2023-02-01 → 2023-03-04  Seamaster 1948, Amersham UK
//   2023-03-05 → 2023-03-11  Seamaster 1948, Saint Kitts and Nevis
//   2023-03-12 → 2023-04-13  Seamaster 1948, Amersham UK
//   2023-04-14 → 2023-04-22  Constellation, Bali, Indonesia
//   2023-04-23 → 2023-05-31  Rotation C/S (~50/50), Amersham UK
//
// Deletes any existing entries in [2023-01-01, 2023-05-31] (only the two
// first-wear stubs were there anyway) and re-creates the window cleanly.

import { readFileSync, writeFileSync } from 'node:fs'
import { argv } from 'node:process'

const [, , inputPath, outputPath, seedArg] = argv
if (!inputPath || !outputPath) {
  console.error('Usage: node scripts/fill-2023-jan-may.mjs <input.json> <output.json> [seed]')
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
if (!constellation || !seamaster) {
  console.error('Could not find Constellation or Seamaster 1948')
  console.error({ constellation: constellation?.id, seamaster: seamaster?.id })
  process.exit(1)
}

const NOW = '2026-05-19T00:00:00.000Z'
const AMERSHAM = { city: 'Amersham', country: 'United Kingdom' }
// Country-only form — matches how existing Saint Kitts entries are stored
// (the importer collapses city == country into country-only)
const SAINT_KITTS = { country: 'Saint Kitts and Nevis' }
const BALI = { city: 'Bali', country: 'Indonesia' }

function entry(watchId, date, location) {
  return {
    id: makeId(`historical-2023|${watchId}|${date}`, 'e'),
    watchId,
    date,
    location,
    source: 'manual',
    createdAt: NOW,
  }
}

// 1. Wipe the window
const beforeCount = data.wearLog.length
data.wearLog = data.wearLog.filter(
  (e) => e.date < '2023-01-01' || e.date > '2023-05-31',
)
const removed = beforeCount - data.wearLog.length
console.log(`Removed ${removed} existing entries in [2023-01-01, 2023-05-31]`)

// 2. Build the new schedule
const additions = []

// Constellation: 2023-01-08 → 2023-01-31, Amersham
for (const d of dateRangeIso('2023-01-08', '2023-01-31')) {
  additions.push(entry(constellation.id, d, AMERSHAM))
}

// Seamaster: 2023-02-01 → 2023-03-04, Amersham
for (const d of dateRangeIso('2023-02-01', '2023-03-04')) {
  additions.push(entry(seamaster.id, d, AMERSHAM))
}

// Seamaster: 2023-03-05 → 2023-03-11, Saint Kitts and Nevis
for (const d of dateRangeIso('2023-03-05', '2023-03-11')) {
  additions.push(entry(seamaster.id, d, SAINT_KITTS))
}

// Seamaster: 2023-03-12 → 2023-04-13, Amersham
for (const d of dateRangeIso('2023-03-12', '2023-04-13')) {
  additions.push(entry(seamaster.id, d, AMERSHAM))
}

// Constellation: 2023-04-14 → 2023-04-22, Bali
for (const d of dateRangeIso('2023-04-14', '2023-04-22')) {
  additions.push(entry(constellation.id, d, BALI))
}

// Rotation C/S, ~50/50 seeded random: 2023-04-23 → 2023-05-31, Amersham
const rotationDays = dateRangeIso('2023-04-23', '2023-05-31')
const targetConstellation = Math.round(rotationDays.length / 2)
const shuffled = [...rotationDays.keys()].sort(() => rng() - 0.5)
const constellationDayIndices = new Set(shuffled.slice(0, targetConstellation))
for (let i = 0; i < rotationDays.length; i++) {
  const watch = constellationDayIndices.has(i) ? constellation : seamaster
  additions.push(entry(watch.id, rotationDays[i], AMERSHAM))
}

// 3. Append and re-sort
data.wearLog.push(...additions)
data.wearLog.sort((a, b) => a.date.localeCompare(b.date))
data.updatedAt = NOW

// 4. Print summary
console.log(`Added ${additions.length} entries`)
console.log(`Total wear log: ${data.wearLog.length}`)

const inWindow = additions.filter(
  (e) => e.date >= '2023-01-01' && e.date <= '2023-05-31',
)
const perWatch = new Map()
for (const e of inWindow) {
  perWatch.set(e.watchId, (perWatch.get(e.watchId) ?? 0) + 1)
}
console.log(`\nPer watch in window:`)
for (const [id, c] of perWatch) {
  const w = data.watches.find((x) => x.id === id)
  console.log(`  ${w?.brand} ${w?.model}: ${c} entries`)
}

// Per-segment breakdown
const segments = [
  { name: 'Constellation 1', from: '2023-01-08', to: '2023-01-31', watch: constellation, loc: 'Amersham' },
  { name: 'Seamaster Amersham 1', from: '2023-02-01', to: '2023-03-04', watch: seamaster, loc: 'Amersham' },
  { name: 'Seamaster SKN', from: '2023-03-05', to: '2023-03-11', watch: seamaster, loc: 'Saint Kitts and Nevis' },
  { name: 'Seamaster Amersham 2', from: '2023-03-12', to: '2023-04-13', watch: seamaster, loc: 'Amersham' },
  { name: 'Constellation Bali', from: '2023-04-14', to: '2023-04-22', watch: constellation, loc: 'Bali' },
]
console.log(`\nFixed segments:`)
for (const s of segments) {
  const days = dateRangeIso(s.from, s.to)
  console.log(`  ${s.name}: ${days.length} days (${s.from} → ${s.to}, ${s.loc})`)
}
const rotC = rotationDays.filter((_, i) => constellationDayIndices.has(i)).length
const rotS = rotationDays.length - rotC
console.log(
  `  Rotation: ${rotationDays.length} days (2023-04-23 → 2023-05-31, Amersham) — ` +
    `${rotC} Constellation + ${rotS} Seamaster`,
)

// Sanity check: every day in window is filled exactly once
const days = dateRangeIso('2023-01-08', '2023-05-31')
let missing = 0
let duplicate = 0
const byDate = new Map()
for (const e of data.wearLog) {
  if (e.date < '2023-01-08' || e.date > '2023-05-31') continue
  if (!byDate.has(e.date)) byDate.set(e.date, [])
  byDate.get(e.date).push(e.watchId)
}
for (const d of days) {
  const list = byDate.get(d)
  if (!list || list.length === 0) missing++
  else if (list.length > 1) duplicate++
}
console.log(`\nSanity:`)
console.log(`  Days expected: ${days.length}`)
console.log(`  Days missing: ${missing} (should be 0)`)
console.log(`  Days with >1 watch: ${duplicate} (should be 0)`)

writeFileSync(outputPath, JSON.stringify(data, null, 2))
console.log(`\nWrote ${outputPath}`)
