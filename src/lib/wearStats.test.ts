import { describe, expect, it } from 'vitest'
import type { Watch, WearLogEntry } from '../types'
import {
  monthKeysInRange,
  perWatchStreaks,
  rotationScore,
  sellabilityForWatch,
  sellabilityRanking,
  weekKeyOf,
} from './wearStats'

// ─── Fixtures ────────────────────────────────────────────────────────────────

let seq = 0
function watch(overrides: Partial<Watch> = {}): Watch {
  seq++
  return {
    id: overrides.id ?? `w_${seq}`,
    brand: 'Brand',
    model: `Model ${seq}`,
    status: 'owned',
    createdAt: '2020-01-01T00:00:00.000Z',
    updatedAt: '2020-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function wearsFor(watchId: string, dates: string[]): WearLogEntry[] {
  return dates.map((date, i) => ({
    id: `e_${watchId}_${i}`,
    watchId,
    date,
    createdAt: '2020-01-01T00:00:00.000Z',
  }))
}

/** Consecutive daily ISO dates ending at `end` (inclusive), `n` days long. */
function dailyRange(end: string, n: number): string[] {
  const out: string[] = []
  const endDate = new Date(`${end}T00:00:00Z`)
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(endDate.getTime() - i * 86_400_000)
    out.push(d.toISOString().slice(0, 10))
  }
  return out
}

// ─── Date helpers ────────────────────────────────────────────────────────────

describe('date helpers', () => {
  it('monthKeysInRange spans months inclusively', () => {
    expect(monthKeysInRange('2025-11-15', '2026-02-01')).toEqual([
      '2025-11',
      '2025-12',
      '2026-01',
      '2026-02',
    ])
  })

  it('weekKeyOf returns the Monday of the ISO week', () => {
    expect(weekKeyOf('2026-01-01')).toBe('2025-12-29') // Thu → prior Mon
    expect(weekKeyOf('2025-12-29')).toBe('2025-12-29') // Mon → itself
  })
})

// ─── Rotation score ──────────────────────────────────────────────────────────

describe('rotationScore', () => {
  it('is null with no wears', () => {
    expect(rotationScore([]).score).toBeNull()
  })

  it('is null with a single watch (entropy undefined)', () => {
    const log = wearsFor('a', ['2026-01-01', '2026-01-02'])
    expect(rotationScore(log).score).toBeNull()
  })

  it('is 100 for a perfectly even rotation', () => {
    const log = [
      ...wearsFor('a', ['2026-01-01', '2026-01-03']),
      ...wearsFor('b', ['2026-01-02', '2026-01-04']),
    ]
    const r = rotationScore(log)
    expect(r.score).toBe(100)
    expect(r.effective).toBeCloseTo(2, 5)
  })
})

// ─── Streaks ─────────────────────────────────────────────────────────────────

describe('perWatchStreaks', () => {
  it('finds the longest consecutive run and longest gap', () => {
    const w = watch({ id: 'a' })
    const log = wearsFor('a', [
      '2026-01-01',
      '2026-01-02',
      '2026-01-03', // 3-day streak
      '2026-01-10', // 7-day gap
      '2026-01-11',
    ])
    const [s] = perWatchStreaks([w], log)
    expect(s.longestStreak).toBe(3)
    expect(s.longestStreakRange).toEqual({ from: '2026-01-01', to: '2026-01-03' })
    expect(s.longestGap).toBe(7)
    expect(s.totalWears).toBe(5)
  })
})

// ─── Sellability ─────────────────────────────────────────────────────────────

const AS_OF = '2026-06-01'

