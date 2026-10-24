import { describe, expect, it } from 'vitest'
import { heatBuckets, limitState, monthSummary, weekSummary } from './aggregate'
import type { Expense } from './types'

const e = (date: string, amount: number, type: Expense['type'], category = 'c', mode = 'UPI'): Expense => ({
  id: `${date}-${amount}-${type}`, date, amount, type, category, paymentMode: mode, description: 'x', notes: '',
})
const rows = [
  e('2026-01-05', 100.1, 'Need'),
  e('2026-01-06', 200.2, 'Want'),
  e('2026-01-07', 5000, 'Saving'),
  e('2026-01-12', 999, 'Need'), // next week
]

describe('aggregations', () => {
  it('weekly limit excludes Savings by default and avoids float drift', () => {
    const w = weekSummary(rows, '2026-01-05', { limit: 10000, countSavings: false })
    expect(w.spent).toBe(300.3)
    expect(w.total).toBe(5300.3)
    expect(weekSummary(rows, '2026-01-05', { limit: 10000, countSavings: true }).spent).toBe(5300.3)
  })
  it('limit state turns amber at 80% and red when exceeded', () => {
    expect(limitState(7999, 10000)).toBe('ok')
    expect(limitState(8000, 10000)).toBe('warn')
    expect(limitState(10000, 10000)).toBe('warn')
    expect(limitState(10001, 10000)).toBe('over')
  })
  it('monthly buckets use the entry Type against the year budget', () => {
    const m = monthSummary(rows, '2026-01', '2026-01-01', '2026-01-31', [
      { year: 2026, salary: 100000, needs: 50000, wants: 30000, savings: 20000 },
    ])
    expect(m.buckets.map((b) => [b.label, b.spent, b.budget])).toEqual([
      ['Needs', 1099.1, 50000], ['Wants', 200.2, 30000], ['Savings', 5000, 20000],
    ])
    expect(m.daily).toHaveLength(31)
  })
  it('heat buckets split non-zero days into quartiles', () => {
    const b = heatBuckets([0, 10, 20, 30, 40, 50, 60, 70, 80])
    expect(b(0)).toBe(0)
    expect(b(10)).toBe(1)
    expect(b(80)).toBe(4)
  })
})
