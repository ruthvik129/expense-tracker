import { addMonths, daysInMonth, endOfMonth, monthKey } from './dates'
import type { Expense, Ymd } from './types'

/** A monthly payment from the sheet's Recurring Payments tab. */
export interface Bill {
  id: string
  name: string
  amount: number
  category: string
  paymentMode: string
  /** 1-31, or null for "any time in the month". */
  dueDay: number | null
  active: boolean
}

/** A tick on the checklist: when it was ticked and the amount actually paid. */
export interface BillCheck {
  date: Ymd
  amount: number
}
/** Ticks by month (YYYY-MM), then bill id. Kept on the device until logged. */
export type BillChecks = Record<string, Record<string, BillCheck>>

/** One id per bill per month, so the sheet dedupes a double log and the app can tell it is paid. */
export const billEntryId = (billId: string, ym: string) => `bill-${billId}-${ym}`

export const loggedEntry = (bill: Bill, ym: string, expenses: Pick<Expense, 'id' | 'date' | 'amount'>[]) =>
  expenses.find((e) => e.id === billEntryId(bill.id, ym))

/** The due date in that month; day 31 becomes the 30th in a 30-day month. */
export function dueDate(bill: Bill, ym: string): Ymd | null {
  if (!bill.dueDay) return null
  const day = Math.min(bill.dueDay, daysInMonth(ym))
  return `${ym}-${String(day).padStart(2, '0')}`
}

/** The logged entry is dated the day it was ticked, kept inside the month it pays for. */
export function entryDate(bill: Bill, ym: string, check: BillCheck): Ymd {
  if (check.date.startsWith(ym)) return check.date
  return dueDate(bill, ym) ?? endOfMonth(ym)
}

export function entryFor(bill: Bill, ym: string, check: BillCheck): Omit<Expense, 'row' | 'type'> {
  return {
    id: billEntryId(bill.id, ym),
    date: entryDate(bill, ym, check),
    description: bill.name,
    category: bill.category,
    amount: check.amount,
    paymentMode: bill.paymentMode,
    notes: 'Recurring payment',
  }
}

export type BillStatus = 'logged' | 'ticked' | 'overdue' | 'upcoming' | 'open'

export function billStatus(
  bill: Bill,
  ym: string,
  today: Ymd,
  expenses: Pick<Expense, 'id' | 'date' | 'amount'>[],
  checks: BillChecks,
): BillStatus {
  if (loggedEntry(bill, ym, expenses)) return 'logged'
  if (checks[ym]?.[bill.id]) return 'ticked'
  const current = monthKey(today)
  if (ym < current) return 'overdue'
  const due = dueDate(bill, ym)
  if (!due) return 'open'
  return today >= due ? 'overdue' : 'upcoming'
}

/** Active bills already due this month and not logged yet: the number on the nav badge. */
export function dueCount(bills: Bill[], today: Ymd, expenses: Pick<Expense, 'id' | 'date' | 'amount'>[]) {
  const ym = monthKey(today)
  return bills.filter((b) => {
    if (!b.active || loggedEntry(b, ym, expenses)) return false
    const due = dueDate(b, ym)
    return due !== null && due <= today
  }).length
}

/** Drop ticks older than the previous month so device storage stays small. */
export function pruneChecks(checks: BillChecks, today: Ymd): BillChecks {
  const oldest = addMonths(monthKey(today), -1)
  return Object.fromEntries(Object.entries(checks).filter(([ym]) => ym >= oldest))
}
