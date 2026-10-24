import { addDays, dayOfWeek, todayIST } from './dates'
import type { Ymd } from './types'

export interface ParsedEntry {
  amount?: number
  paymentMode?: string
  date?: Ymd
  description: string
  notes?: string
}

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5,
  jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9,
  oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
}
const WEEKDAYS: Record<string, number> = {
  sunday: 0, sun: 0, monday: 1, mon: 1, tuesday: 2, tue: 2, tues: 2, wednesday: 3, wed: 3,
  thursday: 4, thu: 4, thur: 4, thurs: 4, friday: 5, fri: 5, saturday: 6, sat: 6,
}
// Only full weekday names count on their own ("sat" is too often a word); abbreviations need "last".
const FULL_WEEKDAYS = new Set(['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'])

/** Longest phrases first. Values are the sheet's payment-mode names. */
const MODE_ALIASES: [string[], string][] = [
  [['credit', 'card'], 'Credit Card'], [['debit', 'card'], 'Debit Card'],
  [['bank', 'transfer'], 'Bank Transfer'], [['net', 'banking'], 'Bank Transfer'],
  [['google', 'pay'], 'UPI'], [['phone', 'pe'], 'UPI'],
  [['upi'], 'UPI'], [['gpay'], 'UPI'], [['phonepe'], 'UPI'], [['paytm'], 'UPI'], [['bhim'], 'UPI'],
  [['cc'], 'Credit Card'], [['credit'], 'Credit Card'], [['dc'], 'Debit Card'], [['debit'], 'Debit Card'],
  [['cash'], 'Cash'], [['neft'], 'Bank Transfer'], [['imps'], 'Bank Transfer'], [['rtgs'], 'Bank Transfer'],
  [['transfer'], 'Bank Transfer'], [['netbanking'], 'Bank Transfer'],
]

const CONNECTORS = new Set(['on', 'via', 'by', 'using', 'paid', 'for', 'at', 'with', 'in', 'from', 'thru', 'through'])
const CURRENCY = /^(?:₹|rs\.?|inr|rupees?)$/i
const SCALE: Record<string, number> = { k: 1e3, thousand: 1e3, l: 1e5, lakh: 1e5, lac: 1e5, lakhs: 1e5 }

const lower = (s: string) => s.toLowerCase().replace(/[.,]+$/, '')
const pad = (n: number) => String(n).padStart(2, '0')

function validYmd(y: number, m: number, d: number): Ymd | null {
  if (m < 1 || m > 12 || d < 1) return null
  const dim = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return d > dim ? null : `${y}-${pad(m)}-${pad(d)}`
}

/** Without an explicit year, a date that would land in the future means last year. */
function resolve(m: number, d: number, year: number | null, today: Ymd): Ymd | null {
  if (year !== null) return validYmd(year < 100 ? 2000 + year : year, m, d)
  const y = Number(today.slice(0, 4))
  const sameYear = validYmd(y, m, d)
  if (sameYear && sameYear <= today) return sameYear
  return validYmd(y - 1, m, d)
}

function parseAmount(tok: string): { value: number; scale?: boolean } | null {
  const m = tok.match(/^(?:₹|rs\.?|inr)?(\d[\d,]*(?:\.\d+)?)(k|l|lakh|lac)?(?:\/-|rs|₹)?$/i)
  if (!m) return null
  const value = parseFloat(m[1].replace(/,/g, ''))
  if (!Number.isFinite(value)) return null
  return { value: value * (m[2] ? SCALE[m[2].toLowerCase()] : 1), scale: !!m[2] }
}

const round2 = (n: number) => Math.round(n * 100) / 100

/**
 * Turn one line like `uber 450 upi yesterday` into entry fields.
 * Order: notes (after `//`), date words, amount, payment mode; whatever is left is the description.
 * Dates go first only so a day number (`1 oct`) is never mistaken for the amount.
 */
