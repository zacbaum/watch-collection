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
// signals are pure wear-pattern derived (we don't peek at price). The metric
// weights RECENT behaviour over historical and adds a peer-comparison signal
// (fair share) so a watch that's structurally under-represented in rotation
// is flagged even when its absolute usage looks fine.
//
// Three components, weighted:
//
//   • Dormancy    (40%) — days since last worn, sqrt(d/90). Saturates at
//                         3 months idle. Never-worn = 1.0
//   • Drop-off    (30%) — recent (last 365d) wear rate vs lifetime rate;
//                         fires once owned > 90 days. Never-worn after that
//                         threshold = 1.0
//   • Fair share  (30%) — share of wears vs a fair 1/N split across the
//                         watches owned in each of 90d, 180d, 365d windows,
//                         averaged. Gated on 60+ days owned. Catches the
//                         "looked busy on 1y but actually inactive" pattern
//                         and the "consistently under-rotated" pattern.
//
// Each component is clamped to [0, 1]; the score is the weighted sum × 100.
// The rationale field surfaces the single biggest contributor in plain English.

export interface SellabilityComponents {
  /** 0-1 dormancy contribution */
  dormancy: number
  /** 0-1 wear-rate drop-off contribution */
  dropoff: number
  /** 0-1 fair-share-under contribution (avg over 90/180/365d windows) */
  fairShare: number
  /** Component weights as used to compute the final score (sum = 1) */
  weights: { dormancy: number; dropoff: number; fairShare: number }
  /** Per-component short explanations matching the row's actual data */
  reasons: { dormancy: string; dropoff: string; fairShare: string }
}

export interface SellabilityResult {
  watchId: string
  score: number
  wearsTotal: number
  wearsLast365: number
  daysSinceWorn: number | null
  daysOwned: number | null
  /** ISO yyyy-MM-dd the score was computed against — sale date for sold
   *  watches (so the snapshot reflects "would this have been a good time to
   *  sell?"), today's date for owned. */
  asOf: string
  /** True if asOf is the watch's saleDate rather than today. */
  atSaleDate: boolean
  rationale: string
  components: SellabilityComponents
}

/** Fair-share under-percentage in a single window ending at asOfIso. Returns
 *  0..1; higher = the target watch got less than its 1/N share of wear-days
 *  among the watches that were in rotation during the window.
 *
 *  "In rotation during the window" = any watch that was owned at any point
 *  in [windowStart, asOfIso]. This means a watch sold yesterday still counts
 *  toward last-year's fair-share divisor (correct: last year there genuinely
 *  WAS one more watch in rotation), and a sold watch's own at-sale snapshot
 *  includes itself in the divisor (correct: at the moment of sale, it was
 *  still part of the rotation it's being measured against).
 *
 *  Simplification: the divisor treats every in-rotation watch equally,
 *  regardless of how many days it was actually owned during the window. For
 *  a watch owned the full window this is exact. For a watch owned only part
 *  of the window (e.g. a recently-sold or recently-acquired watch over a
 *  365d snapshot) the calc over-states its under-share, because totalWears
 *  is divided across N watches as if each had the full window to accumulate.
 *  The avg over 90/180/365 partially absorbs this since shorter windows are
 *  mostly covered by ownership for any non-trivially-owned watch. */
