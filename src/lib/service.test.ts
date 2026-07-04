import { describe, expect, it } from 'vitest'
import type { ServiceLogEntry, Watch } from '../types'
import { serviceDue } from './service'

function watch(overrides: Partial<Watch> = {}): Watch {
  return {
    id: 'w1',
    brand: 'Brand',
    model: 'Model',
    status: 'owned',
    createdAt: '2020-01-01T00:00:00.000Z',
    updatedAt: '2020-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function entry(overrides: Partial<ServiceLogEntry> = {}): ServiceLogEntry {
  return {
    id: 's1',
    watchId: 'w1',
    date: '2024-01-15',
    type: 'full-service',
    ...overrides,
  }
}

describe('serviceDue', () => {
  it('returns nulls with no service history (never guesses)', () => {
    const d = serviceDue(watch({ serviceIntervalMonths: 60 }), [])
    expect(d.lastFullService).toBeNull()
    expect(d.dueDate).toBeNull()
    expect(d.daysUntil).toBeNull()
  })

  it('derives due date from latest full service + interval', () => {
    const d = serviceDue(watch({ serviceIntervalMonths: 60 }), [
      entry({ date: '2020-03-10' }),
      entry({ id: 's2', date: '2024-01-15' }), // latest wins
    ])
    expect(d.lastFullService).toBe('2024-01-15')
    expect(d.dueDate).toBe('2029-01-15')
  })

  it('explicit nextDueDate on the latest full service wins over the interval', () => {
    const d = serviceDue(watch({ serviceIntervalMonths: 60 }), [
      entry({ date: '2024-01-15', nextDueDate: '2027-06-01' }),
    ])
    expect(d.dueDate).toBe('2027-06-01')
  })

  it('ignores non-full-service entries for due computation', () => {
    const d = serviceDue(watch({ serviceIntervalMonths: 60 }), [
      entry({ type: 'battery', date: '2025-05-01' }),
    ])
    expect(d.lastFullService).toBeNull()
    expect(d.dueDate).toBeNull()
  })

  it('no due date when the interval is unset and no explicit nextDueDate', () => {
    const d = serviceDue(watch(), [entry({ date: '2024-01-15' })])
    expect(d.lastFullService).toBe('2024-01-15')
    expect(d.dueDate).toBeNull()
  })

  it('anchors the first service on manufactureDate when no service recorded', () => {
    const d = serviceDue(
      watch({ manufactureDate: '2023-04-10', serviceIntervalMonths: 60 }),
      [],
    )
    expect(d.dueDate).toBe('2028-04-10')
    expect(d.basis).toBe('manufacture')
  })

  it('a recorded full service beats the manufacture anchor', () => {
    const d = serviceDue(
      watch({ manufactureDate: '2018-01-01', serviceIntervalMonths: 60 }),
      [entry({ date: '2024-01-15' })],
    )
    expect(d.dueDate).toBe('2029-01-15')
    expect(d.basis).toBe('service')
  })

  it('manufactureDate alone (no interval) derives nothing', () => {
    const d = serviceDue(watch({ manufactureDate: '2023-04-10' }), [])
    expect(d.dueDate).toBeNull()
    expect(d.basis).toBeNull()
  })
})
