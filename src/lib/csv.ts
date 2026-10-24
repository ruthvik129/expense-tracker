import type { Expense } from './types'

// Cells starting with these are read as formulas by spreadsheets; prefix to keep them as text.
const cell = (v: string | number) => {
  let s = String(v)
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCsv(rows: Expense[]): string {
  const head = ['Date', 'Description', 'Category', 'Amount', 'Payment Mode', 'Type', 'Notes']
  const lines = [...rows]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((e) => [e.date, e.description, e.category, e.amount, e.paymentMode, e.type, e.notes].map(cell).join(','))
  return [head.join(','), ...lines].join('\n')
}
