import { useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Breakdown } from '@/components/Breakdown'
import { LimitMeter } from '@/components/LimitMeter'
import { InsightsTabs, PeriodPicker } from '@/components/PeriodNav'
import { EmptyState, LoadingState } from '@/components/states'
import { useApp } from '@/data/store'
import { useSettings } from '@/data/settings'
import { weekSummary } from '@/lib/aggregate'
import { addDays, formatWeekday, formatWeekRange, startOfWeek, todayIST } from '@/lib/dates'
import { formatCompact, formatINR } from '@/lib/format'

export default function WeeklyScreen() {
  const { expenses, bootstrap, loading } = useApp()
  const { settings } = useSettings()
  const thisWeek = startOfWeek(todayIST(), settings.weekStart)
  const [offset, setOffset] = useState(0)
  const start = addDays(thisWeek, offset * 7)

  const w = useMemo(
    () => weekSummary(expenses, start, { limit: bootstrap.weeklyLimit, countSavings: settings.weeklyCountsSavings }),
    [expenses, start, bootstrap.weeklyLimit, settings.weeklyCountsSavings],
  )
  const peak = Math.max(0, ...w.days.map((d) => d.total))
  const today = todayIST()

  return (
    <div>
      <h1 className="sr-only">Weekly analysis</h1>
      <InsightsTabs />
      <PeriodPicker
        label={formatWeekRange(start)}
        sub={offset === 0 ? 'This week' : offset === -1 ? 'Last week' : undefined}
        onPrev={() => setOffset((o) => o - 1)}
        onNext={() => setOffset((o) => o + 1)}
        nextDisabled={offset >= 0}
        onToday={() => setOffset(0)}
        atCurrent={offset === 0}
      />

      {loading && expenses.length === 0 ? (
        <LoadingState />
      ) : (
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader><CardTitle className="font-heading text-base">Weekly limit</CardTitle></CardHeader>
            <CardContent className="flex flex-col gap-3">
              <LimitMeter
                label={settings.weeklyCountsSavings ? 'All spending' : 'Needs + Wants'}
                spent={w.spent}
                limit={w.limit}
              />
              <p className="tabular text-sm text-muted-foreground">
                Total logged this week: {formatINR(w.total)}
                {!settings.weeklyCountsSavings && w.total !== w.spent && ' (Savings excluded from the limit)'}
              </p>
            </CardContent>
          </Card>

          {w.list.length === 0 ? (
            <EmptyState title="No spending this week" hint="Entries you add will appear here." />
          ) : (
            <>
              <Card>
                <CardHeader><CardTitle className="font-heading text-base">Day by day</CardTitle></CardHeader>
                <CardContent>
                  <div className="h-52" role="img" aria-label={`Daily spending, peak ${formatINR(peak)}`}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={w.days.map((d) => ({ ...d, label: formatWeekday(d.date) }))} margin={{ top: 8, right: 4, left: -8, bottom: 0 }}>
                        <CartesianGrid vertical={false} stroke="var(--border)" />
                        <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }} />
                        <YAxis tickFormatter={formatCompact} tickLine={false} axisLine={false} width={48} tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }} />
                        <Tooltip
                          cursor={{ fill: 'var(--muted)' }}
                          formatter={(v) => [formatINR(Number(v)), 'Spent']}
                          labelFormatter={(_, p) => p?.[0]?.payload?.date}
                          contentStyle={{ background: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--popover-foreground)' }}
                        />
                        <ReferenceLine y={w.limit / 7} stroke="var(--muted-foreground)" strokeDasharray="4 4" />
                        <Bar dataKey="total" radius={[6, 6, 0, 0]}>
                          {w.days.map((d) => (
                            <Cell key={d.date} fill="var(--chart-1)" fillOpacity={d.date === today ? 1 : 0.8} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">Dashed line: an even share of the weekly limit per day.</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="font-heading text-base">By category</CardTitle></CardHeader>
                <CardContent><Breakdown rows={w.byCategory} total={w.total} /></CardContent>
              </Card>
            </>
          )}
        </div>
      )}
    </div>
  )
}
