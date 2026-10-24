import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ExpenseForm, emptyForm, formToExpense, validate, type FormState } from '@/components/ExpenseForm'
import { ExpenseRow } from '@/components/ExpenseRow'
import { EmptyState } from '@/components/states'
import { useApp } from '@/data/store'
import { useSettings } from '@/data/settings'
import { relativeDay } from '@/lib/dates'
import { formatINR } from '@/lib/format'
import { RulesPredictor } from '@/lib/predictor'
import { matchMode } from '@/lib/paymentModes'

export default function AddScreen() {
  const { add, expenses, bootstrap } = useApp()
  const { settings, update } = useSettings()
  const defaultMode = matchMode(settings.defaultMode, bootstrap.paymentModes) ?? bootstrap.paymentModes[0]
  const [form, setForm] = useState<FormState>(() => emptyForm(defaultMode))
  const [showErrors, setShowErrors] = useState(false)
  const [formKey, setFormKey] = useState(0)

  // The sheet's history is the training data; rebuilt whenever it changes.
  const predictor = useMemo(
    () => new RulesPredictor(expenses, bootstrap.categories.map((c) => c.name)),
    [expenses, bootstrap.categories],
  )

  const recent = useMemo(
    () => [...expenses].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)).slice(0, 5),
    [expenses],
  )

  const save = async () => {
    if (Object.keys(validate(form, bootstrap.paymentModes)).length) {
      setShowErrors(true)
      return
    }
    const entry = formToExpense(form)
    await add(entry)
    // Last-used mode becomes the next default.
    if (entry.paymentMode !== settings.defaultMode) update({ defaultMode: entry.paymentMode })
    toast.success(`Saved ${formatINR(entry.amount)} · ${entry.description}`, { icon: <Check className="size-4" /> })
    setForm(emptyForm(entry.paymentMode))
    setShowErrors(false)
    setFormKey((k) => k + 1)
  }

  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="add-h">
        <h1 id="add-h" className="mb-4 font-heading text-2xl font-semibold">Add expense</h1>
        <form
          key={formKey}
          onSubmit={(e) => {
            e.preventDefault()
            void save()
          }}
          noValidate
        >
          <ExpenseForm value={form} onChange={setForm} showErrors={showErrors} quick predictor={predictor} />
          <div className="sticky bottom-20 z-10 mt-6 bg-gradient-to-t from-background via-background to-transparent pt-4">
            <Button type="submit" size="lg" className="h-14 w-full text-base">
              Save expense
            </Button>
          </div>
        </form>
      </section>

      <section aria-labelledby="recent-h" className="flex flex-col gap-2">
        <h2 id="recent-h" className="font-heading text-lg font-semibold">Recent</h2>
        {recent.length === 0 ? (
          <EmptyState title="No entries yet" hint="Your first expense will show up here." />
        ) : (
          recent.map((e) => (
            <div key={e.id}>
              <p className="mb-1 px-1 text-xs text-muted-foreground">{relativeDay(e.date)}</p>
              <ExpenseRow e={e} />
            </div>
          ))
        )}
      </section>
    </div>
  )
}