function fairShareUnderWindow(
  target: Watch,
  watches: Watch[],
  wearLog: WearLogEntry[],
  asOfIso: string,
  windowDays: number,
): number {
  const windowStartMs = parseISO(asOfIso).getTime() - windowDays * 86_400_000
  const windowStartIso = format(new Date(windowStartMs), 'yyyy-MM-dd')

  const inRotation = watches.filter((w) => {
    if (w.id === target.id) return true // target always counts in its own snapshot
    const acq = w.acquisitionDate
    if (!acq || acq > asOfIso) return false // not yet acquired by window end
    // Sold/gifted before the window even started → not in rotation during it.
    if (w.status === 'sold' && w.saleDate && w.saleDate < windowStartIso) return false
    if (w.status === 'gifted' && w.giftedDate && w.giftedDate < windowStartIso)
      return false
    return true
  })
  if (inRotation.length < 2) return 0

  const rotationIds = new Set(inRotation.map((w) => w.id))
  const inWindow = wearLog.filter(
    (e) =>
      rotationIds.has(e.watchId) &&
      e.date <= asOfIso &&
      parseISO(e.date).getTime() >= windowStartMs,
  )
  const totalWears = inWindow.length
  if (totalWears === 0) return 0
  const targetWears = inWindow.filter((e) => e.watchId === target.id).length
  const expected = totalWears / inRotation.length
  if (expected === 0) return 0
  return Math.max(0, Math.min(1, 1 - targetWears / expected))
}

export function sellabilityForWatch(
  watch: Watch,
  watches: Watch[],
  wearLog: WearLogEntry[],
  asOfIso?: string,
): SellabilityResult {
  const todayIso = asOfIso ?? format(new Date(), 'yyyy-MM-dd')

  // Drop any wears after the as-of date so a sold watch's pre-sale snapshot
  // doesn't include any post-sale entries.
  const wears = wearLog
    .filter((e) => e.watchId === watch.id && e.date <= todayIso)
    .map((e) => e.date)
    .sort()

  const wearsTotal = wears.length
  const lastWornDate = wears.length > 0 ? wears[wears.length - 1] : null
  const firstWornDate = wears.length > 0 ? wears[0] : null

  const daysSinceWorn =
    lastWornDate ? differenceInDays(parseISO(todayIso), parseISO(lastWornDate)) : null

  const acqDate = watch.acquisitionDate ?? firstWornDate ?? null
  const daysOwned =
    acqDate ? Math.max(1, differenceInDays(parseISO(todayIso), parseISO(acqDate))) : null

  // Last-365-days wear count (relative to as-of, not today)
  const cutoffMs = parseISO(todayIso).getTime() - 365 * 86_400_000
  const wearsLast365 = wears.filter((d) => parseISO(d).getTime() >= cutoffMs).length

  // ─ Component 1: dormancy ─────────────────────────────────────
  // sqrt(d/90) — saturates at 3 months idle:
  //   30d → 0.58    60d → 0.82    90d → 1.00
  // Never-worn = 1.0.
  const dormancy =
    daysSinceWorn == null ? 1 : Math.min(Math.sqrt(daysSinceWorn / 90), 1)

  // ─ Component 2: drop-off (recent rate vs lifetime rate) ──────
  // Gated on 90+ days owned. Never-worn = max signal (1.0).
  let dropoff = 0
  if (daysOwned != null && daysOwned > 90) {
    if (wearsTotal === 0) {
      dropoff = 1
    } else {
      const recentWindow = Math.min(daysOwned, 365)
      const recentRate = wearsLast365 / recentWindow
      const historicalRate = wearsTotal / daysOwned
      if (historicalRate > 0) {
        dropoff = Math.max(0, Math.min(1, 1 - recentRate / historicalRate))
      }
    }
  }

  // ─ Component 3: fair-share peer comparison ───────────────────
  // Averaged across 90d / 180d / 365d windows so a single busy month can't
  // mask consistent under-rotation. Gated on 60+ days owned so a brand-new
  // acquisition isn't penalised for not having found its rotation slot yet.
  let fairShare = 0
  if (daysOwned != null && daysOwned >= 60) {
    const fs90 = fairShareUnderWindow(watch, watches, wearLog, todayIso, 90)
    const fs180 = fairShareUnderWindow(watch, watches, wearLog, todayIso, 180)
    const fs365 = fairShareUnderWindow(watch, watches, wearLog, todayIso, 365)
    fairShare = (fs90 + fs180 + fs365) / 3
  }

  const weights = { dormancy: 0.4, dropoff: 0.3, fairShare: 0.3 }
  const score = Math.round(
    100 *
      (weights.dormancy * dormancy +
        weights.dropoff * dropoff +
        weights.fairShare * fairShare),
  )

  // ─ Per-component reason text (used by the hover tooltip) ───────
  const reasons = {
    dormancy:
      daysSinceWorn == null
        ? 'never worn'
        : `${daysSinceWorn} days since last wear`,
    dropoff: (() => {
      if (wearsTotal === 0 && daysOwned != null && daysOwned > 90)
        return 'never engaged after 90+ days owned'
      if (daysOwned != null && daysOwned <= 90)
        return 'owned too briefly to judge drop-off'
      if (dropoff === 0) return 'recent wear rate matches or exceeds lifetime'
      const pct = Math.round(dropoff * 100)
      return `recent wear rate is ${pct}% below lifetime`
    })(),
    fairShare: (() => {
      if (daysOwned != null && daysOwned < 60)
        return 'owned too briefly to judge rotation share'
      if (fairShare === 0) return 'at or above fair 1/N share of rotation'
      const pct = Math.round(fairShare * 100)
      return `${pct}% under fair 1/N share across 90/180/365d`
    })(),
  }

  // ─ Top-level rationale: largest weighted contributor ───────────
  const contributions: Array<{ key: keyof typeof weights; weighted: number }> = [
    { key: 'dormancy', weighted: weights.dormancy * dormancy },
    { key: 'dropoff', weighted: weights.dropoff * dropoff },
    { key: 'fairShare', weighted: weights.fairShare * fairShare },
  ]
  contributions.sort((a, b) => b.weighted - a.weighted)
  const top = contributions[0]
  const rationale = top.weighted > 0 ? reasons[top.key] : 'regularly worn'

  return {
    watchId: watch.id,
    score,
    wearsTotal,
    wearsLast365,
    daysSinceWorn,
    daysOwned,
    asOf: todayIso,
    atSaleDate: asOfIso != null,
    rationale,
    components: { dormancy, dropoff, fairShare, weights, reasons },
  }
}

