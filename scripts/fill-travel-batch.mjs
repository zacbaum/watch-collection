// Travel/known-history batch:
//
// REPLACE:
//   2024-08-09 → 2024-08-12  Seamaster 1948, Edinburgh UK (overwrites Santos days)
// NEW (overwrites if anything exists):
//   2025-09-01 → 2025-09-07  Seamaster 1948, Carling Township CA
//   2025-09-12 → 2025-09-16  Seamaster 1948, Zakynthos GR
//   2025-12-05 → 2025-12-07  Seamaster 1948, Grindelwald CH
//   2025-12-24 → 2025-12-30  Corum Admiral's Cup, Toronto CA
//   2026-02-07 → 2026-02-17  Seamaster/Apple 70/30, Saint Kitts and Nevis
//   2026-04-03 → 2026-04-06  Seamaster 1948, Bled SI
//   2026-04-17 → 2026-04-23  Seamaster 1948, Wānaka NZ
//   2026-04-24 → 2026-04-25  Seamaster 1948, Christchurch NZ
//   2026-04-26 → 2026-04-27  Seamaster 1948, Auckland NZ
//   2026-04-28 → 2026-05-04  Seamaster 1948, Wānaka NZ
//
// Resolution note: user listed Christchurch as 24-25 and Auckland as 25-27.
// Both ranges overlap on April 25. Resolved: Christchurch 24-25, Auckland 26-27.

import { readFileSync, writeFileSync } from 'node:fs'
import { argv } from 'node:process'

