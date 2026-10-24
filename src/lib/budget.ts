import { round2 } from './format'
import type { YearBudget } from './types'

export interface Split {
  needs: number
  wants: number
  savings: number
}

export const DEFAULT_SPLIT: Split = { needs: 50, wants: 30, savings: 20 }

export const isDefaultSplit = (s: Split) =>
  s.needs === DEFAULT_SPLIT.needs && s.wants === DEFAULT_SPLIT.wants && s.savings === DEFAULT_SPLIT.savings

export function splitError(s: Split): string | null {
  const parts = [s.needs, s.wants, s.savings]
  if (parts.some((p) => !Number.isFinite(p) || p < 0)) return 'Each share must be 0 or more'
  const sum = round2(parts.reduce((a, b) => a + b, 0))
  return sum === 100 ? null : `Shares add up to ${sum}%, they need to add up to 100%`
}

export const splitLabel = (s: Split) => `${s.needs} : ${s.wants} : ${s.savings}`

/**
 * Monthly budgets for a year. A salary set in Settings wins over the sheet's Setup table,
 * so the split can be changed without touching the sheet.
 */
export function budgetsFor(salary: number, split: Split, sheet: YearBudget[], year: number): YearBudget[] {
  if (!(salary > 0)) return sheet
  return [
    {
      year,
      salary,
      needs: round2((salary * split.needs) / 100),
      wants: round2((salary * split.wants) / 100),
      savings: round2((salary * split.savings) / 100),
    },
  ]
}
