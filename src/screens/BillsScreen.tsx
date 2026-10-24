import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { CheckCircle2, Pencil, Plus, Undo2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { BillDialog } from '@/components/bills/BillDialog'
import { PeriodPicker } from '@/components/PeriodNav'
import { EmptyState, LoadingState } from '@/components/states'
import { useApp } from '@/data/store'
import {
  billEntryId, billStatus, dueDate, entryFor, loggedEntry, pruneChecks,
  type Bill, type BillCheck, type BillChecks, type BillStatus,
} from '@/lib/bills'
import { addMonths, formatMonth, formatShort, monthKey, todayIST } from '@/lib/dates'
import { formatINR, round2 } from '@/lib/format'
import { cn } from '@/lib/utils'

const CHECKS_KEY = 'et.billChecks'

/** Ticks live on this device until they are logged, so you can tick across several days. */
function useChecks() {
  const [checks, setChecks] = useState<BillChecks>(() => {
    try {
      return pruneChecks(JSON.parse(localStorage.getItem(CHECKS_KEY) ?? '{}'), todayIST())
    } catch {
      return {}
    }
  })
  const save = (next: BillChecks) => {
    setChecks(next)
    try {
      localStorage.setItem(CHECKS_KEY, JSON.stringify(next))
    } catch {
      /* storage blocked: ticks last for this visit only */
    }
  }
  return [checks, save] as const
}

const statusText = (s: BillStatus, bill: Bill, ym: string) => {
  const due = dueDate(bill, ym)
  if (s === 'overdue') return due ? `Due ${formatShort(due)}` : 'Not paid'
  return due ? `Due ${formatShort(due)}` : 'Any time this month'
}

function BillRow({
  bill, ym, status, check, loggedOn, loggedAmount, onTick, onAmount, onEdit, onUndo,
}: {
  bill: Bill
  ym: string
  status: BillStatus
  check?: BillCheck
  loggedOn?: string
  loggedAmount?: number
  onTick: (on: boolean) => void
  onAmount: (v: string) => void
  onEdit: () => void
  onUndo: () => void
}) {
  const logged = status === 'logged'
  const amountId = `amt-${bill.id}`
  return (
    <li className={cn('flex items-center gap-3 rounded-xl bg-card px-3 py-2', logged && 'opacity-80')}>
      {logged ? (
        <span className="flex size-11 shrink-0 items-center justify-center text-success" aria-hidden>
          <CheckCircle2 className="size-6" />
        </span>
      ) : (
        <label className="flex size-11 shrink-0 cursor-pointer items-center justify-center">
          <Checkbox
            checked={!!check}
            onCheckedChange={(v) => onTick(!!v)}
            aria-label={`Paid ${bill.name}`}
            className="size-6 rounded-md [&_svg]:size-4"
          />
        </label>
      )}

      <button type="button" onClick={onEdit} className="min-w-0 flex-1 cursor-pointer py-1 text-left focus-visible:outline-2 focus-visible:outline-ring" aria-label={`Edit ${bill.name}`}>
        <p className="truncate text-base font-medium">{bill.name}</p>
        <p className="flex items-center gap-1.5 truncate text-sm text-muted-foreground">
          {logged ? (
            <span>Logged {loggedOn && formatShort(loggedOn)}</span>
          ) : (
            <>
              {status === 'overdue' && <Badge variant="secondary" className="h-5 bg-warning/15 px-1.5 text-[11px] text-warning">Overdue</Badge>}
              <span>{statusText(status, bill, ym)}</span>
            </>
          )}
          <span aria-hidden>·</span>
          <span className="truncate">{bill.paymentMode}</span>
        </p>
      </button>

      {logged ? (
        <div className="flex shrink-0 flex-col items-end">
          <span className="tabular font-heading font-semibold">{formatINR(loggedAmount ?? bill.amount)}</span>
          <button type="button" onClick={onUndo} className="flex min-h-8 items-center gap-1 text-xs font-medium text-primary hover:underline">
            <Undo2 className="size-3.5" aria-hidden /> Undo
          </button>
        </div>
      ) : check ? (
        <div className="relative w-28 shrink-0">
          <label htmlFor={amountId} className="sr-only">Amount paid for {bill.name}</label>
          <span aria-hidden className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">₹</span>
          <Input
            id={amountId}
            inputMode="decimal"
            value={String(check.amount || '')}
            onChange={(e) => onAmount(e.target.value.replace(/[^\d.]/g, ''))}
            aria-invalid={!(check.amount > 0)}
            className="tabular h-11 pl-6 text-right text-base"
          />
        </div>
      ) : (
        <span className="tabular shrink-0 font-heading font-semibold">{formatINR(bill.amount)}</span>
      )}
    </li>
  )
}

export default function BillsScreen() {
  const { bills, billsSupported, expenses, loading, logEntries, remove, demo, bootstrap } = useApp()
  const [checks, setChecks] = useChecks()
  const [editing, setEditing] = useState<Bill | 'new' | null>(null)
  const today = todayIST()
  const current = monthKey(today)
  const [ym, setYm] = useState(current)

  const active = useMemo(
    () => bills.filter((b) => b.active).sort((a, b) => (a.dueDay ?? 32) - (b.dueDay ?? 32) || a.name.localeCompare(b.name)),
    [bills],
  )
  const paused = bills.filter((b) => !b.active)
  const monthChecks = checks[ym] ?? {}
  const rows = active.map((b) => ({ bill: b, status: billStatus(b, ym, today, expenses, checks), logged: loggedEntry(b, ym, expenses) }))
  const ticked = rows.filter((r) => r.status === 'ticked')
  const tickedTotal = round2(ticked.reduce((s, r) => s + (monthChecks[r.bill.id]?.amount || 0), 0))
  const loggedTotal = round2(rows.reduce((s, r) => s + (r.logged?.amount ?? 0), 0))
  const plannedTotal = round2(active.reduce((s, b) => s + b.amount, 0))
  const left = rows.filter((r) => r.status !== 'logged').length
  const invalidTick = ticked.some((r) => !(monthChecks[r.bill.id]?.amount > 0))

  const setMonthChecks = (next: Record<string, BillCheck>) => {
    const all = { ...checks, [ym]: next }
    if (!Object.keys(next).length) delete all[ym]
    setChecks(all)
  }
  const tick = (bill: Bill, on: boolean) => {
    const next = { ...monthChecks }
    if (on) next[bill.id] = { date: today, amount: bill.amount }
    else delete next[bill.id]
    setMonthChecks(next)
  }
  const setAmount = (bill: Bill, v: string) => {
    const prev = monthChecks[bill.id]
    if (prev) setMonthChecks({ ...monthChecks, [bill.id]: { ...prev, amount: v === '' ? 0 : Number(v) } })
  }

  const logAll = async () => {
    if (invalidTick) return toast.error('Enter an amount for every ticked payment')
    const entries = ticked.map((r) => entryFor(r.bill, ym, { ...monthChecks[r.bill.id], amount: round2(monthChecks[r.bill.id].amount) }))
    await logEntries(entries)
    const next = { ...monthChecks }
    for (const r of ticked) delete next[r.bill.id]
    setMonthChecks(next)
    toast.success(`Logged ${entries.length} ${entries.length === 1 ? 'payment' : 'payments'} · ${formatINR(tickedTotal)}`, {
      description: 'Added to Daily Expense Tracker.',
    })
  }

  const undo = async (bill: Bill) => {
    await remove(billEntryId(bill.id, ym))
    toast.success(`${bill.name} is back on the list for ${formatMonth(ym)}`)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="font-heading text-2xl font-semibold">Bills</h1>
        {billsSupported && (
          <Button variant="outline" className="h-11" onClick={() => setEditing('new')}>
            <Plus aria-hidden /> Add
          </Button>
        )}
      </div>

      {!billsSupported ? (
        <Card className="border-warning/50">
          <CardContent className="flex flex-col gap-2 text-sm">
            <p className="font-medium">Update your Apps Script to use Bills</p>
            <p className="text-muted-foreground">
              Paste the latest <code>ExpenseApi.gs</code> into the Apps Script editor, then Deploy → Manage deployments → pencil → Version: New version → Deploy. The URL stays the same.
            </p>
          </CardContent>
        </Card>
      ) : loading && !bills.length ? (
        <LoadingState />
      ) : !bills.length ? (
        <EmptyState
          title="No recurring payments yet"
          hint="Add rent, subscriptions, bills, anything you pay every month. Tick them off as you pay, then log them all at once."
          action={<Button className="mt-2 h-11" onClick={() => setEditing('new')}><Plus aria-hidden /> Add a payment</Button>}
        />
      ) : (
        <>
          <PeriodPicker
            label={formatMonth(ym)}
            sub={`${formatINR(loggedTotal)} logged · ${left} of ${active.length} left`}
            onPrev={() => setYm(addMonths(ym, -1))}
            onNext={() => setYm(addMonths(ym, 1))}
            nextDisabled={ym >= current}
            onToday={() => setYm(current)}
            atCurrent={ym === current}
          />

          {!demo && bootstrap.appIdColumn === false && (
            <p role="note" className="rounded-lg bg-warning/10 px-3 py-2 text-sm text-warning">
              Run <code>setupAppIdColumn</code> in Apps Script so logged payments stay ticked after a sync.
            </p>
          )}

          <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="Logged this month" aria-valuemin={0} aria-valuemax={plannedTotal} aria-valuenow={Math.min(loggedTotal, plannedTotal)} aria-valuetext={`${formatINR(loggedTotal)} of about ${formatINR(plannedTotal)} logged`}>
            <div className="h-full rounded-full bg-success transition-[width] duration-300" style={{ width: `${plannedTotal ? Math.min(100, (loggedTotal / plannedTotal) * 100) : 0}%` }} />
          </div>

          {active.length === 0 ? (
            <EmptyState title="Everything is paused" hint="Edit a payment below to make it active again." />
          ) : (
            <ul className="flex flex-col gap-2" aria-label={`Payments for ${formatMonth(ym)}`}>
              {rows.map(({ bill, status, logged }) => (
                <BillRow
                  key={bill.id}
                  bill={bill}
                  ym={ym}
                  status={status}
                  check={monthChecks[bill.id]}
                  loggedOn={logged?.date}
                  loggedAmount={logged?.amount}
                  onTick={(on) => tick(bill, on)}
                  onAmount={(v) => setAmount(bill, v)}
                  onEdit={() => setEditing(bill)}
                  onUndo={() => void undo(bill)}
                />
              ))}
            </ul>
          )}

          {paused.length > 0 && (
            <section aria-labelledby="paused-h" className="flex flex-col gap-2">
              <h2 id="paused-h" className="px-1 text-sm font-semibold text-muted-foreground">Paused</h2>
              <ul className="flex flex-col gap-2">
                {paused.map((b) => (
                  <li key={b.id}>
                    <button type="button" onClick={() => setEditing(b)} className="flex min-h-12 w-full cursor-pointer items-center justify-between gap-2 rounded-xl border border-dashed px-4 text-left text-muted-foreground hover:bg-muted">
                      <span className="truncate">{b.name}</span>
                      <span className="flex items-center gap-2"><span className="tabular">{formatINR(b.amount)}</span><Pencil className="size-4" aria-hidden /></span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <div className="sticky bottom-20 z-10 bg-gradient-to-t from-background via-background to-transparent pt-4">
            <Button size="lg" className="h-14 w-full text-base" disabled={!ticked.length} onClick={() => void logAll()}>
              {ticked.length
                ? `Log ${ticked.length} ${ticked.length === 1 ? 'payment' : 'payments'} · ${formatINR(tickedTotal)}`
                : 'Tick what you paid, then log'}
            </Button>
          </div>
        </>
      )}

      <BillDialog bill={editing} onClose={() => setEditing(null)} />
    </div>
  )
}
