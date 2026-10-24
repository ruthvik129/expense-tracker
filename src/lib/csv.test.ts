import { expect, it } from 'vitest'
import { toCsv } from './csv'

it('escapes quotes, commas and spreadsheet formulas', () => {
  const out = toCsv([{ id: '1', date: '2026-01-02', description: '=SUM(A1)', category: 'a,b', amount: 5, paymentMode: 'UPI', type: 'Need', notes: 'say "hi"' }])
  expect(out.split('\n')[1]).toBe(`2026-01-02,'=SUM(A1),"a,b",5,UPI,Need,"say ""hi"""`)
})
