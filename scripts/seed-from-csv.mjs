// Parse a wear-log CSV/TSV and emit an AppData JSON for seeding the data repo.
//
// Usage:
//   node scripts/seed-from-csv.mjs <input.csv> <output.json>
//
// Mirrors the in-app importer logic (src/lib/importer.ts) but runs in Node so
// we can pre-build a data.json before the app is even configured.

import { readFileSync, writeFileSync } from 'node:fs'
import { argv } from 'node:process'

const [, , inputPath, outputPath] = argv
if (!inputPath || !outputPath) {
  console.error('Usage: node scripts/seed-from-csv.mjs <input.csv> <output.json>')
  process.exit(1)
}

const text = readFileSync(inputPath, 'utf8')

// --- Helpers (mirrors src/lib/utils.ts + importer.ts) ---

function fixEncoding(s) {
  if (!s) return s
  return s.replace(/W[ÄA]?naka/gi, 'Wānaka').replace(/�/g, '').trim()
}

function parseDdmmyyyy(s) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec((s ?? '').trim())
  if (!m) return null
  const [, dd, mm, yyyy] = m
  return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`
}

function splitModelRef(raw) {
  const tokens = raw.trim().split(/\s+/)
  if (tokens.length < 2) return { model: raw.trim() }
  const last = tokens[tokens.length - 1]
  const refRegex = /^[A-Z]?[\dA-Z][\dA-Z.\-/]{2,}$/i
  if (refRegex.test(last) && /\d/.test(last)) {
    return { model: tokens.slice(0, -1).join(' '), reference: last }
  }
  return { model: raw.trim() }
}

const CITY_STATES = new Set(['Singapore', 'Monaco', 'Hong Kong', 'Vatican City'])

function normalizeLocation(row) {
  const city = fixEncoding(row.City || '')
  const region = fixEncoding(row.Region || '')
  let country = fixEncoding(row.Country || '')

  if (!country && CITY_STATES.has(city)) {
    return { city, country: city }
  }
  if (!country && region && !CITY_STATES.has(city)) {
    country = region
    return { city, country }
  }
  if (city === country) return { country }
  return {
    city: city || undefined,
    region: region || undefined,
    country: country || undefined,
  }
}

// Stable id generator (deterministic short alphanumeric). Not cryptographic.
function makeId(seed, prefix = 'w') {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  const hex = (h >>> 0).toString(36).padStart(7, '0').slice(0, 7)
  return `${prefix}_${hex}`
}

// --- Parse rows ---

const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0)
const firstLine = lines[0] ?? ''
const delim = firstLine.includes('\t') ? '\t' : ','
const headers = firstLine.split(delim).map((h) => h.trim())
const looksHeadered = headers.includes('Date') && headers.includes('Brand')

const rows = []
const dataStart = looksHeadered ? 1 : 0
for (let i = dataStart; i < lines.length; i++) {
  const cols = lines[i].split(delim)
  const row = {
    Date: cols[0] ?? '',
    Weekday: cols[1] ?? '',
    Month: cols[2] ?? '',
    Brand: cols[3] ?? '',
    Model: cols[4] ?? '',
    City: cols[5] ?? '',
    Region: cols[6] ?? '',
    Country: cols[7] ?? '',
  }
  rows.push(row)
}

// --- Build watches + wear log ---

const giftedToPartner = [{ brand: 'Phenix', model: 'K1113' }]
const isGifted = (brand, modelRaw) =>
  giftedToPartner.some(
    (g) =>
      g.brand.toLowerCase() === brand.toLowerCase() &&
      modelRaw.toLowerCase().startsWith(g.model.toLowerCase()),
  )

const watchByKey = new Map()
const wearLog = []
let earliest = null
let latest = null
let skipped = 0
const seedTime = '2026-05-18T00:00:00.000Z'

for (const row of rows) {
  const brand = fixEncoding(row.Brand || '').trim()
  const modelRaw = fixEncoding(row.Model || '').trim()
  const date = parseDdmmyyyy(row.Date)
  if (!brand || !modelRaw || !date) {
    skipped++
    continue
  }
  const key = `${brand}|${modelRaw}`
  let watch = watchByKey.get(key)
  if (!watch) {
    const { model, reference } = splitModelRef(modelRaw)
    const gifted = isGifted(brand, modelRaw)
    watch = {
      id: makeId(key, 'w'),
      brand,
      model,
      reference,
      status: gifted ? 'gifted' : 'owned',
      giftedTo: gifted ? 'Partner' : undefined,
      createdAt: seedTime,
      updatedAt: seedTime,
    }
    watchByKey.set(key, watch)
  }
  const loc = normalizeLocation(row)
  wearLog.push({
    id: makeId(`${key}|${date}`, 'e'),
    watchId: watch.id,
    date,
    location: loc.city || loc.country ? loc : undefined,
    source: 'imported',
    createdAt: seedTime,
  })
  if (!earliest || date < earliest) earliest = date
  if (!latest || date > latest) latest = date
}

const watches = Array.from(watchByKey.values()).sort((a, b) =>
  a.brand.localeCompare(b.brand) || a.model.localeCompare(b.model),
)

const data = {
  watches,
  wearLog,
  wishlist: [],
  serviceLog: [],
  valuations: [],
  schemaVersion: 1,
  updatedAt: seedTime,
}

writeFileSync(outputPath, JSON.stringify(data, null, 2))

console.log(`Wrote ${outputPath}`)
console.log(`  Watches: ${watches.length}`)
console.log(`  Wear log entries: ${wearLog.length}`)
console.log(`  Skipped rows: ${skipped}`)
console.log(`  Date range: ${earliest} → ${latest}`)
console.log(`  Watches:`)
for (const w of watches) {
  console.log(`    [${w.status}] ${w.brand} ${w.model}${w.reference ? ` (${w.reference})` : ''}`)
}
