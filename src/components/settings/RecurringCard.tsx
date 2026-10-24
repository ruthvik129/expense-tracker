import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Chip } from '@/components/Chip'
import { useApp } from '@/data/store'
import { useSettings } from '@/data/settings'
import { savingCategory } from '@/lib/recurring'
import { matchMode } from '@/lib/paymentModes'

export function RecurringCard() {
  const { settings, update } = useSettings()
  const { bootstrap, demo } = useApp()
  const r = settings.recurring
  const savingCats = bootstrap.categories.filter((c) => c.type === 'Saving')
  const [enabled, setEnabled] = useState(r.enabled)
  const [amount, setAmount] = useState(r.amount ? String(r.amount) : '')
  const [day, setDay] = useState(String(r.day))
  const [description, setDescription] = useState(r.description)
  const [category, setCategory] = useState(savingCategory(r, bootstrap.categories) ?? '')
  const [mode, setMode] = useState(matchMode(r.paymentMode, bootstrap.paymentModes) ?? r.paymentMode)
  const [showErr, setShowErr] = useState(false)

  const amt = Number(amount)
  const d = Number(day)
  const errors = {
    amount: enabled && !(amt > 0) ? 'Enter the amount you save each month' : null,
    day: !Number.isInteger(d) || d < 1 || d > 28 ? 'Pick a day from 1 to 28' : null,
    category: enabled && !category ? 'Your Setup tab has no Saving-type category' : null,
  }
  const invalid = Object.values(errors).some(Boolean)

  const save = () => {
    if (invalid) return setShowErr(true)
    setShowErr(false)
    update({ recurring: { enabled, amount: amt || 0, day: d, description: description.trim() || 'Monthly saving', category, paymentMode: mode } })
    toast.success(enabled ? `Recurring saving on day ${d} of each month` : 'Recurring saving turned off')
  }
  const err = (m: string | null) => showErr && m && <p role="alert" className="text-sm text-destructive">{m}</p>

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-heading text-base">Recurring saving</CardTitle>
        <CardDescription>
          Adds a Saving entry automatically every month. If you skip a month, delete that entry in History. It won't come back.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="flex flex-col gap-5" onSubmit={(e) => { e.preventDefault(); save() }} noValidate>
          <div className="flex min-h-11 items-center justify-between gap-4">
            <Label htmlFor="rec-on">Add it every month</Label>
            <Switch id="rec-on" checked={enabled} onCheckedChange={setEnabled} />
          </div>
          {enabled && (
            <>
              <div className="grid grid-cols-[1fr_7rem] gap-3">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="rec-amt">Amount</Label>
                  <div className="relative">
                    <span aria-hidden className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground">₹</span>
                    <Input id="rec-amt" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} aria-invalid={showErr && !!errors.amount} className="tabular h-12 pl-8 text-base" />
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="rec-day">Day of month</Label>
                  <Input id="rec-day" inputMode="numeric" value={day} onChange={(e) => setDay(e.target.value.replace(/\D/g, ''))} aria-invalid={showErr && !!errors.day} className="tabular h-12 text-base" />
                </div>
              </div>
              {err(errors.amount)}
              {err(errors.day)}
              <div className="flex flex-col gap-2">
                <Label htmlFor="rec-desc">Description</Label>
                <Input id="rec-desc" value={description} onChange={(e) => setDescription(e.target.value)} className="h-12 text-base" />
              </div>
              {savingCats.length > 1 && (
                <fieldset className="flex flex-col gap-2">
                  <legend className="mb-1 text-sm font-medium">Category</legend>
                  <div className="flex flex-wrap gap-2">
                    {savingCats.map((c) => <Chip key={c.name} selected={category === c.name} onClick={() => setCategory(c.name)}>{c.name}</Chip>)}
                  </div>
                </fieldset>
              )}
              {err(errors.category)}
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-1 text-sm font-medium">Paid with</legend>
                <div className="flex flex-wrap gap-2">
                  {bootstrap.paymentModes.map((m) => <Chip key={m} selected={mode === m} onClick={() => setMode(m)}>{m}</Chip>)}
                </div>
              </fieldset>
              <p className="text-sm text-muted-foreground">
                Saved as {category || 'a Saving category'}, dated day {d || '?'} of the month. If that day has already passed this month, it is added as soon as you save.
                {demo && ' Starts once your sheet is connected.'}
              </p>
            </>
          )}
          <Button type="submit" className="h-11">Save recurring saving</Button>
        </form>
      </CardContent>
    </Card>
  )
}
