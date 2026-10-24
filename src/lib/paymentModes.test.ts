import { describe, expect, it } from 'vitest'
import { matchMode } from './paymentModes'

const app = ['Credit Card', 'Debit Card', 'UPI', 'Cash', 'Bank Transfer']
const sheet = ['Credit card', 'Debit card', 'GPay / UPI', 'Cash ', 'NEFT/IMPS']

describe('matchMode', () => {
  it('keeps an exact name', () => expect(matchMode('UPI', app)).toBe('UPI'))
  it('ignores case and spaces', () => expect(matchMode('credit card', app)).toBe('Credit Card'))
  it('finds the same kind under another name', () => {
    expect(matchMode('UPI', sheet)).toBe('GPay / UPI')
    expect(matchMode('Credit Card', sheet)).toBe('Credit card')
    expect(matchMode('Bank Transfer', sheet)).toBe('NEFT/IMPS')
    expect(matchMode('Cash', sheet)).toBe('Cash ')
  })
  it('returns nothing when the sheet has no such mode', () => {
    expect(matchMode('Cash', ['UPI'])).toBeUndefined()
    expect(matchMode('Crypto', app)).toBeUndefined()
    expect(matchMode(undefined, app)).toBeUndefined()
  })
})
