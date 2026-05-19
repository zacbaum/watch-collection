import { addDays, differenceInDays, format, parseISO, subMonths } from 'date-fns'
import type { Watch, WearLogEntry } from '../types'

export type TimeRange = 'all' | '5y' | '3y' | '1y' | '6m' | '1m'

export const TIME_RANGES: Array<{ key: TimeRange; label: string; months: number | null }> = [
  { key: '1m', label: '1m', months: 1 },
  { key: '6m', label: '6m', months: 6 },
  { key: '1y', label: '1y', months: 12 },
  { key: '3y', label: '3y', months: 36 },
  { key: '5y', label: '5y', months: 60 },
  { key: 'all', label: 'All', months: null },
]

/** Returns the ISO date (yyyy-MM-dd) for the start of a time range, or null for 'all'. */
export function rangeSince(range: TimeRange): string | null {
  const r = TIME_RANGES.find((x) => x.key === range)
  if (!r || r.months === null) return null
  return format(subMonths(new Date(), r.months), 'yyyy-MM-dd')
}

export function rangeLabel(range: TimeRange): string {
  return TIME_RANGES.find((x) => x.key === range)?.label ?? 'All'
}

/** Filter wear log entries to those on or after `since` (ISO yyyy-MM-dd). */
export function filterWearLog(
  wearLog: WearLogEntry[],
  since: string | null,
): WearLogEntry[] {
  if (!since) return wearLog
  return wearLog.filter((e) => e.date >= since)
}

/**
 * Generate every yyyy-MM key in the range [from, to] inclusive. Both bounds
 * are ISO yyyy-MM-dd; only the year-month portion is used.
 */
