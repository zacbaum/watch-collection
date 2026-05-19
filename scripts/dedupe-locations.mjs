// Normalize wear log entries where location.city === location.country to
// country-only form. The original importer had an ordering bug that caused
// Saint Kitts and Nevis (and likely Singapore) entries to keep both fields
// with the same string, which makes the travel map group them separately
// from country-only entries for the same place.
//
// Usage: node scripts/dedupe-locations.mjs <input.json> <output.json>

import { readFileSync, writeFileSync } from 'node:fs'
import { argv } from 'node:process'

const [, , inputPath, outputPath] = argv
if (!inputPath || !outputPath) {
  console.error('Usage: node scripts/dedupe-locations.mjs <input.json> <output.json>')
  process.exit(1)
}

const data = JSON.parse(readFileSync(inputPath, 'utf8'))

const norm = (s) => (s ?? '').trim().toLowerCase()
const changesByCountry = new Map()
let changed = 0

for (const e of data.wearLog) {
  if (!e.location) continue
  const { city, country } = e.location
  if (city && country && norm(city) === norm(country)) {
    // Drop the city field, leave region/lat/lng untouched
    delete e.location.city
    changesByCountry.set(country, (changesByCountry.get(country) ?? 0) + 1)
    changed++
  }
}

data.updatedAt = new Date('2026-05-19T00:00:00.000Z').toISOString()

console.log(`Entries normalized: ${changed}`)
if (changesByCountry.size > 0) {
  console.log(`By place:`)
  for (const [c, n] of [...changesByCountry].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${c}: ${n}`)
  }
}

// Sanity: confirm the travel-map grouping key would now be unique per place
const keys = new Map()
for (const e of data.wearLog) {
  if (!e.location?.city && !e.location?.country) continue
  const key = [e.location.city, e.location.country].filter(Boolean).join('|')
  keys.set(key, (keys.get(key) ?? 0) + 1)
}
const sknKeys = [...keys.keys()].filter((k) => /saint kitts/i.test(k))
const sgKeys = [...keys.keys()].filter((k) => /singapore/i.test(k))
console.log(`\nDistinct map keys for Saint Kitts and Nevis: ${sknKeys.length} (${sknKeys.join(', ')})`)
console.log(`Distinct map keys for Singapore:            ${sgKeys.length} (${sgKeys.join(', ')})`)

writeFileSync(outputPath, JSON.stringify(data, null, 2))
console.log(`\nWrote ${outputPath}`)
