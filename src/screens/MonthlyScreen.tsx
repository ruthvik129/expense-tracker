import { useMemo, useState } from 'react'
import { CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Breakdown } from '@/components/Breakdown'
import { LimitMeter } from '@/components/LimitMeter'
import { InsightsTabs, PeriodPicker } from '@/components/PeriodNav'
import { EmptyState, LoadingState } from '@/components/states'
import { useApp } from '@/data/store'
import { monthSummary } from '@/lib/aggregate'
import { budgetsFor, splitLabel } from '@/lib/budget'
import { useSettings } from '@/data/settings'
import { addMonths, endOfMonth, formatMonth, monthKey, startOfMonth, todayIST } from '@/lib/dates'
import { formatCompact, formatINR } from '@/lib/format'

const PIE = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)']
const tip = { background: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--popover-foreground)' }

export default function MonthlyScreen() {
  const { expenses, bootstrap, loading } = useApp()
  const current = monthKey(todayIST())
  const [ym, setYm] = useState(current)
  const { settings } = useSettings()
  const fromSettings = settings.salary > 0
  const m = useMemo(() => {
    const budgets = budgetsFor(settings.salary, settings.split, bootstrap.budgets, Number(ym.slice(0, 4)))
    return monthSummary(expenses, ym, startOfMonth(ym), endOfMonth(ym), budgets)
  }, [expenses, ym, bootstrap.budgets, settings.salary, settings.split])

  return (
    <div>
      <h1 className="sr-only">Monthly analysis</h1>
      <InsightsTabs />
      <PeriodPicker
        label={formatMonth(ym)}
        sub={`Total ${formatINR(m.total)}`}
        onPrev={() => setYm(addMonths(ym, -1))}
        onNext={() => setYm(addMonths(ym, 1))}
        nextDisabled={ym >= current}
        onToday={() => setYm(current)}
        atCurrent={ym === current}
      />

      {loading && expenses.length === 0 ? (
        <LoadingState />
      ) : (
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader><CardTitle className="font-heading text-base">Budget ({fromSettings ? splitLabel(settings.split) : '50 : 30 : 20'})</CardTitle></CardHeader>
            <CardContent className="flex flex-col gap-5">
              {m.budget ? (
                m.buckets.map((b) => (
                  <LimitMeter key={b.type} label={b.label} spent={b.spent} limit={b.budget} inverse={b.type === 'Saving'} />
                ))
              ) : (
                <p className="text-sm text-muted-foreground">No budget row for {ym.slice(0, 4)} in the Setup tab. Add your salary in Settings.</p>
              )}
              {m.budget && (
                <p className="text-xs text-muted-foreground">
                  From {fromSettings ? 'your salary in Settings' : "your sheet's Setup tab"}.
                </p>
              )}
            </CardContent>
          </Card>

          {m.list.length === 0 ? (
            <EmptyState title="Nothing logged this month" hint="Pick another month or add an entry." />
          ) : (
            <>
              <Card>
                <CardHeader><CardTitle className="font-heading text-base">Daily trend</CardTitle></CardHeader>
                <CardContent>
                  <div className="h-48" role="img" aria-label="Daily spending trend for the month">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={m.daily.map((d) => ({ ...d, day: Number(d.date.slice(8)) }))} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                        <CartesianGrid vertical={false} stroke="var(--border)" />
                        <XAxis dataKey="day" tickLine={false} axisLine={false} interval={4} tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }} />
                        <YAxis tickFormatter={formatCompact} tickLine={false} axisLine={false} width={48} tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }} />
                        <Tooltip formatter={(v) => [formatINR(Number(v)), 'Spent']} labelFormatter={(d) => `Day ${d}`} contentStyle={tip} />
                        <Line type="monotone" dataKey="total" stroke="var(--chart-1)" strokeWidth={2.5} dot={false} activeDot={{ r: 5 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="font-heading text-base">By category</CardTitle></CardHeader>
                <CardContent><Breakdown rows={m.byCategory} total={m.total} /></CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="font-heading text-base">Payment modes</CardTitle></CardHeader>
                <CardContent className="flex items-center gap-4">
                  <div className="size-32 shrink-0" role="img" aria-label="Payment mode split, details listed beside the chart">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={m.byMode} dataKey="total" nameKey="name" innerRadius="58%" outerRadius="100%" stroke="var(--card)" strokeWidth={2}>
                          {m.byMode.map((_, i) => <Cell key={i} fill={PIE[i % PIE.length]} />)}
                        </Pie>
                        <Tooltip formatter={(v, n) => [formatINR(Number(v)), n]} contentStyle={tip} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <ul className="flex min-w-0 flex-1 flex-col gap-2">
                    {m.byMode.map((r, i) => (
                      <li key={r.name} className="flex items-center gap-2 text-sm">
                        <span aria-hidden className="size-3 shrink-0 rounded-sm" style={{ background: PIE[i % PIE.length] }} />
                        <span className="min-w-0 flex-1 truncate">{r.name}</span>
                        <span className="tabular font-semibold">{formatINR(r.total)}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      )}
    </div>
  )
}