export function parseEntry(input: string, today: Ymd = todayIST()): ParsedEntry {
  const [main, ...noteParts] = input.split('//')
  const notes = noteParts.join('//').trim() || undefined
  const toks = main.trim().split(/\s+/).filter(Boolean)
  const used = new Array<boolean>(toks.length).fill(false)
  const lw = toks.map(lower)
  const out: ParsedEntry = { description: '', notes }
  const take = (...idx: number[]) => idx.forEach((i) => (used[i] = true))
  const free = (i: number) => i >= 0 && i < toks.length && !used[i]

  // --- date ---
  for (let i = 0; i < toks.length && !out.date; i++) {
    if (!free(i)) continue
    const t = lw[i]
    const next = lw[i + 1]
    const yearAt = (j: number) => (free(j) && /^\d{4}$/.test(lw[j]) ? Number(lw[j]) : null)

    if (t === 'today' || t === 'tdy') { out.date = today; take(i); break }
    if (t === 'yesterday' || t === 'yday' || t === 'yest') { out.date = addDays(today, -1); take(i); break }
    if (t === 'day' && next === 'before' && lw[i + 2] === 'yesterday') { out.date = addDays(today, -2); take(i, i + 1, i + 2); break }
    if (/^\d{1,2}$/.test(t) && (next === 'days' || next === 'day') && lw[i + 2] === 'ago') {
      out.date = addDays(today, -Number(t)); take(i, i + 1, i + 2); break
    }
    if (t === 'last' && next !== undefined && next in WEEKDAYS) {
      const back = ((dayOfWeek(today) - WEEKDAYS[next] + 7) % 7) || 7
      out.date = addDays(today, -back); take(i, i + 1); break
    }
    if (FULL_WEEKDAYS.has(t)) {
      out.date = addDays(today, -((dayOfWeek(today) - WEEKDAYS[t] + 7) % 7)); take(i); break
    }
    // 1 oct, 1st oct, 01-oct, 1 oct 2025
    const dm = t.match(/^(\d{1,2})(?:st|nd|rd|th)?(?:-([a-z]+))?$/)
    if (dm) {
      const monTok = dm[2] ?? (free(i + 1) ? next : undefined)
      if (monTok && monTok in MONTHS) {
        const yIdx = dm[2] ? i + 1 : i + 2
        const y = yearAt(yIdx)
        const d = resolve(MONTHS[monTok], Number(dm[1]), y, today)
        if (d) { out.date = d; take(i); if (!dm[2]) take(i + 1); if (y !== null) take(yIdx); break }
      }
    }
    // oct 1, oct 1st
    if (t in MONTHS && free(i + 1)) {
      const dd = lw[i + 1].match(/^(\d{1,2})(?:st|nd|rd|th)?$/)
      if (dd) {
        const y = yearAt(i + 2)
        const d = resolve(MONTHS[t], Number(dd[1]), y, today)
        if (d) { out.date = d; take(i, i + 1); if (y !== null) take(i + 2); break }
      }
    }
    // 1/10, 01/10/25, 1-10-2025 (day first, Indian order)
    const sl = t.match(/^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2}|\d{4}))?$/)
    if (sl) {
      const d = resolve(Number(sl[2]), Number(sl[1]), sl[3] ? Number(sl[3]) : null, today)
      if (d) { out.date = d; take(i); break }
    }
  }

  // --- amount: first number left, with ₹ / rs / k / lakh around it ---
  for (let i = 0; i < toks.length && out.amount === undefined; i++) {
    if (!free(i)) continue
    if (CURRENCY.test(lw[i]) && free(i + 1)) {
      const a = parseAmount(lw[i + 1])
      if (a) { out.amount = round2(a.value); take(i, i + 1); break }
    }
    const a = parseAmount(lw[i])
    if (!a) continue
    let value = a.value
    take(i)
    if (!a.scale && free(i + 1) && lw[i + 1] in SCALE) { value *= SCALE[lw[i + 1]]; take(i + 1) }
    if (free(i + 1) && (CURRENCY.test(lw[i + 1]) || lw[i + 1] === '/-')) take(i + 1)
    if (free(i - 1) && CURRENCY.test(lw[i - 1])) take(i - 1)
    out.amount = round2(value)
  }

  // --- payment mode ---
  outer: for (let i = 0; i < toks.length; i++) {
    for (const [words, mode] of MODE_ALIASES) {
      if (words.every((w, k) => free(i + k) && lw[i + k] === w)) {
        out.paymentMode = mode
        take(...words.map((_, k) => i + k))
        break outer
      }
    }
  }

  // --- description: what is left, minus dangling connectors, title-cased ---
  const rest = toks.filter((_, i) => !used[i])
  while (rest.length && CONNECTORS.has(lower(rest[0]))) rest.shift()
  while (rest.length && CONNECTORS.has(lower(rest[rest.length - 1]))) rest.pop()
  out.description = rest.map((w) => (w === w.toLowerCase() ? w[0].toUpperCase() + w.slice(1) : w)).join(' ')
  return out
}