const [, , inputPath, outputPath, seedArg] = argv
if (!inputPath || !outputPath) {
  console.error('Usage: node scripts/fill-travel-batch.mjs <input.json> <output.json> [seed]')
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

const seamaster = data.watches.find(
  (w) => w.brand === 'Omega' && w.model.toLowerCase().startsWith('seamaster 1948'),
)
const corum = findWatch('Corum', "Admiral's")
const apple = findWatch('Apple', 'Apple Watch')
if (!seamaster || !corum || !apple) {
  console.error('Missing watch', { seamaster: seamaster?.id, corum: corum?.id, apple: apple?.id })
  process.exit(1)
}

const NOW = '2026-05-19T00:00:00.000Z'

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

// Common locations
const LOC = {
  edinburgh: { city: 'Edinburgh', region: 'Scotland', country: 'United Kingdom' },
  carling: { city: 'Carling Township', region: 'Ontario', country: 'Canada' },
  zakynthos: { city: 'Zakynthos', country: 'Greece' },
  grindelwald: { city: 'Grindelwald', country: 'Switzerland' },
  toronto: { city: 'Toronto', region: 'Ontario', country: 'Canada' },
  skn: { country: 'Saint Kitts and Nevis' },
  bled: { city: 'Bled', country: 'Slovenia' },
  wanaka: { city: 'Wānaka', region: 'Otago', country: 'New Zealand' },
  christchurch: { city: 'Christchurch', region: 'Canterbury', country: 'New Zealand' },
  auckland: { city: 'Auckland', country: 'New Zealand' },
}

// Segments: from, to, watch(es), location, label, idPrefix
// For mixed-watch segments, watch is { ratios: [{ watchId, weight }] }
const segments = [
  { label: 'Edinburgh', from: '2024-08-09', to: '2024-08-12', watch: seamaster.id, location: LOC.edinburgh },
  { label: 'Carling Sep25', from: '2025-09-01', to: '2025-09-07', watch: seamaster.id, location: LOC.carling },
  { label: 'Zakynthos', from: '2025-09-12', to: '2025-09-16', watch: seamaster.id, location: LOC.zakynthos },
  { label: 'Grindelwald', from: '2025-12-05', to: '2025-12-07', watch: seamaster.id, location: LOC.grindelwald },
  { label: 'Toronto Dec25', from: '2025-12-24', to: '2025-12-30', watch: corum.id, location: LOC.toronto },
  {
    label: 'SKN Feb26 (Seamaster/Apple 70/30)',
    from: '2026-02-07',
    to: '2026-02-17',
    mix: { [seamaster.id]: 0.7, [apple.id]: 0.3 },
    location: LOC.skn,
  },
  { label: 'Bled', from: '2026-04-03', to: '2026-04-06', watch: seamaster.id, location: LOC.bled },
  { label: 'Wānaka Apr', from: '2026-04-17', to: '2026-04-23', watch: seamaster.id, location: LOC.wanaka },
  { label: 'Christchurch', from: '2026-04-24', to: '2026-04-25', watch: seamaster.id, location: LOC.christchurch },
  { label: 'Auckland', from: '2026-04-26', to: '2026-04-27', watch: seamaster.id, location: LOC.auckland },
  { label: 'Wānaka late-Apr/May', from: '2026-04-28', to: '2026-05-04', watch: seamaster.id, location: LOC.wanaka },
]

function pickFromMix(mix, idSeed) {
  // Deterministic weighted pick using rng (called from segments in order so
  // the mix distribution is reproducible)
  const entries = Object.entries(mix)
  const total = entries.reduce((s, [, w]) => s + w, 0)
  let r = rng() * total
  for (const [id, w] of entries) {
    r -= w
    if (r <= 0) return id
  }
  return entries[entries.length - 1][0]
}

// For mix segments we want clean ratios across the segment days. Instead of
// per-day random picks (which can deviate from 70/30 on small N), we shuffle
// the segment days and assign by ratio counts.
function assignMixedDays(days, mix) {
  const total = days.length
  const entries = Object.entries(mix)
  const counts = entries.map(([id, w]) => ({ id, target: Math.round(total * w) }))
  // Fix rounding so counts sum to total
  let sum = counts.reduce((s, c) => s + c.target, 0)
  let i = 0
  while (sum < total) {
    counts[i % counts.length].target += 1
    sum++
    i++
  }
  while (sum > total) {
    counts[i % counts.length].target -= 1
    sum--
    i++
  }
  const shuffled = [...days].sort(() => rng() - 0.5)
  const result = new Map()
  let idx = 0
  for (const c of counts) {
    for (let n = 0; n < c.target; n++) {
      result.set(shuffled[idx++], c.id)
    }
  }
  return result
}

let totalRemoved = 0
let totalAdded = 0
const summary = []

for (const seg of segments) {
  const days = dateRangeIso(seg.from, seg.to)
  // Track what's being overwritten
  const overwrites = []
  data.wearLog = data.wearLog.filter((e) => {
    if (days.includes(e.date)) {
      overwrites.push({ date: e.date, watch: watchById.get(e.watchId) })
      return false
    }
    return true
  })
  totalRemoved += overwrites.length

  // Build additions
  let dayToWatch
  if (seg.mix) {
    dayToWatch = assignMixedDays(days, seg.mix)
  } else {
    dayToWatch = new Map(days.map((d) => [d, seg.watch]))
  }
  const added = []
  for (const d of days) {
    const wid = dayToWatch.get(d)
    added.push(entry(wid, d, seg.location, `travel-batch|${wid}|${d}`))
  }
  data.wearLog.push(...added)
  totalAdded += added.length

  summary.push({ seg, days, overwrites, added })
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

console.log(`Travel batch — summary\n`)
for (const s of summary) {
  const locLabel = [s.seg.location.city, s.seg.location.country].filter(Boolean).join(', ')
  console.log(`${s.seg.label}: ${s.seg.from} → ${s.seg.to} (${s.days.length} days) — ${locLabel}`)
  if (s.overwrites.length > 0) {
    console.log(`  overwrote ${s.overwrites.length}:`)
    for (const o of s.overwrites) {
      console.log(`    ${o.date}  ${o.watch?.brand} ${o.watch?.model}`)
    }
  }
  if (s.seg.mix) {
    const counts = new Map()
    for (const e of s.added) counts.set(e.watchId, (counts.get(e.watchId) ?? 0) + 1)
    for (const [id, c] of counts) {
      const w = watchById.get(id)
      console.log(`  ${w?.brand} ${w?.model}: ${c} days`)
    }
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
