import type { WeekStart, Ymd } from './types'

export const TZ = 'Asia/Kolkata'

const ymdFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

export const todayIST = (now: Date = new Date()): Ymd => ymdFmt.format(now)

const toMs = (ymd: Ymd) => {
  const [y, m, d] = ymd.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}
const fromMs = (ms: number): Ymd => new Date(ms).toISOString().slice(0, 10)
const DAY = 86_400_000

export const addDays = (ymd: Ymd, n: number): Ymd => fromMs(toMs(ymd) + n * DAY)
export const diffDays = (a: Ymd, b: Ymd) => Math.round((toMs(a) - toMs(b)) / DAY)

/** 0 = Sunday */
export const dayOfWeek = (ymd: Ymd) => new Date(toMs(ymd)).getUTCDay()

export function startOfWeek(ymd: Ymd, weekStart: WeekStart): Ymd {
  const dow = dayOfWeek(ymd)
  const offset = weekStart === 'mon' ? (dow + 6) % 7 : dow
  return addDays(ymd, -offset)
}
export const endOfWeek = (ymd: Ymd, weekStart: WeekStart) =>
  addDays(startOfWeek(ymd, weekStart), 6)

export const monthKey = (ymd: Ymd) => ymd.slice(0, 7)
export const startOfMonth = (ym: string): Ymd => `${ym}-01`
export const daysInMonth = (ym: string) => {
  const [y, m] = ym.split('-').map(Number)
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}
export const endOfMonth = (ym: string): Ymd =>
  `${ym}-${String(daysInMonth(ym)).padStart(2, '0')}`

export function addMonths(ym: string, n: number): string {
  const [y, m] = ym.split('-').map(Number)
  const idx = y * 12 + (m - 1) + n
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}`
}

const fmt = (opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat('en-IN', { timeZone: 'UTC', ...opts })
const dayFmt = fmt({ weekday: 'short', day: '2-digit', month: 'short' })
const shortFmt = fmt({ day: 'numeric', month: 'short' })
const monthFmt = fmt({ month: 'long', year: 'numeric' })
const weekdayFmt = fmt({ weekday: 'short' })

export const formatDay = (ymd: Ymd) => dayFmt.format(toMs(ymd))
export const formatShort = (ymd: Ymd) => shortFmt.format(toMs(ymd))
export const formatMonth = (ym: string) => monthFmt.format(toMs(`${ym}-01`))
export const formatWeekday = (ymd: Ymd) => weekdayFmt.format(toMs(ymd))
export const monthName = (ym: string) => fmt({ month: 'short' }).format(toMs(`${ym}-01`))

export function formatWeekRange(start: Ymd): string {
  return `${formatShort(start)} – ${formatShort(addDays(start, 6))}`
}

/** Friendly day heading: Today / Yesterday / Thu, 01 Jan */
export function relativeDay(ymd: Ymd, today: Ymd = todayIST()): string {
  if (ymd === today) return 'Today'
  if (ymd === addDays(today, -1)) return 'Yesterday'
  return formatDay(ymd)
}
