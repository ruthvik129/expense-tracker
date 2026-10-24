import { monthKey } from './dates'
import type { Category, Expense, Ymd } from './types'

export interface RecurringSaving {
  enabled: boolean
  amount: number
  description: string
  /** Blank means the first Saving-type category from the Setup tab. */
  category: string
  paymentMode: string
  /** Day of month the entry is dated and created, 1-28. */
  day: number
}

/** Same id on every device for a given month, so the sheet dedupes it to one row. */
export const recurringId = (ym: string) => `recurring-saving-${ym}`

export function savingCategory(cfg: RecurringSaving, categories: Category[]): string | undefined {
  if (categories.some((c) => c.name === cfg.category)) return cfg.category
  return categories.find((c) => c.type === 'Saving')?.name
}

/**
 * What the recurring saving needs this month, if anything.
 * - `null`: nothing to do (off, already handled, or the day has not come yet)
 * - `{ month }`: the entry already exists, just remember the month as handled
 * - `{ month, entry }`: create this entry
 * Months are remembered once handled, so an entry the user deletes is not re-created.
 */
export function dueRecurring(
  cfg: RecurringSaving,
  today: Ymd,
  handled: string[],
  existing: Pick<Expense, 'id'>[],
  categories: Category[],
): { month: string; entry?: Omit<Expense, 'row' | 'type'> } | null {
  if (!cfg.enabled || !(cfg.amount > 0)) return null
  const month = monthKey(today)
  if (handled.includes(month)) return null
  const day = Math.min(28, Math.max(1, Math.round(cfg.day) || 1))
  if (Number(today.slice(8)) < day) return null
  const id = recurringId(month)
  if (existing.some((e) => e.id === id)) return { month }
  const category = savingCategory(cfg, categories)
  if (!category) return null
  return {
    month,
    entry: {
      id,
      date: `${month}-${String(day).padStart(2, '0')}`,
      description: cfg.description.trim() || 'Monthly saving',
      category,
      amount: cfg.amount,
      paymentMode: cfg.paymentMode,
      notes: 'Auto: recurring saving. Delete if not saved this month.',
    },
  }
}
