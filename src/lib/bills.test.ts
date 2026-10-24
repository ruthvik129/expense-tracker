import { describe, expect, it } from 'vitest'
import { billEntryId, billStatus, dueCount, dueDate, entryFor, pruneChecks, type Bill } from './bills'

const rent: Bill = { id: 'r', name: 'Rent', amount: 12000, category: 'Life Infrastructure', paymentMode: 'Bank Transfer', dueDay: 1, active: true }
const elec: Bill = { ...rent, id: 'e', name: 'Electricity', amount: 1400, paymentMode: 'UPI', dueDay: 31 }
const netflix: Bill = { ...rent, id: 'n', name: 'Netflix', amount: 199, dueDay: null }
const TODAY = '2026-11-10'
const logged = (b: Bill, ym: string) => ({ id: billEntryId(b.id, ym), date: `${ym}-02`, amount: b.amount })

describe('bills', () => {
  it('clamps day 31 to the end of shorter months', () => {
    expect(dueDate(elec, '2026-11')).toBe('2026-11-30')
    expect(dueDate(elec, '2026-02')).toBe('2026-02-28')
    expect(dueDate(netflix, '2026-11')).toBeNull()
  })

  it('tells logged, ticked, overdue, upcoming and open apart', () => {
    const ym = '2026-11'
    expect(billStatus(rent, ym, TODAY, [logged(rent, ym)], {})).toBe('logged')
    expect(billStatus(rent, ym, TODAY, [], { [ym]: { r: { date: TODAY, amount: 12000 } } })).toBe('ticked')
    expect(billStatus(rent, ym, TODAY, [], {})).toBe('overdue')
    expect(billStatus(elec, ym, TODAY, [], {})).toBe('upcoming')
    expect(billStatus(netflix, ym, TODAY, [], {})).toBe('open')
    expect(billStatus(netflix, '2026-10', TODAY, [], {})).toBe('overdue') // a past month never paid
  })

  it('logged in a different month does not count for this one', () => {
    expect(billStatus(rent, '2026-11', TODAY, [logged(rent, '2026-10')], {})).toBe('overdue')
  })

  it('builds the daily entry with the ticked amount and date', () => {
    expect(entryFor(elec, '2026-11', { date: '2026-11-09', amount: 1630 })).toEqual({
      id: 'bill-e-2026-11', date: '2026-11-09', description: 'Electricity', category: 'Life Infrastructure',
      amount: 1630, paymentMode: 'UPI', notes: 'Recurring payment',
    })
  })

  it('keeps a late tick for a past month inside that month', () => {
    expect(entryFor(rent, '2026-10', { date: TODAY, amount: 12000 }).date).toBe('2026-10-01')
    expect(entryFor(netflix, '2026-10', { date: TODAY, amount: 199 }).date).toBe('2026-10-31')
  })

  it('badge counts active bills already due and not logged', () => {
    const paused = { ...rent, id: 'p', active: false }
    expect(dueCount([rent, elec, netflix, paused], TODAY, [])).toBe(1) // only rent: elec due 30th, netflix has no due day
    expect(dueCount([rent], TODAY, [logged(rent, '2026-11')])).toBe(0)
  })

  it('prunes ticks older than last month', () => {
    const c = { '2026-08': {}, '2026-10': {}, '2026-11': {} }
    expect(Object.keys(pruneChecks(c, TODAY))).toEqual(['2026-10', '2026-11'])
  })
})
