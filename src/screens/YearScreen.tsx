import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { ExpenseRow } from '@/components/ExpenseRow'
import { PeriodPicker } from '@/components/PeriodNav'
import { LoadingState } from '@/components/states'
import { useApp } from '@/data/store'
import { useSettings } from '@/data/settings'
import { heatBuckets, total, totalsByDay } from '@/lib/aggregate'
import { addMonths, dayOfWeek, daysInMonth, formatDay, formatMonth, monthKey, monthName, todayIST } from '@/lib/dates'
import { formatINR } from '@/lib/format'
import type { Expense, WeekStart, Ymd } from '@/lib/types'
import { HISTORY_MONTHS } from '@/data/sync'

const HEADS: Record<WeekStart, string[]> = {
  mon: ['M', 'T', 'W', 'T', 'F', 'S', 'S'],
  sun: ['S', 'M', 'T', 'W', 'T', 'F', 'S'],
}

function MonthGrid({
  ym, weekStart, totals, bucket, today, onPick,
}: {
  ym: string
  weekStart: WeekStart
  totals: Map<Ymd, number>
  bucket: (v: number) => 0 | 1 | 2 | 3 | 4
  today: Ymd
  onPick: (d: Ymd) => void
}) {
  const first = dayOfWeek(`${ym}-01`)
  const lead = weekStart === 'mon' ? (first + 6) % 7 : first
  const n = daysInMonth(ym)
  return (
    <section aria-label={formatMonth(ym)}>
      <h3 className="mb-1.5 font-heading text-sm font-semibold">{monthName(ym)}</h3>
      <div className="grid grid-cols-7 gap-1">
        {HEADS[weekStart].map((h, i) => (
          <span key={i} aria-hidden className="text-center text-[11px] text-muted-foreground">{h}</span>
        ))}
        {Array.from({ length: lead }, (_, i) => <span key={`b${i}`} />)}
        {Array.from({ length: n }, (_, i) => {
          const day = String(i + 1).padStart(2, '0')
          const date = `${ym}-${day}`
          const v = totals.get(date) ?? 0
          const b = bucket(v)
          const future = date > today
          return (
            <button
              key={date}
              type="button"
              disabled={future}
              onClick={() => onPick(date)}
              aria-label={`${formatDay(date)}: ${v ? `spent ${formatINR(v)}` : 'no spending'}`}
              className="flex aspect-square cursor-pointer items-center justify-center rounded-md text-xs font-medium transition-transform duration-150 hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring disabled:cursor-default disabled:opacity-35 disabled:hover:scale-100"
              style={{ background: `var(--heat-${b})`, color: `var(--heat-fg-${b})`, outline: date === today ? '2px solid var(--primary)' : undefined, outlineOffset: date === today ? 1 : undefined }}
            >
              {i + 1}
            </button>
          )
        })}
      </div>
    </section>
  )
}

export default function YearScreen() {
  const { expenses, loading } = useApp()
  const { settings } = useSettings()
  const today = todayIST()
  const thisYear = Number(today.slice(0, 4))
  const [year, setYear] = useState(thisYear)
  const [picked, setPicked] = useState<Ymd | null>(null)

  const yearRows = useMemo(() => expenses.filter((e) => e.date.startsWith(`${year}-`)), [expenses, year])
  // Same rule as the sheet's Yearly Calendar: colour by spending (Need + Want), not savings.
  const spendRows = useMemo(() => yearRows.filter((e) => e.type !== 'Saving'), [yearRows])
  const totals = useMemo(() => totalsByDay(spendRows), [spendRows])
  const bucket = useMemo(() => heatBuckets(totals.values()), [totals])
  const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`)

  // Only the last 13 months are cached on the device.
  const windowStart = addMonths(monthKey(today), -(HISTORY_MONTHS - 1))
  const partial = months[0] < windowStart

  const dayRows: Expense[] = picked ? expenses.filter((e) => e.date === picked) : []
  const daySpent = total(dayRows.filter((e) => e.type !== 'Saving'))
  const daySaved = total(dayRows.filter((e) => e.type === 'Saving'))

  return (
    <div>
      <h1 className="sr-only">Year calendar</h1>
      <PeriodPicker
        label={String(year)}
        sub={`Spent ${formatINR(total(spendRows))} · savings not counted`}
        onPrev={() => setYear(year - 1)}
        onNext={() => setYear(year + 1)}
        nextDisabled={year >= thisYear}
        onToday={() => setYear(thisYear)}
        atCurrent={year === thisYear}
      />
      {partial && (
        <p role="note" className="mb-3 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
          Only the last {HISTORY_MONTHS} months are stored on this phone, so earlier months may look emptier than your sheet.
        </p>
      )}

      {loading && expenses.length === 0 ? (
        <LoadingState />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            {months.map((ym) => (
              <MonthGrid key={ym} ym={ym} weekStart={settings.weekStart} totals={totals} bucket={bucket} today={today} onPick={setPicked} />
            ))}
          </div>
          <div className="mt-6 flex items-center justify-center gap-2 text-xs text-muted-foreground" aria-label="Legend: less to more spending">
            Less
            {[0, 1, 2, 3, 4].map((b) => (
              <span key={b} aria-hidden className="size-4 rounded-sm border border-border/50" style={{ background: `var(--heat-${b})` }} />
            ))}
            More
          </div>
        </>
      )}

      <Drawer open={!!picked} onOpenChange={(o) => !o && setPicked(null)}>
        <DrawerContent className="max-h-[80dvh]">
          <DrawerHeader>
            <DrawerTitle>{picked && formatDay(picked)}</DrawerTitle>
            <DrawerDescription className="tabular">
              {dayRows.length
                ? `${dayRows.length} ${dayRows.length === 1 ? 'entry' : 'entries'} · spent ${formatINR(daySpent)}${daySaved ? ` · saved ${formatINR(daySaved)}` : ''}`
                : 'Nothing logged'}
            </DrawerDescription>
          </DrawerHeader>
          <div className="flex flex-col gap-2 overflow-y-auto px-4 pb-6">
            {dayRows.map((e) => <ExpenseRow key={e.id} e={e} />)}
            <Button variant="outline" className="mt-2 h-11" onClick={() => setPicked(null)}>Close</Button>
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  )
}
