export type ExpenseType = 'Need' | 'Want' | 'Saving'
export type Ymd = string // YYYY-MM-DD, Asia/Kolkata calendar day

export interface Expense {
  id: string
  /** Sheet row once known; absent for entries not yet synced. */
  row?: number
  date: Ymd
  description: string
  category: string
  amount: number
  paymentMode: string
  type: ExpenseType
  notes: string
}

export interface Category {
  name: string
  type: ExpenseType
}

export interface YearBudget {
  year: number
  salary: number
  needs: number
  wants: number
  savings: number
}

export interface Bootstrap {
  categories: Category[]
  paymentModes: string[]
  weeklyLimit: number
  budgets: YearBudget[]
  sheetTimezone: string
  /** The daily tab has an App ID column, so entries keep the id the app gave them. */
  appIdColumn?: boolean
}

export type WeekStart = 'mon' | 'sun'
