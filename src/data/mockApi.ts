import { addDays, todayIST } from '@/lib/dates'
import type { Bootstrap, Category, Expense, Ymd } from '@/lib/types'
import { ApiError, NetworkError, type SheetApi } from './api'
import type { Bill } from '@/lib/bills'

const categories: Category[] = [
  { name: 'Life Infrastructure', type: 'Need' },
  { name: 'Future Me', type: 'Saving' },
  { name: 'Performance & Growth', type: 'Need' },
  { name: 'Relationships & Generosity', type: 'Want' },
  { name: 'Lifestyle Enjoyment', type: 'Want' },
]

export function demoBootstrap(now: Ymd = todayIST()): Bootstrap {
  const y = Number(now.slice(0, 4))
  const budgets = [-1, 0, 1].map((o) => {
    const salary = Math.round(100_000 * 1.1 ** o)
    return {
      year: y + o,
      salary,
      needs: Math.round(salary * 0.5),
      wants: Math.round(salary * 0.3),
      savings: Math.round(salary * 0.2),
    }
  })
  return {
    categories,
    paymentModes: ['Credit Card', 'Debit Card', 'UPI', 'Cash', 'Bank Transfer'],
    weeklyLimit: 10_000,
    budgets,
    sheetTimezone: 'Asia/Kolkata',
  }
}

const merchants: Record<string, [string, number, number][]> = {
  'Life Infrastructure': [['Uber', 120, 600], ['Electricity bill', 700, 1800], ['Groceries', 300, 1400], ['Metro recharge', 200, 500]],
  'Future Me': [['SIP mutual fund', 2000, 2000], ['Gold coin', 1000, 3000]],
  'Performance & Growth': [['Udemy course', 449, 1999], ['Book', 250, 800], ['Gym', 1500, 1500]],
  'Relationships & Generosity': [['Gift for friend', 500, 2500], ['Family dinner', 900, 3000], ['Donation', 200, 1000]],
  'Lifestyle Enjoyment': [['Swiggy', 180, 650], ['Movie tickets', 400, 900], ['Coffee', 120, 380], ['Weekend trip', 1500, 3500]],
}
const weights = [0.38, 0.05, 0.1, 0.17, 0.3]

function rng(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Deterministic ~14 months of plausible rows so every screen has data to render. */
export function demoExpenses(now: Ymd = todayIST()): Expense[] {
  const r = rng(42)
  const modes = ['UPI', 'UPI', 'UPI', 'Credit Card', 'Debit Card', 'Cash', 'Bank Transfer']
  const out: Expense[] = []
  for (let back = 0; back < 430; back++) {
    const date = addDays(now, -back)
    const n = r() < 0.18 ? 0 : 1 + Math.floor(r() * 3)
    for (let i = 0; i < n; i++) {
      let pick = r()
      let ci = 0
      for (; ci < weights.length - 1; ci++) {
        if (pick < weights[ci]) break
        pick -= weights[ci]
      }
      const cat = categories[ci]
      const list = merchants[cat.name]
      const [description, lo, hi] = list[Math.floor(r() * list.length)]
      out.push({
        id: `demo-${back}-${i}`,
        date,
        description,
        category: cat.name,
        amount: Math.round(lo + r() * (hi - lo)),
        paymentMode: modes[Math.floor(r() * modes.length)],
        type: cat.type,
        notes: '',
      })
    }
  }
  return out
}

/** In-memory stand-in for the Apps Script web app. Used for demo mode and tests. */
export class MockSheetApi implements SheetApi {
  rows: Expense[]
  private nextRow = 2
  /** Test hook: apply the next write, then throw as if the response was lost. */
  loseNextResponse = false
  calls = { add: 0, update: 0, remove: 0 }
  billList: Bill[] = [
    { id: 'demo-rent', name: 'Rent', amount: 18000, category: 'Life Infrastructure', paymentMode: 'Bank Transfer', dueDay: 1, active: true },
    { id: 'demo-gym', name: 'Gym membership', amount: 1500, category: 'Performance & Growth', paymentMode: 'Debit Card', dueDay: 6, active: true },
    { id: 'demo-netflix', name: 'Netflix', amount: 199, category: 'Lifestyle Enjoyment', paymentMode: 'Credit Card', dueDay: 7, active: true },
    { id: 'demo-power', name: 'Electricity bill', amount: 1400, category: 'Life Infrastructure', paymentMode: 'UPI', dueDay: 20, active: true },
    { id: 'demo-net', name: 'Broadband', amount: 799, category: 'Life Infrastructure', paymentMode: 'UPI', dueDay: null, active: true },
  ]

  private boot: Bootstrap

  constructor(seed: Expense[] = demoExpenses(), boot: Bootstrap = demoBootstrap()) {
    this.boot = boot
    this.rows = seed.map((e) => ({ ...e, row: this.nextRow++ }))
  }

  async bootstrap() {
    return structuredClone(this.boot)
  }
  async expenses(from: Ymd, to: Ymd) {
    return this.rows.filter((e) => e.date >= from && e.date <= to).map((e) => ({ ...e }))
  }
  async add(expense: Expense) {
    this.calls.add++
    let row = this.rows.find((e) => e.id === expense.id)
    if (!row) {
      row = { ...expense, row: this.nextRow++ }
      this.rows.push(row)
    }
    this.dropResponseIfAsked()
    return { id: row.id, row: row.row! }
  }
  async update(id: string, expense: Expense) {
    this.calls.update++
    const i = this.rows.findIndex((e) => e.id === id)
    if (i < 0) throw new ApiError('NOT_FOUND')
    this.rows[i] = { ...expense, id, row: this.rows[i].row }
    this.dropResponseIfAsked()
    return { id, row: this.rows[i].row! }
  }
  async remove(id: string, _row?: number) {
    void _row
    this.calls.remove++
    this.rows = this.rows.filter((e) => e.id !== id)
    this.dropResponseIfAsked()
  }
  async bills() {
    return this.billList.map((b) => ({ ...b }))
  }
  async saveBill(bill: Bill) {
    const i = this.billList.findIndex((b) => b.id === bill.id)
    if (i >= 0) this.billList[i] = { ...bill }
    else this.billList.push({ ...bill })
    return { ...bill }
  }
  async deleteBill(id: string) {
    if (!this.billList.some((b) => b.id === id)) throw new ApiError('NOT_FOUND')
    this.billList = this.billList.filter((b) => b.id !== id)
  }
  private dropResponseIfAsked() {
    if (this.loseNextResponse) {
      this.loseNextResponse = false
      throw new NetworkError('response lost')
    }
  }
}