/** Sellability score for the watch sampled weekly going backwards from
 *  endAsOf (defaults to today) for `weeks` snapshots. Each snapshot uses
 *  that week's date as its own asOf, so it answers "what would the score
 *  have been if I'd run the calc that day?" — t-0 for that point. */
export function sellabilityHistory(
  watch: Watch,
  watches: Watch[],
  wearLog: WearLogEntry[],
  weeks: number,
  endAsOf?: string,
): Array<{ asOf: string; score: number }> {
  const endIso = endAsOf ?? format(new Date(), 'yyyy-MM-dd')
  const endMs = parseISO(endIso).getTime()
  const out: Array<{ asOf: string; score: number }> = []
  for (let i = weeks - 1; i >= 0; i--) {
    const ms = endMs - i * 7 * 86_400_000
    const iso = format(new Date(ms), 'yyyy-MM-dd')
    const r = sellabilityForWatch(watch, watches, wearLog, iso)
    out.push({ asOf: iso, score: r.score })
  }
  return out
}

/** Owned watches ranked by sellability descending. Pass includeSold to also
 *  include sold watches — their scores are computed as of the sale date so
 *  the snapshot answers "was this a good time to sell?" rather than "would
 *  it be a good time to sell today?". */
export function sellabilityRanking(
  watches: Watch[],
  wearLog: WearLogEntry[],
  options: { includeSold?: boolean } = {},
): SellabilityResult[] {
  const candidates = options.includeSold
    ? watches.filter((w) => w.status === 'owned' || w.status === 'sold')
    : watches.filter((w) => w.status === 'owned')
  return candidates
    .map((w) => {
      const asOf = w.status === 'sold' && w.saleDate ? w.saleDate : undefined
      return sellabilityForWatch(w, watches, wearLog, asOf)
    })
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
