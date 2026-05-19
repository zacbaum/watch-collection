import type { Watch, WatchCategory } from '../types'

// ─── Insights (gaps + brand concentration) ───────────────────────────────

export interface Gap {
  title: string
  detail: string
  category?: WatchCategory
}

interface Insights {
  gaps: Gap[]
  brandConcentration: Array<{ brand: string; share: number; count: number }>
}

/** Infer a category from text features if not explicitly set. */
function inferCategory(w: Watch): WatchCategory | undefined {
  if (w.category) return w.category
  const blob = `${w.model} ${w.complications?.join(' ') ?? ''} ${w.notes ?? ''}`.toLowerCase()
  if (/diver|sea\s?master|submariner|aquanaut|seamaster/.test(blob)) return 'diver'
  if (/chrono|speedmaster|silverstone|admiral/.test(blob)) return 'chronograph'
  if (/gmt|world\s?time|dual\s?time/.test(blob)) return 'gmt'
  if (/pilot|flieger|aviator|stirling/.test(blob)) return 'pilot'
  if (/tank|santos|reverso|altiplano|ultra\s?thin|constellation/.test(blob)) return 'dress'
  if (/field|khaki|expedition/.test(blob)) return 'field'
  if (/racing|silverstone/.test(blob)) return 'racing'
  if (/apple|smart|fitbit|garmin/.test(blob)) return 'smart'
  if (/g[-\s]?shock|casio/.test(blob)) return 'casual'
  return undefined
}

const COVERAGE_CATEGORIES: WatchCategory[] = [
  'dress',
  'sport',
  'diver',
  'chronograph',
  'gmt',
  'pilot',
  'field',
]

export function computeInsights(watches: Watch[]): Insights {
  const owned = watches.filter((w) => w.status === 'owned')
  const cats = new Set<WatchCategory>()
  for (const w of owned) {
    const c = inferCategory(w)
    if (c) cats.add(c)
  }

  const gaps: Gap[] = []
  for (const c of COVERAGE_CATEGORIES) {
    if (!cats.has(c)) {
      gaps.push({
        title: `No ${c} watch in the collection`,
        detail: `Consider adding a ${c} piece to round out the rotation.`,
        category: c,
      })
    }
  }

  // Brand concentration
  const brandCounts = new Map<string, number>()
  for (const w of owned) brandCounts.set(w.brand, (brandCounts.get(w.brand) ?? 0) + 1)
  const total = owned.length || 1
  const brandConcentration = Array.from(brandCounts.entries())
    .map(([brand, count]) => ({ brand, count, share: count / total }))
    .sort((a, b) => b.share - a.share)

  const top = brandConcentration[0]
  if (top && top.share >= 0.4 && owned.length >= 3) {
    gaps.push({
      title: `${top.brand} is ${Math.round(top.share * 100)}% of the collection`,
      detail: `That's a high concentration. A different brand could add variety.`,
    })
  }

  // Movement coverage
  const movements = new Set(owned.map((w) => w.movement).filter(Boolean))
  if (movements.size > 0 && owned.length >= 3) {
    if (!movements.has('manual') && !movements.has('quartz')) {
      gaps.push({
        title: 'All automatic — no manual or quartz',
        detail: 'A hand-wound dress watch or a quartz beater can complement an all-auto collection.',
      })
    }
  }

  return { gaps, brandConcentration }
}
