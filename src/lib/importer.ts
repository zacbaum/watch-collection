import Papa from 'papaparse'
import { nanoid } from 'nanoid'
import type { AppData, Watch, WearLogEntry, WatchStatus } from '../types'
import { fixEncoding, nowIso, parseDdmmyyyy } from './utils'

interface RawRow {
  Date: string
  Weekday: string
  Month: string
  Brand: string
  Model: string
  City: string
  Region: string
  Country: string
}

/**
 * Try to split a "Model" string like "Tank 590005" or "Seamaster Professional 2561.80.00"
 * into a model name and reference number. Heuristic: if the last token looks like
 * a ref (digits, dots, dashes), strip it. Otherwise keep the whole thing as model.
 */
function splitModelRef(raw: string): { model: string; reference?: string } {
  const tokens = raw.trim().split(/\s+/)
  if (tokens.length < 2) return { model: raw.trim() }
  const last = tokens[tokens.length - 1]
  // Ref patterns: pure digits, digits with dots/dashes, alphanumeric like K1113, 7T94, DW5600
  const refRegex = /^[A-Z]?[\dA-Z][\dA-Z.\-/]{2,}$/i
  if (refRegex.test(last) && /\d/.test(last)) {
    return { model: tokens.slice(0, -1).join(' '), reference: last }
  }
  return { model: raw.trim() }
}

/** City-states / countries where city == country. Normalize so we don't double up. */
const CITY_STATES = new Set(['Singapore', 'Monaco', 'Hong Kong', 'Vatican City'])

function normalizeLocation(row: RawRow): { city?: string; region?: string; country?: string } {
  const city = fixEncoding(row.City || '')
  const region = fixEncoding(row.Region || '')
  let country = fixEncoding(row.Country || '')

  // Resolve country from region or city when missing
  if (!country) {
    if (CITY_STATES.has(city)) country = city
    else if (region) country = region
  }

  // Collapse when city == country (city-state, small nation entries where the
  // sheet repeated the same string in both fields) — store as country-only so
  // map grouping doesn't end up with two keys for the same place.
  if (city && country && city === country) {
    return { country }
  }

  return {
    city: city || undefined,
    region: region || undefined,
    country: country || undefined,
  }
}

interface ImportOptions {
  /** Phenix K1113 was bought and gifted to partner. */
  giftedToPartnerBrands?: Array<{ brand: string; model: string }>
}

const DEFAULT_OPTIONS: ImportOptions = {
  giftedToPartnerBrands: [{ brand: 'Phenix', model: 'K1113' }],
}

export interface ImportResult {
  watches: Watch[]
  wearLog: WearLogEntry[]
  summary: {
    rowsParsed: number
    rowsSkipped: number
    distinctWatches: number
    dateRange: { from: string; to: string } | null
  }
}

export function importFromCsv(text: string, options: ImportOptions = DEFAULT_OPTIONS): ImportResult {
  // Detect delimiter: tab vs comma
  const firstLine = text.split('\n')[0] ?? ''
  const delimiter = firstLine.includes('\t') ? '\t' : ','

  // Peek at first non-empty line — if it doesn't have "Date" as a header, treat data as headerless
  const looksHeadered = /\bDate\b/i.test(firstLine) && /\bBrand\b/i.test(firstLine)

  const result = Papa.parse<RawRow | string[]>(text, {
    delimiter,
    skipEmptyLines: true,
    header: looksHeadered,
    transformHeader: (h) => h.trim(),
  })

  const rows: RawRow[] = []
  if (looksHeadered) {
    for (const r of result.data as RawRow[]) rows.push(r)
  } else {
    for (const arr of result.data as string[][]) {
      if (!Array.isArray(arr)) continue
      const r: RawRow = {
        Date: arr[0] ?? '',
        Weekday: arr[1] ?? '',
        Month: arr[2] ?? '',
        Brand: arr[3] ?? '',
        Model: arr[4] ?? '',
        City: arr[5] ?? '',
        Region: arr[6] ?? '',
        Country: arr[7] ?? '',
      }
      rows.push(r)
    }
  }

  const watchKey = (brand: string, model: string) => `${brand.trim()}|${model.trim()}`
  const watchByKey = new Map<string, Watch>()
  const wearLog: WearLogEntry[] = []
  let skipped = 0
  let earliest: string | null = null
  let latest: string | null = null

  for (const row of rows) {
    const brand = fixEncoding(row.Brand || '').trim()
    const modelRaw = fixEncoding(row.Model || '').trim()
    const date = parseDdmmyyyy(row.Date)
    if (!brand || !modelRaw || !date) {
      skipped++
      continue
    }

    const key = watchKey(brand, modelRaw)
    let watch = watchByKey.get(key)
    if (!watch) {
      const { model, reference } = splitModelRef(modelRaw)
      const isGifted = options.giftedToPartnerBrands?.some(
        (g) =>
          g.brand.toLowerCase() === brand.toLowerCase() &&
          modelRaw.toLowerCase().startsWith(g.model.toLowerCase()),
      )
      const status: WatchStatus = isGifted ? 'gifted' : 'owned'
      watch = {
        id: nanoid(8),
        brand,
        model,
        reference,
        status,
        giftedTo: isGifted ? 'Partner' : undefined,
        notes: undefined,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      }
      watchByKey.set(key, watch)
    }

    const loc = normalizeLocation(row)
    wearLog.push({
      id: nanoid(10),
      watchId: watch.id,
      date,
      location: loc.city || loc.country ? loc : undefined,
      source: 'imported',
      createdAt: nowIso(),
    })

    if (!earliest || date < earliest) earliest = date
    if (!latest || date > latest) latest = date
  }

  return {
    watches: Array.from(watchByKey.values()),
    wearLog,
    summary: {
      rowsParsed: rows.length - skipped,
      rowsSkipped: skipped,
      distinctWatches: watchByKey.size,
      dateRange: earliest && latest ? { from: earliest, to: latest } : null,
    },
  }
}

/** Merge import result into existing app data without duplicating watches by brand+model. */
export function mergeImport(existing: AppData, imported: ImportResult): AppData {
  const watches = [...existing.watches]
  const idByKey = new Map<string, string>()
  for (const w of watches) {
    idByKey.set(`${w.brand}|${w.model}|${w.reference ?? ''}`, w.id)
  }

  // Map imported watch id → existing watch id (or imported id if new)
  const idMap = new Map<string, string>()
  for (const w of imported.watches) {
    const key = `${w.brand}|${w.model}|${w.reference ?? ''}`
    const existingId = idByKey.get(key)
    if (existingId) {
      idMap.set(w.id, existingId)
    } else {
      idMap.set(w.id, w.id)
      watches.push(w)
      idByKey.set(key, w.id)
    }
  }

  // De-dupe wear log on (watchId, date)
  const wearKey = (e: WearLogEntry) => `${e.watchId}|${e.date}`
  const existingWearKeys = new Set(existing.wearLog.map(wearKey))
  const wearLog = [...existing.wearLog]
  for (const entry of imported.wearLog) {
    const mapped: WearLogEntry = { ...entry, watchId: idMap.get(entry.watchId) ?? entry.watchId }
    if (!existingWearKeys.has(wearKey(mapped))) {
      wearLog.push(mapped)
      existingWearKeys.add(wearKey(mapped))
    }
  }

  return { ...existing, watches, wearLog, updatedAt: nowIso() }
}
