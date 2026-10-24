import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Chip } from '@/components/Chip'
import { useApp } from '@/data/store'
import type { Bill } from '@/lib/bills'
import { matchMode } from '@/lib/paymentModes'

interface Props {
  /** The bill to edit, `'new'` to add one, or null when closed. */
  bill: Bill | 'new' | null
  onClose: () => void
}

export function BillDialog({ bill, onClose }: Props) {
  const { bootstrap, saveBill, deleteBill } = useApp()
  const editing = bill && bill !== 'new' ? bill : null
  const [seen, setSeen] = useState<Props['bill']>(null)
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState('')
  const [mode, setMode] = useState('')
  const [due, setDue] = useState('')
  const [active, setActive] = useState(true)
  const [showErr, setShowErr] = useState(false)
  const [busy, setBusy] = useState(false)
  const [serverErr, setServerErr] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)

  // Load the form whenever a different bill is opened.
  if (bill !== seen) {
    setSeen(bill)
    setName(editing?.name ?? '')
    setAmount(editing ? String(editing.amount) : '')
    setCategory(editing?.category ?? '')
    setMode(editing ? (matchMode(editing.paymentMode, bootstrap.paymentModes) ?? editing.paymentMode) : (bootstrap.paymentModes[0] ?? ''))
    setDue(editing?.dueDay ? String(editing.dueDay) : '')
    setActive(editing?.active ?? true)
    setShowErr(false)
    setServerErr('')
  }

  const amt = Number(amount)
  const dueNum = due.trim() === '' ? null : Number(due)
  const errors = {
    name: !name.trim() ? 'Give it a name' : null,
    amount: !(amt > 0) ? 'Enter the usual amount' : Math.round(amt * 100) / 100 !== amt ? 'Use at most 2 decimals' : null,
    category: !bootstrap.categories.some((c) => c.name === category) ? 'Pick a category' : null,
    mode: !bootstrap.paymentModes.includes(mode) ? 'Pick how you pay it' : null,
    due: dueNum !== null && !(Number.isInteger(dueNum) && dueNum >= 1 && dueNum <= 31) ? 'Day of month, 1 to 31' : null,
  }
  const err = (m: string | null) => showErr && m && <p role="alert" className="text-sm text-destructive">{m}</p>

  const save = async () => {
    if (Object.values(errors).some(Boolean)) return setShowErr(true)
    setBusy(true)
    setServerErr('')
    try {
      await saveBill({
        id: editing?.id ?? crypto.randomUUID(),
        name: name.trim(),
        amount: amt,
        category,
        paymentMode: mode,
        dueDay: dueNum,
        active,
      })
      toast.success(editing ? 'Bill updated' : `Added ${name.trim()}`)
      onClose()
    } catch (e) {
      setServerErr(e instanceof Error ? e.message : 'Could not save')
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!editing) return
    setBusy(true)
    try {
      await deleteBill(editing.id)
      toast.success(`Removed ${editing.name}. Payments already logged stay in your sheet.`)
      setConfirmDelete(false)
      onClose()
    } catch (e) {
      setConfirmDelete(false)
      setServerErr(e instanceof Error ? e.message : 'Could not remove')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Dialog open={!!bill} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit payment' : 'New recurring payment'}</DialogTitle>
            <DialogDescription>Saved to the Recurring Payments tab of your sheet.</DialogDescription>
          </DialogHeader>
          <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); void save() }} noValidate>
            <div className="flex flex-col gap-2">
              <Label htmlFor="bill-name">Name</Label>
              <Input id="bill-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Rent" aria-invalid={showErr && !!errors.name} className="h-12 text-base" />
              {err(errors.name)}
            </div>
            <div className="grid grid-cols-[1fr_7rem] gap-3">
              <div className="flex flex-col gap-2">
                <Label htmlFor="bill-amt">Usual amount</Label>
                <div className="relative">
                  <span aria-hidden className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground">₹</span>
                  <Input id="bill-amt" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} aria-invalid={showErr && !!errors.amount} className="tabular h-12 pl-8 text-base" />
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="bill-due">Due day</Label>
                <Input id="bill-due" inputMode="numeric" value={due} onChange={(e) => setDue(e.target.value.replace(/\D/g, ''))} placeholder="Any" aria-invalid={showErr && !!errors.due} className="tabular h-12 text-base" />
              </div>
            </div>
            {err(errors.amount)}
            {err(errors.due)}
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-medium">Category</legend>
              <div className="flex flex-wrap gap-2">
                {bootstrap.categories.map((c) => (
                  <Chip key={c.name} selected={category === c.name} onClick={() => setCategory(c.name)}>
                    {c.name}<span className="ml-1.5 text-xs opacity-70">{c.type}</span>
                  </Chip>
                ))}
              </div>
              {err(errors.category)}
            </fieldset>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-medium">Paid with</legend>
              <div className="flex flex-wrap gap-2">
                {bootstrap.paymentModes.map((m) => <Chip key={m} selected={mode === m} onClick={() => setMode(m)}>{m}</Chip>)}
              </div>
              {err(errors.mode)}
            </fieldset>
            <div className="flex min-h-11 items-center justify-between gap-4">
              <div>
                <Label htmlFor="bill-active">Active</Label>
                <p className="text-sm text-muted-foreground">Paused payments stay listed but aren't counted as due.</p>
              </div>
              <Switch id="bill-active" checked={active} onCheckedChange={setActive} />
            </div>
            {serverErr && <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{serverErr}</p>}
            <DialogFooter className="gap-2">
              {editing && (
                <Button type="button" variant="ghost" className="h-11 text-destructive hover:text-destructive sm:mr-auto" onClick={() => setConfirmDelete(true)} disabled={busy}>
                  Remove
                </Button>
              )}
              <Button type="button" variant="outline" className="h-11" onClick={onClose}>Cancel</Button>
              <Button type="submit" className="h-11" disabled={busy}>{busy ? 'Saving…' : 'Save'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {editing?.name}?</AlertDialogTitle>
            <AlertDialogDescription>It leaves your checklist and the Recurring Payments tab. Payments you already logged stay in Daily Expense Tracker.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-11">Keep it</AlertDialogCancel>
            <AlertDialogAction className="h-11 bg-destructive text-white hover:bg-destructive/90" onClick={() => void remove()}>Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
