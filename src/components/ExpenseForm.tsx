import { useEffect, useMemo, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Chip } from '@/components/Chip'
import { useApp, type NewExpense } from '@/data/store'
import { todayIST } from '@/lib/dates'
import { parseEntry } from '@/lib/parser'
import { matchMode } from '@/lib/paymentModes'
import { useSettings } from '@/data/settings'
import { CONFIDENCE_THRESHOLD, nullPredictor, type CategoryPredictor } from '@/lib/predictor'
import { formatINR } from '@/lib/format'
import { Sparkles } from 'lucide-react'

export interface FormState {
  amount: string
  description: string
  category: string
  paymentMode: string
  date: string
  notes: string
}

export const emptyForm = (paymentMode: string): FormState => ({
  amount: '',
  description: '',
  category: '',
  paymentMode,
  date: todayIST(),
  notes: '',
})

export const toForm = (e: NewExpense): FormState => ({
  amount: String(e.amount),
  description: e.description,
  category: e.category,
  paymentMode: e.paymentMode,
  date: e.date,
  notes: e.notes,
})

export function validate(f: FormState, modes: string[] = []) {
  const amount = Number(f.amount)
  const errors: Partial<Record<keyof FormState, string>> = {}
  if (!f.amount || !Number.isFinite(amount) || amount <= 0) errors.amount = 'Enter an amount above 0'
  else if (Math.round(amount * 100) / 100 !== amount) errors.amount = 'Use at most 2 decimals'
  if (!f.description.trim()) errors.description = 'Add a short description'
  if (!f.category) errors.category = 'Pick a category'
  if (!f.date) errors.date = 'Pick a date'
  if (modes.length && !modes.includes(f.paymentMode)) errors.paymentMode = 'Pick how you paid'
  return errors
}

export function formToExpense(f: FormState): NewExpense {
  return {
    amount: Number(f.amount),
    description: f.description.trim(),
    category: f.category,
    paymentMode: f.paymentMode,
    date: f.date,
    notes: f.notes.trim(),
  }
}

interface Props {
  value: FormState
  onChange: (next: FormState) => void
  showErrors: boolean
  /** Show the one-line quick entry above the fields. */
  quick?: boolean
  predictor?: CategoryPredictor
}

