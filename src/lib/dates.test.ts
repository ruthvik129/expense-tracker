import { describe, expect, it } from 'vitest'
import { addDays, addMonths, daysInMonth, endOfMonth, startOfWeek, todayIST } from './dates'

describe('dates (Asia/Kolkata)', () => {
  it('uses the IST calendar day, not UTC', () => {
    // 20:00 UTC on 31 Dec is already 1 Jan 01:30 in IST
    expect(todayIST(new Date('2025-12-31T20:00:00Z'))).toBe('2026-01-01')
  })
  it('week boundaries respect the setting', () => {
    expect(startOfWeek('2026-01-01', 'mon')).toBe('2025-12-29') // Thu
    expect(startOfWeek('2026-01-01', 'sun')).toBe('2025-12-28')
    expect(startOfWeek('2026-01-04', 'mon')).toBe('2025-12-29') // Sunday belongs to prior Mon week
    expect(startOfWeek('2026-01-05', 'mon')).toBe('2026-01-05')
  })
  it('handles month and year ends', () => {
    expect(daysInMonth('2028-02')).toBe(29)
    expect(daysInMonth('2026-02')).toBe(28)
    expect(endOfMonth('2026-12')).toBe('2026-12-31')
    expect(addMonths('2026-01', -1)).toBe('2025-12')
    expect(addMonths('2026-12', 1)).toBe('2027-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
  })
})
