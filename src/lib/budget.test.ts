import { describe, expect, it } from 'vitest'
import { budgetsFor, DEFAULT_SPLIT, splitError } from './budget'
import { dueRecurring, recurringId, type RecurringSaving } from './recurring'
import type { Category } from './types'

const sheet = [{ year: 2026, salary: 1, needs: 1, wants: 1, savings: 1 }]

describe('budget from settings', () => {
  it('uses the sheet when no salary is set', () => {
    expect(budgetsFor(0, DEFAULT_SPLIT, sheet, 2026)).toBe(sheet)
  })
  it('splits the salary 50:30:20 by default', () => {
    expect(budgetsFor(120000, DEFAULT_SPLIT, sheet, 2026)[0]).toEqual({ year: 2026, salary: 120000, needs: 60000, wants: 36000, savings: 24000 })
  })
  it('accepts a custom split that adds to 100', () => {
    expect(budgetsFor(100000, { needs: 40, wants: 25, savings: 35 }, sheet, 2027)[0].savings).toBe(35000)
    expect(splitError({ needs: 40, wants: 25, savings: 35 })).toBeNull()
    expect(splitError({ needs: 50, wants: 30, savings: 30 })).toMatch(/110%/)
    expect(splitError({ needs: -5, wants: 75, savings: 30 })).toMatch(/0 or more/)
  })
})

const cats: Category[] = [
  { name: 'Life Infrastructure', type: 'Need' },
  { name: 'Future Me', type: 'Saving' },
]
const cfg: RecurringSaving = { enabled: true, amount: 10000, description: 'SIP', category: '', paymentMode: 'Bank Transfer', day: 5 }

describe('recurring saving', () => {
  it('creates one entry once the day arrives, dated on that day', () => {
    expect(dueRecurring(cfg, '2026-10-04', [], [], cats)).toBeNull()
    const due = dueRecurring(cfg, '2026-10-05', [], [], cats)
    expect(due?.entry).toMatchObject({ id: 'recurring-saving-2026-10', date: '2026-10-05', category: 'Future Me', amount: 10000 })
  })
  it('does not re-create a month already handled (e.g. the user deleted it)', () => {
    expect(dueRecurring(cfg, '2026-10-20', ['2026-10'], [], cats)).toBeNull()
  })
  it('only marks the month when the entry already exists from another device', () => {
    expect(dueRecurring(cfg, '2026-10-20', [], [{ id: recurringId('2026-10') }], cats)).toEqual({ month: '2026-10' })
  })
  it('does nothing when off or amount is zero', () => {
    expect(dueRecurring({ ...cfg, enabled: false }, '2026-10-20', [], [], cats)).toBeNull()
    expect(dueRecurring({ ...cfg, amount: 0 }, '2026-10-20', [], [], cats)).toBeNull()
  })
})