export function ExpenseForm({ value, onChange, showErrors, quick, predictor = nullPredictor }: Props) {
  const { bootstrap } = useApp()
  const { settings } = useSettings()
  const [line, setLine] = useState('')
  const [suggested, setSuggested] = useState<string[]>([])
  // True while the category on screen came from the predictor rather than a tap.
  const [autoCategory, setAutoCategory] = useState(false)
  const errors = useMemo(
    () => (showErrors ? validate(value, bootstrap.paymentModes) : {}),
    [value, showErrors, bootstrap.paymentModes],
  )
  const set = (patch: Partial<FormState>) => onChange({ ...value, ...patch })

  // The Setup list can arrive after the form opened, spelled differently ("GPay / UPI").
  // Re-point the selected mode at the sheet's own name. On Add, fall back to the default
  // mode, then the first one. On Edit, never swap the user's data for a guess.
  useEffect(() => {
    const modes = bootstrap.paymentModes
    if (!modes.length || modes.includes(value.paymentMode)) return
    const next =
      matchMode(value.paymentMode, modes) ??
      (quick ? (matchMode(settings.defaultMode, modes) ?? modes[0]) : undefined)
    if (next) onChange({ ...value, paymentMode: next })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bootstrap.paymentModes, value.paymentMode])

  // Ask the predictor as the description changes. Confident: fill it in. Unsure: suggest the
  // top 3 and leave none selected. A category the user tapped is never overwritten.
  useEffect(() => {
    let live = true
    const text = value.description.trim()
    if (text.length < 2) {
      setSuggested([])
      if (autoCategory && value.category) onChange({ ...value, category: '' })
      return
    }
    predictor.predict(text).then((r) => {
      if (!live) return
      const top = r[0]
      const sure = !!top && top.confidence >= CONFIDENCE_THRESHOLD
      setSuggested(sure ? [] : r.slice(0, 3).map((x) => x.category))
      if (value.category && !autoCategory) return
      const next = sure ? top.category : ''
      if (next !== value.category) onChange({ ...value, category: next })
      setAutoCategory(sure)
    })
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.description])

  const onLine = (text: string) => {
    setLine(text)
    const p = parseEntry(text)
    const mode = matchMode(p.paymentMode, bootstrap.paymentModes)
    onChange({
      ...value,
      amount: p.amount !== undefined ? String(p.amount) : value.amount,
      paymentMode: mode ?? value.paymentMode,
      date: p.date ?? value.date,
      description: p.description || value.description,
      notes: p.notes ?? value.notes,
    })
  }

  const field = 'flex flex-col gap-2'
  const errCls = 'text-sm text-destructive'

  return (
    <div className="flex flex-col gap-5">
      {quick && (
        <div className={field}>
          <Label htmlFor="quick" className="flex items-center gap-1.5">
            <Sparkles className="size-4 text-primary" aria-hidden /> Quick entry
          </Label>
          <Input
            id="quick"
            value={line}
            onChange={(e) => onLine(e.target.value)}
            placeholder="uber 450 upi yesterday"
            autoCapitalize="none"
            autoComplete="off"
            enterKeyHint="done"
            className="h-12 text-base"
          />
          <p className="text-sm text-muted-foreground">Amount, mode, date and category are filled in for you. Add notes after <kbd className="rounded bg-muted px-1">//</kbd>.</p>
        </div>
      )}

      <div className={field}>
        <Label htmlFor="amount">Amount</Label>
        <div className="relative">
          <span aria-hidden className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl text-muted-foreground">₹</span>
          <Input
            id="amount"
            inputMode="decimal"
            value={value.amount}
            onChange={(e) => set({ amount: e.target.value.replace(/[^\d.]/g, '') })}
            placeholder="0"
            aria-invalid={!!errors.amount}
            aria-describedby={errors.amount ? 'amount-err' : undefined}
            className="tabular h-14 pl-10 font-heading text-3xl font-semibold md:text-3xl"
          />
        </div>
        {errors.amount && <p id="amount-err" role="alert" className={errCls}>{errors.amount}</p>}
        {Number(value.amount) > 0 && !errors.amount && (
          <p className="tabular text-sm text-muted-foreground">{formatINR(Number(value.amount))}</p>
        )}
      </div>

      <div className={field}>
        <Label htmlFor="desc">Description</Label>
        <Input
          id="desc"
          value={value.description}
          onChange={(e) => set({ description: e.target.value })}
          placeholder="Uber late night"
          aria-invalid={!!errors.description}
          autoComplete="off"
          className="h-12 text-base"
        />
        {errors.description && <p role="alert" className={errCls}>{errors.description}</p>}
      </div>

      <fieldset className={field}>
        <legend className="mb-1 text-sm font-medium">
          Category
          {autoCategory && value.category && <span className="ml-2 font-normal text-muted-foreground">guessed from your history</span>}
          {!value.category && suggested.length > 0 && <span className="ml-2 font-normal text-muted-foreground">not sure, pick one</span>}
        </legend>
        <div className="flex flex-wrap gap-2">
          {[...bootstrap.categories]
            .sort((a, b) => Number(suggested.includes(b.name)) - Number(suggested.includes(a.name)))
            .map((c) => (
              <Chip
                key={c.name}
                selected={value.category === c.name}
                onClick={() => {
                  setAutoCategory(false)
                  set({ category: c.name })
                }}
                className={!value.category && suggested.includes(c.name) ? 'border-primary/60 ring-2 ring-primary/20' : undefined}
              >
                {!value.category && suggested.includes(c.name) && (
                  <Sparkles className="mr-1 inline size-3.5 text-primary" aria-label="Suggested" />
                )}
                {c.name}
                <span className="ml-1.5 text-xs opacity-70">{c.type}</span>
              </Chip>
            ))}
        </div>
        {errors.category && <p role="alert" className={errCls}>{errors.category}</p>}
      </fieldset>

      <fieldset className={field}>
        <legend className="mb-1 text-sm font-medium">Paid with</legend>
        <div className="flex flex-wrap gap-2">
          {bootstrap.paymentModes.map((m) => (
            <Chip key={m} selected={value.paymentMode === m} onClick={() => set({ paymentMode: m })}>
              {m}
            </Chip>
          ))}
        </div>
        {errors.paymentMode && <p role="alert" className={errCls}>{errors.paymentMode}</p>}
      </fieldset>

      <div className="grid grid-cols-2 gap-3 max-[360px]:grid-cols-1">
        <div className={field}>
          <Label htmlFor="date">Date</Label>
          <Input
            id="date"
            type="date"
            value={value.date}
            max={todayIST()}
            onChange={(e) => set({ date: e.target.value })}
            aria-invalid={!!errors.date}
            className="h-12 text-base"
          />
          {errors.date && <p role="alert" className={errCls}>{errors.date}</p>}
        </div>
        <div className={field}>
          <Label htmlFor="notes">Notes <span className="font-normal text-muted-foreground">(optional)</span></Label>
          <Input id="notes" value={value.notes} onChange={(e) => set({ notes: e.target.value })} className="h-12 text-base" />
        </div>
      </div>
    </div>
  )
}