describe('sellabilityForWatch', () => {
  it('scores a never-worn watch owned 90+ days at 100', () => {
    const target = watch({ id: 'never', acquisitionDate: '2025-06-01' })
    const other = watch({ id: 'daily', acquisitionDate: '2025-06-01' })
    const log = wearsFor('daily', dailyRange(AS_OF, 100))
    const r = sellabilityForWatch(target, [target, other], log, AS_OF)
    expect(r.score).toBe(100)
    expect(r.components.dormancy).toBe(1)
    expect(r.components.dropoff).toBe(1)
    expect(r.components.fairShare).toBe(1)
  })

  it('scores a daily driver near zero', () => {
    const target = watch({ id: 'daily', acquisitionDate: '2025-01-01' })
    const other = watch({ id: 'shelf', acquisitionDate: '2025-01-01' })
    const log = wearsFor('daily', dailyRange(AS_OF, 400))
    const r = sellabilityForWatch(target, [target, other], log, AS_OF)
    expect(r.components.dormancy).toBe(0)
    expect(r.components.dropoff).toBe(0)
    expect(r.components.fairShare).toBe(0) // above fair share, clamped to 0
    expect(r.score).toBe(0)
  })

  it('follows the sqrt(d/90) dormancy curve', () => {
    const target = watch({ id: 'a', acquisitionDate: '2024-01-01' })
    // Last worn 30 days before asOf (2026-05-02); heavy history before that.
    const dates = dailyRange('2026-05-02', 200)
    const r = sellabilityForWatch(target, [target], wearsFor('a', dates), AS_OF)
    expect(r.daysSinceWorn).toBe(30)
    expect(r.components.dormancy).toBeCloseTo(Math.sqrt(30 / 90), 5)
  })

  it('excludes wears after the asOf snapshot (sold-watch semantics)', () => {
    const target = watch({ id: 'a', acquisitionDate: '2025-01-01' })
    const log = wearsFor('a', ['2026-01-10', '2026-03-01', '2026-09-09'])
    const r = sellabilityForWatch(target, [target], log, '2026-03-15')
    expect(r.wearsTotal).toBe(2) // the 2026-09-09 wear is after asOf
    expect(r.daysSinceWorn).toBe(14) // from 2026-03-01 to 2026-03-15
  })

  it('fair-share divisor counts a mid-window-sold watch', () => {
    // All wears within the last 90 days so every window (90/180/365) sees the
    // same composition: target 10, other 20, mid-window-sold 30 → total 60,
    // N=3, expected 20/watch → target under-share = 1 - 10/20 = 0.5.
    const target = watch({ id: 't', acquisitionDate: '2025-01-01' })
    const other = watch({ id: 'o', acquisitionDate: '2025-01-01' })
    const soldMid = watch({
      id: 's',
      status: 'sold',
      acquisitionDate: '2025-01-01',
      saleDate: '2026-05-20', // inside all three windows ending at AS_OF
    })
    const log = [
      ...wearsFor('t', dailyRange('2026-05-31', 10)),
      ...wearsFor('o', dailyRange('2026-05-19', 20)),
      ...wearsFor('s', dailyRange('2026-05-19', 30)),
    ]
    const r = sellabilityForWatch(target, [target, other, soldMid], log, AS_OF)
    expect(r.components.fairShare).toBeCloseTo(0.5, 5)
  })

  it('fair-share is gated for watches owned under 60 days', () => {
    const target = watch({ id: 'new', acquisitionDate: '2026-05-15' }) // 17 days
    const other = watch({ id: 'o', acquisitionDate: '2025-01-01' })
    const log = wearsFor('o', dailyRange(AS_OF, 50))
    const r = sellabilityForWatch(target, [target, other], log, AS_OF)
    expect(r.components.fairShare).toBe(0)
    expect(r.components.dropoff).toBe(0) // also gated (owned ≤ 90d)
  })
})

describe('sellabilityRanking', () => {
  it('snapshots sold watches at their sale date when included', () => {
    const owned = watch({ id: 'own', acquisitionDate: '2025-01-01' })
    const sold = watch({
      id: 'sold',
      status: 'sold',
      acquisitionDate: '2025-01-01',
      saleDate: '2025-12-01',
    })
    const log = [
      ...wearsFor('own', dailyRange(AS_OF, 30)),
      ...wearsFor('sold', dailyRange('2025-11-30', 30)),
    ]
    const without = sellabilityRanking([owned, sold], log)
    expect(without.map((r) => r.watchId)).toEqual(['own'])

    const withSold = sellabilityRanking([owned, sold], log, { includeSold: true })
    const soldRow = withSold.find((r) => r.watchId === 'sold')!
    expect(soldRow.atSaleDate).toBe(true)
    expect(soldRow.asOf).toBe('2025-12-01')
    // Worn daily right up to sale → dormant snapshot should be very low.
    expect(soldRow.daysSinceWorn).toBe(1)
  })
})
