import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Chip } from '@/components/Chip'
import { useSettings } from '@/data/settings'
import { budgetsFor, DEFAULT_SPLIT, isDefaultSplit, splitError, type Split } from '@/lib/budget'
import { formatINR } from '@/lib/format'

const num = (s: string) => (s.trim() === '' ? NaN : Number(s))

export function BudgetCard() {
  const { settings, update } = useSettings()
  const [salary, setSalary] = useState(settings.salary ? String(settings.salary) : '')
  const [custom, setCustom] = useState(!isDefaultSplit(settings.split))
  const [pct, setPct] = useState({
    needs: String(settings.split.needs),
    wants: String(settings.split.wants),
    savings: String(settings.split.savings),
  })
  const [showErr, setShowErr] = useState(false)

  const split: Split = custom ? { needs: num(pct.needs), wants: num(pct.wants), savings: num(pct.savings) } : DEFAULT_SPLIT
  const sal = salary.trim() === '' ? 0 : Number(salary)
  const salErr = !Number.isFinite(sal) || sal < 0 ? 'Enter your monthly salary in rupees' : null
  const err = salErr ?? splitError(split)
  const preview = !err && sal > 0 ? budgetsFor(sal, split, [], 0)[0] : null

  const save = () => {
    if (err) return setShowErr(true)
    setShowErr(false)
    update({ salary: sal, split })
    toast.success(sal > 0 ? 'Budget saved' : 'Using the yearly table from your sheet')
  }

  const pctField = (key: keyof typeof pct, label: string) => (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={`pct-${key}`}>{label} %</Label>
      <Input
        id={`pct-${key}`}
        inputMode="decimal"
        value={pct[key]}
        onChange={(e) => setPct({ ...pct, [key]: e.target.value.replace(/[^\d.]/g, '') })}
        className="tabular h-12 text-base"
      />
    </div>
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-heading text-base">Monthly budget</CardTitle>
        <CardDescription>Drives the Needs, Wants and Savings bars on the Monthly screen.</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="flex flex-col gap-5" onSubmit={(e) => { e.preventDefault(); save() }} noValidate>
          <div className="flex flex-col gap-2">
            <Label htmlFor="salary">Monthly salary</Label>
            <div className="relative">
              <span aria-hidden className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground">₹</span>
              <Input id="salary" inputMode="decimal" value={salary} onChange={(e) => setSalary(e.target.value.replace(/[^\d.]/g, ''))} placeholder="Use sheet's Setup tab" className="tabular h-12 pl-8 text-base" />
            </div>
            <p className="text-sm text-muted-foreground">Leave empty to use the yearly table in your sheet's Setup tab.</p>
          </div>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium">Split</legend>
            <div className="flex gap-2">
              <Chip selected={!custom} onClick={() => setCustom(false)}>50 : 30 : 20</Chip>
              <Chip selected={custom} onClick={() => setCustom(true)}>Custom</Chip>
            </div>
            {custom && (
              <div className="mt-2 grid grid-cols-3 gap-2">
                {pctField('needs', 'Needs')}
                {pctField('wants', 'Wants')}
                {pctField('savings', 'Savings')}
              </div>
            )}
          </fieldset>

          {showErr && err && <p role="alert" className="text-sm text-destructive">{err}</p>}
          {preview && (
            <dl className="tabular grid grid-cols-3 gap-2 rounded-lg bg-muted p-3 text-center text-sm">
              {([['Needs', preview.needs], ['Wants', preview.wants], ['Savings', preview.savings]] as const).map(([k, v]) => (
                <div key={k}>
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="font-semibold">{formatINR(v)}</dd>
                </div>
              ))}
            </dl>
          )}
          <Button type="submit" className="h-11">Save budget</Button>
        </form>
      </CardContent>
    </Card>
  )
}
