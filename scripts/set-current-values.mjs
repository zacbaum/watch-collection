// Set initial current-value estimates on each owned watch.
// These are best-effort guesses based on general secondary-market ranges;
// a weekly cron job (in the data repo) will attempt to refresh them.
//
// Usage: node scripts/set-current-values.mjs <input.json> <output.json>

import { readFileSync, writeFileSync } from 'node:fs'
import { argv } from 'node:process'

const [, , inputPath, outputPath] = argv
if (!inputPath || !outputPath) {
  console.error('Usage: node scripts/set-current-values.mjs <input.json> <output.json>')
  process.exit(1)
}

const VALUATION_DATE = '2026-05-19'

// brand|model prefix -> { gbp, query }
const ESTIMATES = [
  { brand: 'Omega', modelStarts: 'seamaster 1948', gbp: 4500 },
  { brand: 'Cartier', modelStarts: 'santos', gbp: 4500 },
  { brand: 'Corum', modelStarts: "admiral's", gbp: 2800 },
  { brand: 'Graham', modelStarts: 'silverstone', gbp: 2800 },
  { brand: 'Cartier', modelStarts: 'tank', gbp: 2000 },
  { brand: 'Omega', modelStarts: 'constellation', gbp: 1500 },
  { brand: 'Apple', modelStarts: 'apple watch', gbp: 0 },
  { brand: 'Seiko', modelStarts: "men's chrono", gbp: 0 },
  { brand: 'Fink', modelStarts: 'stirling', gbp: 0 },
]

const data = JSON.parse(readFileSync(inputPath, 'utf8'))
let updated = 0

for (const w of data.watches) {
  if (w.status !== 'owned') continue
  const match = ESTIMATES.find(
    (e) =>
      e.brand.toLowerCase() === w.brand.toLowerCase() &&
      w.model.toLowerCase().startsWith(e.modelStarts.toLowerCase()),
  )
  if (!match) {
    console.log(`(no estimate for ${w.brand} ${w.model})`)
    continue
  }
  w.currentValue = { amount: match.gbp, currency: 'GBP' }
  w.currentValueGbp = match.gbp
  w.valueDate = VALUATION_DATE
  w.updatedAt = new Date().toISOString()
  updated++
  console.log(`  ${w.brand} ${w.model.padEnd(45)} £${match.gbp}`)
}

data.updatedAt = new Date().toISOString()
writeFileSync(outputPath, JSON.stringify(data, null, 2))

console.log(`\nUpdated ${updated} watches with current value estimates`)
console.log(`Valuation date: ${VALUATION_DATE}`)
console.log(`Wrote ${outputPath}`)
