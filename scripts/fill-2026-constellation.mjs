// Fill some of the remaining 2026 blank days with Constellation in Amersham.
// "Some" interpreted as ~50% density (seeded random) so a few blanks remain.
//
// Window: 2026-01-01 → 2026-05-19 (today)

import { readFileSync, writeFileSync } from 'node:fs'
import { argv } from 'node:process'

const [, , inputPath, outputPath, seedArg] = argv
if (!inputPath || !outputPath) {
  console.error('Usage: node scripts/fill-2026-constellation.mjs <input.json> <output.json> [seed]')
  process.exit(1)
}
const seed = seedArg ? parseInt(seedArg, 10) : 20260520

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
const constellation = data.watches.find(
  (w) => w.brand === 'Omega' && w.model.toLowerCase().startsWith('constellation'),
)
if (!constellation) {
  console.error('Missing Constellation')
  process.exit(1)
}

const NOW = '2026-05-19T00:00:00.000Z'
const AMERSHAM = { city: 'Amersham', region: 'England', country: 'United Kingdom' }

const allDays = dateRangeIso('2026-01-01', '2026-05-19')
const takenDates = new Set(data.wearLog.map((e) => e.date))
const blanks = allDays.filter((d) => !takenDates.has(d))

// ~50% of blanks
const targetCount = Math.round(blanks.length * 0.5)
const shuffled = [...blanks].sort(() => rng() - 0.5)
const picks = shuffled.slice(0, targetCount).sort()

const added = picks.map((d) => ({
  id: makeId(`b4-constellation-26|${constellation.id}|${d}`, 'e'),
  watchId: constellation.id,
  date: d,
  location: AMERSHAM,
  source: 'manual',
  createdAt: NOW,
}))

data.wearLog.push(...added)
data.wearLog.sort((a, b) => a.date.localeCompare(b.date))
data.updatedAt = NOW

console.log(`2026 window: ${allDays.length} days`)
console.log(`  Already filled: ${allDays.length - blanks.length}`)
console.log(`  Blanks: ${blanks.length}`)
console.log(`  Filling: ${added.length} with Constellation in Amersham`)
console.log(`  Remaining blank after fill: ${blanks.length - added.length}`)

const dayCounts = new Map()
for (const e of data.wearLog) dayCounts.set(e.date, (dayCounts.get(e.date) ?? 0) + 1)
const multi = [...dayCounts.values()].filter((c) => c > 1).length
console.log(`\nDays with multiple watches: ${multi} (should be 0)`)
console.log(`Wear log: ${data.wearLog.length}`)

writeFileSync(outputPath, JSON.stringify(data, null, 2))
console.log(`\nWrote ${outputPath}`)
