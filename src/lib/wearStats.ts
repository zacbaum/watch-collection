import {
  addWeeks,
  differenceInDays,
  format,
  parseISO,
  startOfISOWeek,
  subMonths,
} from 'date-fns'
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
 * Rotation score: how evenly wears are spread across watches.
 *
 *   score = round( H / log(N) * 100 )       where
 *     H = -Σ p_i log p_i              (Shannon entropy of per-watch wear share)
 *     N = number of distinct watches worn in the window
 *
 * - 100 = perfectly even rotation (every watch worn equally often)
 * - 0   = one watch wore every day in the window
 * - undefined when fewer than 2 watches were worn
 *
 * "Effective watches" = e^H — the equivalent number of equally-weighted
 * watches that would produce the same entropy. If you rotate 4 watches
 * evenly, effective = 4; if one dominates, effective < 4.
 */
export function rotationScore(wearLog: WearLogEntry[]): {
  score: number | null
  effective: number
  uniqueWatches: number
  totalWears: number
} {
  const counts = new Map<string, number>()
  for (const e of wearLog) counts.set(e.watchId, (counts.get(e.watchId) ?? 0) + 1)
  const total = wearLog.length
  const n = counts.size
  if (total === 0) return { score: null, effective: 0, uniqueWatches: 0, totalWears: 0 }
  let h = 0
  for (const c of counts.values()) {
    const p = c / total
    if (p > 0) h -= p * Math.log(p)
  }
  const effective = Math.exp(h)
  const score = n > 1 ? Math.round((h / Math.log(n)) * 100) : null
  return { score, effective, uniqueWatches: n, totalWears: total }
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
 * Generate every yyyy-MM-dd key for the Monday of each ISO week in
 * [from, to] (inclusive of the weeks containing each bound).
 */
export function weekKeysInRange(fromIso: string, toIso: string): string[] {
  const start = startOfISOWeek(parseISO(fromIso))
  const end = startOfISOWeek(parseISO(toIso))
  const out: string[] = []
  let d = start
  while (d.getTime() <= end.getTime()) {
    out.push(format(d, 'yyyy-MM-dd'))
    d = addWeeks(d, 1)
  }
  return out
}

/** Monday-of-ISO-week key for a yyyy-MM-dd date, returned as yyyy-MM-dd. */
export function weekKeyOf(dateIso: string): string {
  return format(startOfISOWeek(parseISO(dateIso)), 'yyyy-MM-dd')
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

// ─── Sellability ───────────────────────────────────────────────────────────
//
// Composite 0–100 score per owned watch. Higher = "more sellable" — the
// signals are pure wear-pattern derived (we don't peek at price). Four
// components, weighted:
//
//   • Dormancy   (35%)  — days since last worn, scaled to a 2-year cap
//   • Drop-off   (25%)  — recent (last 365d) wear rate vs lifetime rate.
//                         If you used to wear it, then stopped, scores high
//   • One-off    (20%)  — never worn / worn once / worn in a tight burst
//                         then abandoned
//   • Under-use  (20%)  — low absolute wear count (vs a 100-wear "committed"
//                         baseline)
//
// Each component is clamped to [0, 1]; the score is the weighted sum × 100.
// The rationale field surfaces the single biggest contributor in plain English
// so the table can give the user a "why" without exposing the math.

export interface SellabilityResult {
  watchId: string
  score: number
  wearsTotal: number
  wearsLast365: number
  daysSinceWorn: number | null
  daysOwned: number | null
  rationale: string
}

export function sellabilityForWatch(
  watch: Watch,
  wearLog: WearLogEntry[],
): SellabilityResult {
  const wears = wearLog
    .filter((e) => e.watchId === watch.id)
    .map((e) => e.date)
    .sort()

  const todayIso = format(new Date(), 'yyyy-MM-dd')
  const wearsTotal = wears.length
  const lastWornDate = wears.length > 0 ? wears[wears.length - 1] : null
  const firstWornDate = wears.length > 0 ? wears[0] : null

  const daysSinceWorn =
    lastWornDate ? differenceInDays(parseISO(todayIso), parseISO(lastWornDate)) : null

  const acqDate = watch.acquisitionDate ?? firstWornDate ?? null
  const daysOwned =
    acqDate ? Math.max(1, differenceInDays(parseISO(todayIso), parseISO(acqDate))) : null

  // Last-365-days wear count
  const cutoffMs = parseISO(todayIso).getTime() - 365 * 86_400_000
  const wearsLast365 = wears.filter((d) => parseISO(d).getTime() >= cutoffMs).length

  // ─ Component 1: dormancy ─────────────────────────────────────
  const dormancy =
    daysSinceWorn == null ? 1 : Math.min(daysSinceWorn / 730, 1)

  // ─ Component 2: drop-off (recent rate vs lifetime rate) ──────
  // Only meaningful once owned a year — otherwise lifetime rate is too noisy
  let dropoff = 0
  if (daysOwned != null && daysOwned > 365 && wearsTotal > 0) {
    const recentRate = wearsLast365 / 365
    const historicalRate = wearsTotal / daysOwned
    if (historicalRate > 0) {
      dropoff = Math.max(0, Math.min(1, 1 - recentRate / historicalRate))
    }
  }

  // ─ Component 3: one-off-ness ─────────────────────────────────
  let oneOff = 0
  if (wearsTotal === 0) {
    oneOff = 1
  } else if (wearsTotal === 1) {
    oneOff = 0.9
  } else if (
    wearsTotal <= 3 &&
    daysSinceWorn != null &&
    daysSinceWorn > 180
  ) {
    oneOff = 0.7
  } else if (
    daysOwned != null &&
    firstWornDate &&
    lastWornDate &&
    daysSinceWorn != null
  ) {
    const span = Math.max(
      1,
      differenceInDays(parseISO(lastWornDate), parseISO(firstWornDate)),
    )
    const spanRatio = span / daysOwned
    if (spanRatio < 0.3 && daysSinceWorn > 90) oneOff = 0.5
  }

  // ─ Component 4: under-use (low absolute count) ───────────────
  // 100+ wears anchors the "committed" end. The point isn't that 100 is
  // magic — it's that the curve flattens out before then so frequently-worn
  // watches don't all score "0".
  const underUse = wearsTotal === 0 ? 1 : Math.max(0, 1 - wearsTotal / 100)

  const score = Math.round(
    100 * (0.35 * dormancy + 0.25 * dropoff + 0.2 * oneOff + 0.2 * underUse),
  )

  // ─ Rationale: pick the largest contributor and translate to plain words ─
  const contributions: Array<{ key: string; weighted: number }> = [
    { key: 'dormancy', weighted: 0.35 * dormancy },
    { key: 'dropoff', weighted: 0.25 * dropoff },
    { key: 'oneOff', weighted: 0.2 * oneOff },
    { key: 'underUse', weighted: 0.2 * underUse },
  ]
  contributions.sort((a, b) => b.weighted - a.weighted)
  const top = contributions[0]

  let rationale = 'regularly worn'
  if (top.weighted > 0) {
    if (top.key === 'dormancy') {
      rationale =
        daysSinceWorn == null
          ? 'never worn'
          : `${daysSinceWorn} days since last wear`
    } else if (top.key === 'dropoff') {
      rationale = 'wear rate dropped vs historical'
    } else if (top.key === 'oneOff') {
      if (wearsTotal === 0) rationale = 'never worn'
      else if (wearsTotal === 1) rationale = 'worn just once'
      else if (wearsTotal <= 3) rationale = `only ${wearsTotal} wears, none recent`
      else rationale = 'wears clustered early, then abandoned'
    } else {
      rationale = `${wearsTotal} total wears`
    }
  }

  return {
    watchId: watch.id,
    score,
    wearsTotal,
    wearsLast365,
    daysSinceWorn,
    daysOwned,
    rationale,
  }
}

/** Convenience: owned watches ranked by sellability descending. */
export function sellabilityRanking(
  watches: Watch[],
  wearLog: WearLogEntry[],
): SellabilityResult[] {
  return watches
    .filter((w) => w.status === 'owned')
    .map((w) => sellabilityForWatch(w, wearLog))
    .sort((a, b) => b.score - a.score)
}

/** Format ISO date to "d MMM yyyy" or fall back to ISO. */
export function fmt(iso: string): string {
  try {
    return format(parseISO(iso), 'd MMM yyyy')
  } catch {
    return iso
  }
}
