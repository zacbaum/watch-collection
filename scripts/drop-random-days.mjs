// Drop ~7% of the random-fill wear entries (roughly 1 in 14) to simulate
// days you didn't wear a watch. Only touches entries from rotation/sparse
// scripts — never specific-trip entries or imported ones.
//
// Random-fill ID prefixes (these are interchangeable wears at Amersham):
//   - backfill            (Seiko/Corum/Apple early backfill)
//   - rotation-2023       (Phase A/B 2023 rotation)
//   - apple-redistrib     (Apple Watch redistributions)
//   - b2-fall25           (2025-09-17 to 2025-12-04 rotation)
//   - b2-dec25            (2025-12-08 to 2025-12-23 rotation)
//   - b2-jan26            (2026-01 sparse)
//   - b2-spring26         (2026 Feb-Apr sparse)
//   - b3-jan26-feb        (Jan 15-Feb 6 sporadic)
//   - b3-may26            (May 2026 fixed-count)
//   - b4-constellation-26 (2026 Constellation fills)
//
// Specific-trip entries (NOT dropped):
//   - travel-batch, b2-edin, b2-paris, b2-sep25-santos
//   - historical-2023, aug-2023, dec-2023, dec-2023-skn

import { readFileSync, writeFileSync } from 'node:fs'
import { argv } from 'node:process'

const [, , inputPath, outputPath, seedArg] = argv
if (!inputPath || !outputPath) {
  console.error('Usage: node scripts/drop-random-days.mjs <input.json> <output.json> [seed]')
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

// Per-eligible-entry drop probability. Targets ~7-8% of TOTAL wear entries
// once non-eligible (imported + specific-trip) entries are excluded from
// consideration.
const DROP_PROB = 1 / 9

const data = JSON.parse(readFileSync(inputPath, 'utf8'))
const watchById = new Map(data.watches.map((w) => [w.id, w]))

// To identify random-fill entries: we use the stable ID hash which we can't
// reverse, BUT we know the seed strings used. Easier route: identify by
// `source === 'manual'` AND match against the prefix patterns by recomputing
// the hash. But that's expensive.
//
// Pragmatic alternative: any entry with `source === 'manual'` AND location is
// Amersham AND the watch isn't on a known specific trip — it's a fill.
//
// Even simpler: skip entries whose date falls in known specific-trip windows.
// Everything else with source='manual' is fair game.
const SPECIFIC_TRIP_WINDOWS = [
  // [fromIso, toIso, description]
  ['2023-01-08', '2023-01-31', 'Constellation Jan 2023'],
  ['2023-02-01', '2023-04-13', 'Seamaster Feb-Apr 2023 (Amersham + SKN trip)'],
  ['2023-04-14', '2023-04-22', 'Bali trip'],
  ['2023-04-23', '2023-05-31', 'C/S rotation Apr-May 2023'],
  ['2023-07-27', '2023-07-29', 'Edinburgh Jul 2023'],
  ['2023-08-23', '2023-09-03', 'Carling Township Aug-Sep 2023'],
  ['2023-12-02', '2023-12-04', 'Copenhagen'],
  ['2023-12-19', '2024-01-06', 'SKN Dec 2023 - Jan 2024'],
  ['2024-03-02', '2024-03-04', 'Paris'],
  ['2024-08-09', '2024-08-12', 'Edinburgh Aug 2024'],
  ['2025-09-01', '2025-09-07', 'Carling Sep 2025'],
  ['2025-09-09', '2025-09-11', 'Santos Sep 2025'],
  ['2025-09-12', '2025-09-16', 'Zakynthos'],
  ['2025-12-05', '2025-12-07', 'Grindelwald'],
  ['2025-12-24', '2025-12-30', 'Toronto Dec 2025'],
  ['2026-02-07', '2026-02-17', 'SKN Feb 2026'],
  ['2026-04-03', '2026-04-06', 'Bled'],
  ['2026-04-17', '2026-05-04', 'New Zealand'],
  // User-specified sparse/fixed-count windows — already intentionally sparse
  ['2026-01-15', '2026-02-06', 'Jan 15 - Feb 6 sparse'],
  ['2026-05-01', '2026-05-19', 'May 2026 fixed-count'],
]
function inSpecificTrip(date) {
  for (const [from, to] of SPECIFIC_TRIP_WINDOWS) {
    if (date >= from && date <= to) return true
  }
  return false
}

const beforeCount = data.wearLog.length
const dropped = []
const kept = []

for (const e of data.wearLog) {
  // Only consider manual-source entries that aren't in a specific-trip window
  if (e.source === 'manual' && !inSpecificTrip(e.date)) {
    if (rng() < DROP_PROB) {
      dropped.push(e)
      continue
    }
  }
  kept.push(e)
}

data.wearLog = kept
data.updatedAt = new Date('2026-05-19T00:00:00.000Z').toISOString()

// Summary
const droppedByWatch = new Map()
const droppedByYear = new Map()
for (const e of dropped) {
  const w = watchById.get(e.watchId)
  const key = w ? `${w.brand} ${w.model}` : e.watchId
  droppedByWatch.set(key, (droppedByWatch.get(key) ?? 0) + 1)
  const year = e.date.slice(0, 4)
  droppedByYear.set(year, (droppedByYear.get(year) ?? 0) + 1)
}

console.log(`Dropped ${dropped.length} of ${beforeCount} wear entries (${((dropped.length / beforeCount) * 100).toFixed(1)}%)`)
console.log(`Wear log: ${beforeCount} -> ${data.wearLog.length}`)
console.log(`\nDropped by watch:`)
for (const [name, c] of [...droppedByWatch].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${name}: ${c}`)
}
console.log(`\nDropped by year:`)
for (const [y, c] of [...droppedByYear].sort()) {
  console.log(`  ${y}: ${c}`)
}

writeFileSync(outputPath, JSON.stringify(data, null, 2))
console.log(`\nWrote ${outputPath}`)
