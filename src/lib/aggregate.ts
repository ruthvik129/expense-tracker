import { addDays } from './dates'
import { round2 } from './format'
import type { Expense, ExpenseType, Ymd, YearBudget } from './types'

export const inRange = (list: Expense[], from: Ymd, to: Ymd) =>
  list.filter((e) => e.date >= from && e.date <= to)

export function sumBy<K extends string>(list: Expense[], key: (e: Expense) => K) {
  const out = new Map<K, number>()
  for (const e of list) out.set(key(e), (out.get(key(e)) ?? 0) + e.amount)
  return [...out.entries()]
    .map(([name, total]) => ({ name, total: round2(total) }))
    .sort((a, b) => b.total - a.total)
}

export const total = (list: Expense[]) => round2(list.reduce((s, e) => s + e.amount, 0))

export function totalsByDay(list: Expense[]): Map<Ymd, number> {
  const m = new Map<Ymd, number>()
  for (const e of list) m.set(e.date, (m.get(e.date) ?? 0) + e.amount)
  for (const [k, v] of m) m.set(k, round2(v))
  return m
}

export function dailySeries(list: Expense[], from: Ymd, to: Ymd) {
  const byDay = totalsByDay(list)
  const out: { date: Ymd; total: number }[] = []
  for (let d = from; d <= to; d = addDays(d, 1)) out.push({ date: d, total: byDay.get(d) ?? 0 })
  return out
}

export type LimitState = 'ok' | 'warn' | 'over'
export function limitState(spent: number, limit: number): LimitState {
  if (limit <= 0) return 'ok'
  if (spent > limit) return 'over'
  return spent >= limit * 0.8 ? 'warn' : 'ok'
}

export function weekSummary(
  all: Expense[],
  start: Ymd,
  opts: { limit: number; countSavings: boolean },
) {
  const end = addDays(start, 6)
  const list = inRange(all, start, end)
  const counted = list.filter((e) => opts.countSavings || e.type !== 'Saving')
  const spent = total(counted)
  return {
    list,
    total: total(list),
    spent,
    limit: opts.limit,
    state: limitState(spent, opts.limit),
    days: dailySeries(list, start, end),
    byCategory: sumBy(list, (e) => e.category),
  }
}

export function monthSummary(all: Expense[], ym: string, start: Ymd, end: Ymd, budgets: YearBudget[]) {
  const list = inRange(all, start, end)
  const year = Number(ym.slice(0, 4))
  const budget = budgets.find((b) => b.year === year)
  const spentBy = (t: ExpenseType) => total(list.filter((e) => e.type === t))
  return {
    list,
    total: total(list),
    budget,
    buckets: [
      { type: 'Need' as const, label: 'Needs', spent: spentBy('Need'), budget: budget?.needs ?? 0 },
      { type: 'Want' as const, label: 'Wants', spent: spentBy('Want'), budget: budget?.wants ?? 0 },
      { type: 'Saving' as const, label: 'Savings', spent: spentBy('Saving'), budget: budget?.savings ?? 0 },
    ],
    byCategory: sumBy(list, (e) => e.category),
    byMode: sumBy(list, (e) => e.paymentMode),
    daily: dailySeries(list, start, end),
  }
}

/** Heatmap bucket 0-4 from quartiles of the non-zero day totals. */
export function heatBuckets(totals: Iterable<number>) {
  const vals = [...totals].filter((v) => v > 0).sort((a, b) => a - b)
  const q = (p: number) => vals[Math.min(vals.length - 1, Math.floor(p * vals.length))]
  const cuts = vals.length ? [q(0.25), q(0.5), q(0.75)] : [0, 0, 0]
  return (v: number): 0 | 1 | 2 | 3 | 4 => {
    if (v <= 0) return 0
    if (v <= cuts[0]) return 1
    if (v <= cuts[1]) return 2
    if (v <= cuts[2]) return 3
    return 4
  }
}
