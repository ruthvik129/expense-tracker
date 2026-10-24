import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Search, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ExpenseForm, formToExpense, toForm, validate, type FormState } from '@/components/ExpenseForm'
import { ExpenseRow } from '@/components/ExpenseRow'
import { EmptyState, ErrorState, LoadingState } from '@/components/states'
import { useApp } from '@/data/store'
import { relativeDay } from '@/lib/dates'
import { formatINR } from '@/lib/format'
import { total } from '@/lib/aggregate'
import type { Expense } from '@/lib/types'

const ALL = 'all'

function Filter({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v ?? ALL)}>
      <SelectTrigger aria-label={label} className="h-11 min-w-0 flex-1 text-sm">
        <SelectValue>{value === ALL ? label : value}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{label}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o} value={o}>{o}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function EditDialog({ entry, onClose }: { entry: Expense | null; onClose: () => void }) {
  const { update, bootstrap } = useApp()
  const [form, setForm] = useState<FormState | null>(null)
  const [showErrors, setShowErrors] = useState(false)
  const [seen, setSeen] = useState<string | null>(null)
  if (entry && seen !== entry.id) {
    setSeen(entry.id)
    setForm(toForm(entry))
    setShowErrors(false)
  }

  const save = async () => {
    if (!entry || !form) return
    if (Object.keys(validate(form, bootstrap.paymentModes)).length) return setShowErrors(true)
    await update(entry.id, formToExpense(form))
    toast.success('Entry updated')
    onClose()
  }

  return (
    <Dialog open={!!entry} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit expense</DialogTitle>
          <DialogDescription>Changes sync to your sheet.</DialogDescription>
        </DialogHeader>
        {form && <ExpenseForm value={form} onChange={setForm} showErrors={showErrors} />}
        <DialogFooter>
          <Button variant="outline" className="h-11" onClick={onClose}>Cancel</Button>
          <Button className="h-11" onClick={() => void save()}>Save changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default function HistoryScreen() {
  const { expenses, bootstrap, loading, loadError, refresh, remove } = useApp()
  const [q, setQ] = useState('')
  const [cat, setCat] = useState(ALL)
  const [mode, setMode] = useState(ALL)
  const [type, setType] = useState(ALL)
  const [editing, setEditing] = useState<Expense | null>(null)
  const [deleting, setDeleting] = useState<Expense | null>(null)

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return expenses
      .filter((e) => cat === ALL || e.category === cat)
      .filter((e) => mode === ALL || e.paymentMode === mode)
      .filter((e) => type === ALL || e.type === type)
      .filter((e) => !needle || `${e.description} ${e.notes} ${e.category}`.toLowerCase().includes(needle))
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
  }, [expenses, q, cat, mode, type])

  const groups = useMemo(() => {
    const m = new Map<string, Expense[]>()
    for (const e of filtered) m.set(e.date, [...(m.get(e.date) ?? []), e])
    return [...m.entries()]
  }, [filtered])

  const filtering = q || cat !== ALL || mode !== ALL || type !== ALL
  const clear = () => { setQ(''); setCat(ALL); setMode(ALL); setType(ALL) }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-heading text-2xl font-semibold">History</h1>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search description or notes"
          aria-label="Search entries"
          className="h-11 pl-9 text-base"
        />
      </div>
      <div className="flex gap-2">
        <Filter label="Category" value={cat} onChange={setCat} options={bootstrap.categories.map((c) => c.name)} />
        <Filter label="Mode" value={mode} onChange={setMode} options={bootstrap.paymentModes} />
        <Filter label="Type" value={type} onChange={setType} options={['Need', 'Want', 'Saving']} />
      </div>
      {filtering && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span className="tabular">{filtered.length} entries · {formatINR(total(filtered))}</span>
          <Button variant="ghost" size="sm" onClick={clear} className="h-9"><X className="size-4" aria-hidden /> Clear</Button>
        </div>
      )}

      {loadError && expenses.length === 0 ? (
        <ErrorState message={loadError} onRetry={() => void refresh()} />
      ) : loading && expenses.length === 0 ? (
        <LoadingState />
      ) : groups.length === 0 ? (
        <EmptyState
          title={filtering ? 'Nothing matches' : 'No expenses yet'}
          hint={filtering ? 'Try a different search or clear the filters.' : 'Add your first one from the Add tab.'}
          action={filtering ? <Button variant="outline" onClick={clear}>Clear filters</Button> : undefined}
        />
      ) : (
        <div className="flex flex-col gap-5">
          {groups.map(([date, list]) => (
            <section key={date} aria-label={relativeDay(date)} className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between px-1">
                <h2 className="font-heading text-sm font-semibold">{relativeDay(date)}</h2>
                <span className="tabular text-sm text-muted-foreground">{formatINR(total(list))}</span>
              </div>
              {list.map((e) => (
                <div key={e.id} className="flex items-stretch gap-2">
                  <div className="min-w-0 flex-1">
                    <ExpenseRow e={e} onClick={() => setEditing(e)} />
                  </div>
                  <Button variant="ghost" size="icon" className="size-auto min-h-16 w-11 text-muted-foreground hover:text-destructive" aria-label={`Delete ${e.description}`} onClick={() => setDeleting(e)}>
                    <Trash2 aria-hidden />
                  </Button>
                </div>
              ))}
            </section>
          ))}
        </div>
      )}

      <EditDialog entry={editing} onClose={() => setEditing(null)} />
      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this expense?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting && `${deleting.description} · ${formatINR(deleting.amount)} on ${relativeDay(deleting.date)} will be removed from your sheet.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-11">Keep it</AlertDialogCancel>
            <AlertDialogAction
              className="h-11 bg-destructive text-white hover:bg-destructive/90"
              onClick={() => { if (deleting) { void remove(deleting.id); toast.success('Entry deleted') } setDeleting(null) }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
