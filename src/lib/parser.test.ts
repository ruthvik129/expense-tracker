import { describe, expect, it } from 'vitest'
import { parseEntry } from './parser'

const TODAY = '2026-10-23' // a Friday
const p = (s: string) => parseEntry(s, TODAY)

describe('parser: plan examples', () => {
  it('uber 450 upi yesterday', () =>
    expect(p('uber 450 upi yesterday')).toEqual({ amount: 450, paymentMode: 'UPI', date: '2026-10-22', description: 'Uber', notes: undefined }))
  it('swiggy 320 cc', () => {
    expect(p('swiggy 320 cc')).toMatchObject({ amount: 320, paymentMode: 'Credit Card', description: 'Swiggy' })
    expect(p('swiggy 320 cc').date).toBeUndefined() // the form keeps today
  })
  it('rent 18000 neft 1 oct', () => expect(p('rent 18000 neft 1 oct')).toMatchObject({ amount: 18000, paymentMode: 'Bank Transfer', date: '2026-10-01', description: 'Rent' }))
})

describe('parser: amounts', () => {
  const cases: [string, number][] = [
    ['coffee ₹180', 180],
    ['coffee ₹ 180', 180],
    ['coffee rs 180', 180],
    ['coffee rs.180', 180],
    ['coffee Rs. 180', 180],
    ['laptop 1,20,000', 120000],
    ['flight 1.5k', 1500],
    ['flight 12k', 12000],
    ['car 2 lakh', 200000],
    ['chai 15.50', 15.5],
    ['chai 15rs', 15],
    ['tip 50/-', 50],
    ['bill 99.999', 100],
  ]
  for (const [input, amount] of cases) it(input, () => expect(p(input).amount).toBe(amount))

  it('a day number before a month is never the amount', () =>
    expect(p('1 oct rent 18000')).toMatchObject({ amount: 18000, date: '2026-10-01', description: 'Rent' }))
  it('no number leaves the amount empty', () => expect(p('lunch upi').amount).toBeUndefined())
  it('a number glued to letters stays in the description', () => expect(p('7up 40')).toMatchObject({ amount: 40, description: '7up' }))
})

describe('parser: payment modes', () => {
  const cases: [string, string][] = [
    ['auto 60 gpay', 'UPI'], ['auto 60 phonepe', 'UPI'], ['auto 60 paytm', 'UPI'], ['auto 60 bhim', 'UPI'],
    ['auto 60 google pay', 'UPI'], ['shoes 2000 credit card', 'Credit Card'], ['shoes 2000 credit', 'Credit Card'],
    ['groceries 900 dc', 'Debit Card'], ['groceries 900 debit card', 'Debit Card'], ['milk 30 cash', 'Cash'],
    ['rent 18000 imps', 'Bank Transfer'], ['rent 18000 rtgs', 'Bank Transfer'], ['rent 18000 bank transfer', 'Bank Transfer'],
    ['SIP 5000 NEFT', 'Bank Transfer'],
  ]
  for (const [input, mode] of cases) it(input, () => expect(p(input).paymentMode).toBe(mode))
  it('no alias leaves the mode for the default chip', () => expect(p('lunch 200').paymentMode).toBeUndefined())
})

describe('parser: dates', () => {
  const cases: [string, string | undefined][] = [
    ['lunch 200', undefined],
    ['lunch 200 today', TODAY],
    ['lunch 200 yday', '2026-10-22'],
    ['lunch 200 day before yesterday', '2026-10-21'],
    ['lunch 200 3 days ago', '2026-10-20'],
    ['lunch 200 last friday', '2026-10-16'],
    ['lunch 200 last mon', '2026-10-19'],
    ['lunch 200 last sat', '2026-10-17'],
    ['lunch 200 monday', '2026-10-19'],
    ['lunch 200 friday', TODAY],
    ['lunch 200 5th oct', '2026-10-05'],
    ['lunch 200 oct 5', '2026-10-05'],
    ['lunch 200 05-oct', '2026-10-05'],
    ['lunch 200 5/10', '2026-10-05'],
    ['lunch 200 05/10/25', '2025-10-05'],
    ['lunch 200 5-10-2025', '2025-10-05'],
    ['lunch 200 1 jan 2025', '2025-01-01'],
  ]
  for (const [input, date] of cases) it(input, () => expect(p(input).date).toBe(date))

  it('never lands in the future without an explicit year', () => {
    expect(p('gift 500 25 dec').date).toBe('2025-12-25')
    expect(p('gift 500 25/12').date).toBe('2025-12-25')
  })
  it('an explicit future year is allowed', () => expect(p('trip 9000 2 jan 2027').date).toBe('2027-01-02'))
  it('an impossible date is left as text', () => {
    expect(p('lunch 200 31 feb').description).toBe('Lunch 31 Feb')
    expect(p('lunch 200 31 feb').date).toBeUndefined()
  })
})

describe('parser: description and notes', () => {
  it('title-cases what is left and drops dangling connectors', () =>
    expect(p('paid 450 for uber late night via upi')).toMatchObject({ description: 'Uber Late Night', paymentMode: 'UPI' }))
  it('keeps connectors in the middle', () => expect(p('dinner with team 1800').description).toBe('Dinner With Team'))
  it('keeps words the user capitalised', () => expect(p('IKEA lamp 1200').description).toBe('IKEA Lamp'))
  it('text after // becomes notes', () =>
    expect(p('uber 450 upi // NYE cab home')).toMatchObject({ description: 'Uber', notes: 'NYE cab home' }))
  it('handles empty and spaces-only input', () => {
    expect(p('')).toEqual({ description: '', notes: undefined })
    expect(p('   ')).toEqual({ description: '', notes: undefined })
  })
  it('only the first mode word is consumed', () => expect(p('cash withdrawal fee 20 upi')).toMatchObject({ paymentMode: 'Cash', description: 'Withdrawal Fee Upi' }))
})
