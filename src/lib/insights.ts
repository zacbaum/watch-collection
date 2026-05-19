import type { Watch, WatchCategory } from '../types'

// ─── Collector archetype ──────────────────────────────────────────────────

export interface Archetype {
  key: string
  name: string
  tagline: string
  values: string[]
  meaning: string
}

const INDIE_BRANDS = new Set([
  'fink',
  'phenix',
  'graham',
  'corum',
  'nomos',
  'sinn',
  'oris',
  'christopher ward',
  'farer',
  'baltic',
  'serica',
  'autodromo',
])

const HIGH_END = new Set([
  'rolex',
  'patek philippe',
  'audemars piguet',
  'vacheron constantin',
  'a. lange & söhne',
  'a. lange and söhne',
  'lange',
  'breguet',
  'jaeger-lecoultre',
  'jaeger lecoultre',
  'omega',
  'cartier',
  'iwc',
  'panerai',
  'breitling',
  'zenith',
  'tag heuer',
  'tudor',
])

export function detectArchetype(watches: Watch[]): Archetype | null {
  const owned = watches.filter((w) => w.status === 'owned')
  if (owned.length === 0) return null

  // ── Trait extraction ────────────────────────────────────────────────────
  const cats = new Map<WatchCategory, number>()
  for (const w of owned) {
    const c = inferCategory(w)
    if (c) cats.set(c, (cats.get(c) ?? 0) + 1)
  }
  const totalCat = Array.from(cats.values()).reduce((s, n) => s + n, 0)
  const catShare = (c: WatchCategory): number =>
    totalCat === 0 ? 0 : (cats.get(c) ?? 0) / owned.length

  const brandCounts = new Map<string, number>()
  for (const w of owned) brandCounts.set(w.brand, (brandCounts.get(w.brand) ?? 0) + 1)
  const sortedBrands = Array.from(brandCounts.entries()).sort((a, b) => b[1] - a[1])
  const topBrand = sortedBrands[0]
  const topBrandShare = topBrand ? topBrand[1] / owned.length : 0

  const vintageShare =
    owned.filter((w) => w.yearProduced != null && w.yearProduced < 2000).length /
    owned.length

  const indieShare =
    owned.filter((w) => INDIE_BRANDS.has(w.brand.toLowerCase())).length / owned.length

  const highEndShare =
    owned.filter((w) => HIGH_END.has(w.brand.toLowerCase())).length / owned.length

  const distinctBrands = brandCounts.size

  // ── Detection (first match wins; ordered by specificity) ────────────────

  // Loyalist — one brand dominates
  if (topBrandShare >= 0.5 && owned.length >= 3) {
    const b = topBrand![0]
    return {
      key: 'loyalist',
      name: `The ${b} Loyalist`,
      tagline: `${b} runs through your collection like a thread.`,
      values: [
        'Familiar mechanics and consistent design language',
        'Depth over variety — knowing a maker inside out',
        'Long-term commitment over chasing the new',
      ],
      meaning: `${Math.round(topBrandShare * 100)}% of what you own is ${b}. When you find a maker you trust, you don't keep looking — you go deeper.`,
    }
  }

  // Heritage Hunter — pre-2000 dominates
  if (vintageShare >= 0.4 && owned.length >= 3) {
    return {
      key: 'heritage',
      name: 'The Heritage Hunter',
      tagline: 'The watches you reach for have history.',
      values: [
        'Provenance and patina — the watch having lived a life before you',
        'Mechanical craft from eras when there was no other option',
        'Story over spec sheet',
      ],
      meaning: `${Math.round(vintageShare * 100)}% of what you own predates the year 2000. New releases don't move you the way a well-aged dial does.`,
    }
  }

  // Independent — heavy on indie / microbrand makers
  if (indieShare >= 0.4 && owned.length >= 3) {
    return {
      key: 'independent',
      name: 'The Independent',
      tagline: "You'd rather wear what someone made than what someone marketed.",
      values: [
        'Small ateliers and personal craft',
        'Watches with character rather than mass-market polish',
        'Supporting makers, not maisons',
      ],
      meaning: `Most of your collection comes from smaller, independent names rather than the household brands. You buy by feel, not formula.`,
    }
  }

  // Category specialists
  const dressShare = catShare('dress')
  const diverShare = catShare('diver')
  const chronoShare = catShare('chronograph') + catShare('racing')
  const pilotShare = catShare('pilot') + catShare('field')

  if (dressShare >= 0.4) {
    return {
      key: 'dress',
      name: 'The Dress Curator',
      tagline: 'Slim, restrained, understated.',
      values: [
        'Proportion and elegance over presence',
        'Watches that disappear under a cuff and resurface at the right moment',
        'Subtle signals over loud ones',
      ],
      meaning: `Dress watches make up most of what you own. You're signalling sophistication through restraint rather than size.`,
    }
  }
  if (diverShare >= 0.4) {
    return {
      key: 'diver',
      name: 'The Diver',
      tagline: 'Built to do something, not just sit on a wrist.',
      values: [
        'Robust construction and real water resistance',
        'Tool-watch heritage — pieces meant for purpose',
        'Functional design over decoration',
      ],
      meaning: `Divers dominate your collection. You don't dress your wrist; you equip it.`,
    }
  }
  if (chronoShare >= 0.4) {
    return {
      key: 'chrono',
      name: 'The Chronograph Chaser',
      tagline: 'Pushers, tachymeters, and racing DNA.',
      values: [
        'Watches that look like they\'re doing something',
        'Mechanical complication for its own sake',
        'Motorsport heritage and timing tradition',
      ],
      meaning: `Most of what you own measures time, not just tells it. You're drawn to function as decoration.`,
    }
  }
  if (pilotShare >= 0.35) {
    return {
      key: 'pilot',
      name: 'The Aviator',
      tagline: 'Sky-bound DNA, utility-first design.',
      values: [
        'Legibility and tool-watch utility',
        'Functional simplicity over ornamentation',
        'A touch of nostalgia for the early jet age',
      ],
      meaning: `Pilot and field watches anchor your rotation. You like watches that look like they have a job.`,
    }
  }

  // Tasteful Eclectic — multiple high-end brands AND broad category spread
  if (highEndShare >= 0.5 && distinctBrands >= 3) {
    return {
      key: 'tasteful-eclectic',
      name: 'The Tasteful Eclectic',
      tagline: 'Different categories, consistent quality.',
      values: [
        'Established makers across multiple genres',
        'Quality of execution over breadth of category',
        'Buying by feel rather than filling slots',
      ],
      meaning: `You own pieces from several heritage maisons (${sortedBrands
        .slice(0, 3)
        .map(([b]) => b)
        .join(', ')}), but no single one dominates. You're not collecting to fill categories — you're picking what resonates.`,
    }
  }

  // Default — Generalist
  return {
    key: 'generalist',
    name: 'The Generalist',
    tagline: 'Variety over identity.',
    values: [
      'The right watch for the right moment',
      'Breadth of experience over depth in one direction',
      'Curiosity across genres, brands, and eras',
    ],
    meaning: `Your collection covers ${cats.size} categor${cats.size === 1 ? 'y' : 'ies'} across ${distinctBrands} brand${distinctBrands === 1 ? '' : 's'} with no single dominant style. You'd rather have a tool for every context than be known for one look.`,
  }
}

// ─── Existing insights (gaps + brand concentration) ──────────────────────

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