export function monthKeysInRange(fromIso: string, toIso: string): string[] {
  const [fy, fm] = fromIso.slice(0, 7).split('-').map(Number)
  const [ty, tm] = toIso.slice(0, 7).split('-').map(Number)
  const out: string[] = []
  let y = fy
  let m = fm
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`)
    m += 1
    if (m > 12) {
      m = 1
      y += 1
    }
  }
  return out
}

/**
 * Generate every yyyy key from `fromYear` to `toYear` inclusive.
 */
export function yearKeysInRange(fromYear: number, toYear: number): string[] {
  const out: string[] = []
  for (let y = fromYear; y <= toYear; y++) out.push(String(y))
  return out
}

export interface PerWatchStreak {
  watchId: string
  longestStreak: number
  longestStreakRange?: { from: string; to: string }
  longestGap: number
  longestGapRange?: { from: string; to: string }
  totalWears: number
  firstWorn?: string
  lastWorn?: string
}

/**
 * For each watch, find:
 *   - longest consecutive-day run wearing only that watch
 *   - longest gap between two wears of that watch
 */
export function perWatchStreaks(
  watches: Watch[],
  wearLog: WearLogEntry[],
): PerWatchStreak[] {
  const byWatch = new Map<string, string[]>() // watchId → sorted dates
  for (const e of wearLog) {
    const arr = byWatch.get(e.watchId) ?? []
    arr.push(e.date)
    byWatch.set(e.watchId, arr)
  }

  const out: PerWatchStreak[] = []
  for (const watch of watches) {
    const dates = (byWatch.get(watch.id) ?? []).slice().sort()
    if (dates.length === 0) {
      out.push({
        watchId: watch.id,
        longestStreak: 0,
        longestGap: 0,
        totalWears: 0,
      })
      continue
    }

    // Longest consecutive run
    let bestStreak = 1
    let bestStreakStart = dates[0]
    let bestStreakEnd = dates[0]
    let curStart = dates[0]
    let curLen = 1
    for (let i = 1; i < dates.length; i++) {
      const prev = parseISO(dates[i - 1])
      const here = parseISO(dates[i])
      if (differenceInDays(here, prev) === 1) {
        curLen += 1
      } else {
        curLen = 1
        curStart = dates[i]
      }
      if (curLen > bestStreak) {
        bestStreak = curLen
        bestStreakStart = curStart
        bestStreakEnd = dates[i]
      }
    }

    // Longest gap between two consecutive wears (in days)
    let bestGap = 0
    let bestGapFrom: string | undefined
    let bestGapTo: string | undefined
    for (let i = 1; i < dates.length; i++) {
      const gap = differenceInDays(parseISO(dates[i]), parseISO(dates[i - 1]))
      if (gap > bestGap) {
        bestGap = gap
        bestGapFrom = dates[i - 1]
        bestGapTo = dates[i]
      }
    }

    out.push({
      watchId: watch.id,
      longestStreak: bestStreak,
      longestStreakRange: { from: bestStreakStart, to: bestStreakEnd },
      longestGap: bestGap,
      longestGapRange:
        bestGapFrom && bestGapTo ? { from: bestGapFrom, to: bestGapTo } : undefined,
      totalWears: dates.length,
      firstWorn: dates[0],
      lastWorn: dates[dates.length - 1],
    })
  }
  return out
}

/** Distinct watches worn per month. */
export function rotationDiversityByMonth(
  wearLog: WearLogEntry[],
): Array<{ month: string; uniqueWatches: number; totalWears: number }> {
  const byMonth = new Map<string, Set<string>>()
  const counts = new Map<string, number>()
  for (const e of wearLog) {
    const m = e.date.slice(0, 7)
    if (!byMonth.has(m)) byMonth.set(m, new Set())
    byMonth.get(m)!.add(e.watchId)
    counts.set(m, (counts.get(m) ?? 0) + 1)
  }
  return Array.from(byMonth.entries())
    .map(([month, set]) => ({
      month,
      uniqueWatches: set.size,
      totalWears: counts.get(month) ?? 0,
    }))
    .sort((a, b) => a.month.localeCompare(b.month))
}

/**
 * Watch wear share per month — returns an array of monthly buckets, each with a
 * record of watchId → count. Useful for stacked area charts.
 */
export interface ShareRow {
  month: string
  [watchId: string]: string | number
}

/**
 * Aggregate monthly share rows into quarterly buckets. Each quarter label is
 * `yyyy-Qn` where n is 1-4. Useful for smoothing very noisy monthly data.
 */
export function aggregateToQuarters(rows: ShareRow[]): ShareRow[] {
  const map = new Map<string, ShareRow>()
  for (const row of rows) {
    const [yStr, mStr] = (row.month as string).split('-')
    const y = parseInt(yStr, 10)
    const m = parseInt(mStr, 10)
    const q = `${y}-Q${Math.ceil(m / 3)}`
    if (!map.has(q)) map.set(q, { month: q })
    const target = map.get(q)!
    for (const [k, v] of Object.entries(row)) {
      if (k === 'month') continue
      const cur = (target[k] as number | undefined) ?? 0
      target[k] = cur + (v as number)
    }
  }
  return Array.from(map.values()).sort((a, b) =>
    String(a.month).localeCompare(String(b.month)),
  )
}

/**
 * Pick top N contributors by total weight across rows. Anything outside the top
 * gets bucketed into the "__other__" key. Returns the transformed rows plus the
 * ordered top IDs (largest first).
 */
export function topNPlusOther(
  rows: ShareRow[],
  candidateIds: string[],
  n: number,
): { rows: ShareRow[]; topIds: string[]; hasOther: boolean } {
  const totals = new Map<string, number>()
  for (const row of rows) {
    for (const id of candidateIds) {
      const v = (row[id] as number | undefined) ?? 0
      if (v) totals.set(id, (totals.get(id) ?? 0) + v)
    }
  }
  const sorted = Array.from(totals.entries()).sort((a, b) => b[1] - a[1])
  const topIds = sorted.slice(0, n).map(([id]) => id)
  const otherIds = new Set(sorted.slice(n).map(([id]) => id))

  const out: ShareRow[] = rows.map((row) => {
    const newRow: ShareRow = { month: row.month }
    let other = 0
    for (const id of topIds) {
      const v = (row[id] as number | undefined) ?? 0
      if (v) newRow[id] = v
    }
    for (const id of otherIds) {
      other += (row[id] as number | undefined) ?? 0
    }
    if (other > 0) newRow['__other__'] = other
    return newRow
  })
  return { rows: out, topIds, hasOther: otherIds.size > 0 }
}

export function watchShareByMonth(watches: Watch[], wearLog: WearLogEntry[]): ShareRow[] {
  const months = new Set<string>()
  for (const e of wearLog) months.add(e.date.slice(0, 7))
  const sortedMonths = Array.from(months).sort()

  const out: ShareRow[] = []
  for (const m of sortedMonths) {
    const row: ShareRow = { month: m }
    for (const w of watches) row[w.id] = 0
    out.push(row)
  }
  const idx = new Map(sortedMonths.map((m, i) => [m, i]))
  for (const e of wearLog) {
    const m = e.date.slice(0, 7)
    const i = idx.get(m)
    if (i == null) continue
    const current = (out[i][e.watchId] as number | undefined) ?? 0
    out[i][e.watchId] = current + 1
  }
  return out
}

/** Build a Map of date string → watchId for fast lookup. */
export function wearLogByDate(wearLog: WearLogEntry[]): Map<string, string> {
  const m = new Map<string, string>()
  // Last-write-wins if duplicates somehow exist
  for (const e of wearLog) m.set(e.date, e.watchId)
  return m
}

/** All years in which there's at least one wear entry. */
export function yearsCovered(wearLog: WearLogEntry[]): number[] {
  const years = new Set<number>()
  for (const e of wearLog) years.add(parseInt(e.date.slice(0, 4), 10))
  return Array.from(years).sort((a, b) => b - a)
}

/** Format ISO date to "d MMM yyyy" or fall back to ISO. */
export function fmt(iso: string): string {
  try {
    return format(parseISO(iso), 'd MMM yyyy')
  } catch {
    return iso
  }
}

/** Get an array of every date string in [from, to] inclusive (ISO yyyy-MM-dd). */
export function dateRange(from: string, to: string): string[] {
  const out: string[] = []
  let d = parseISO(from)
  const end = parseISO(to)
  while (d.getTime() <= end.getTime()) {
    out.push(format(d, 'yyyy-MM-dd'))
    d = addDays(d, 1)
  }
  return out
}
