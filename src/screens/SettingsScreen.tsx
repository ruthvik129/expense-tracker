import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Download, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Chip } from '@/components/Chip'
import { BudgetCard } from '@/components/settings/BudgetCard'
import { RecurringCard } from '@/components/settings/RecurringCard'
import { useApp } from '@/data/store'
import { useSettings } from '@/data/settings'
import { toCsv } from '@/lib/csv'
import { todayIST } from '@/lib/dates'
import { evaluate } from '@/lib/predictor'
import { matchMode } from '@/lib/paymentModes'

export default function SettingsScreen() {
  const { settings, update } = useSettings()
  const { bootstrap, demo, refresh, syncing, expenses, failed, retryFailed, discardFailed, lastSync, online } = useApp()
  const [url, setUrl] = useState(settings.scriptUrl)
  const [token, setToken] = useState(settings.token)
  const [urlErr, setUrlErr] = useState('')
  // Measured on this device's cached history: each entry guessed from all the others.
  const accuracy = useMemo(
    () => (expenses.length >= 20 ? evaluate(expenses, bootstrap.categories.map((c) => c.name)) : null),
    [expenses, bootstrap.categories],
  )
  const dirty = url !== settings.scriptUrl || token !== settings.token

  const saveConnection = () => {
    const u = url.trim()
    if (u) {
      try {
        const parsed = new URL(u)
        if (parsed.protocol !== 'https:') throw new Error()
      } catch {
        return setUrlErr('Enter the full https:// web-app URL from Apps Script')
      }
    }
    setUrlErr('')
    update({ scriptUrl: u, token: token.trim() })
    toast.success(u && token.trim() ? 'Connection saved. Syncing…' : 'Cleared. Back to demo data.')
  }

  const exportCsv = () => {
    const blob = new Blob([toCsv(expenses)], { type: 'text/csv;charset=utf-8' })
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `expenses-${todayIST()}.csv` })
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }

  const row = 'flex flex-col gap-2'
  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-heading text-2xl font-semibold">Settings</h1>

      {failed.length > 0 && (
        <Card className="border-destructive/50">
          <CardHeader><CardTitle className="font-heading text-base text-destructive">{failed.length} change(s) not synced</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-3">
            {failed.map((op) => (
              <div key={op.seq} className="flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0 truncate">{op.kind} · {op.expense?.description ?? op.id.slice(0, 8)} · <code>{op.error}</code></span>
                <Button size="sm" variant="ghost" className="h-9" onClick={() => void discardFailed(op.seq!)}>Discard</Button>
              </div>
            ))}
            <Button className="h-11" onClick={() => void retryFailed()}>Retry all</Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="font-heading text-base">Google Sheet connection</CardTitle></CardHeader>
        <CardContent>
          <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); saveConnection() }}>
            <div className={row}>
              <Label htmlFor="url">Apps Script web-app URL</Label>
              <Input id="url" type="url" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://script.google.com/macros/s/…/exec" aria-invalid={!!urlErr} autoComplete="off" className="h-12 text-base" />
              {urlErr && <p role="alert" className="text-sm text-destructive">{urlErr}</p>}
            </div>
            <div className={row}>
              <Label htmlFor="token">Shared secret</Label>
              <Input id="token" type="password" value={token} onChange={(e) => setToken(e.target.value)} autoComplete="off" className="h-12 text-base" />
              <p className="text-sm text-muted-foreground">Stored only on this device.</p>
            </div>
            <Button type="submit" className="h-11" disabled={!dirty}>Save connection</Button>
            <p className="text-sm text-muted-foreground">
              {demo ? 'Not connected. Showing demo data that resets on reload.' : online ? 'Connected to your sheet.' : 'Offline. Changes will sync later.'}
              {lastSync && !demo && ` Last synced ${new Date(lastSync).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}.`}
            </p>
          </form>
        </CardContent>
      </Card>

      <BudgetCard />
      <RecurringCard />

      <Card>
        <CardHeader><CardTitle className="font-heading text-base">Preferences</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-5">
          <fieldset className={row}>
            <legend className="mb-1 text-sm font-medium">Week starts on</legend>
            <div className="flex gap-2">
              <Chip selected={settings.weekStart === 'mon'} onClick={() => update({ weekStart: 'mon' })}>Monday</Chip>
              <Chip selected={settings.weekStart === 'sun'} onClick={() => update({ weekStart: 'sun' })}>Sunday</Chip>
            </div>
          </fieldset>
          <fieldset className={row}>
            <legend className="mb-1 text-sm font-medium">Default payment mode</legend>
            <div className="flex flex-wrap gap-2">
              {bootstrap.paymentModes.map((m) => (
                <Chip key={m} selected={matchMode(settings.defaultMode, bootstrap.paymentModes) === m} onClick={() => update({ defaultMode: m })}>{m}</Chip>
              ))}
            </div>
          </fieldset>
          <fieldset className={row}>
            <legend className="mb-1 text-sm font-medium">Theme</legend>
            <div className="flex gap-2">
              {(['system', 'light', 'dark'] as const).map((t) => (
                <Chip key={t} selected={settings.theme === t} onClick={() => update({ theme: t })} className="capitalize">{t}</Chip>
              ))}
            </div>
          </fieldset>
          <div className="flex min-h-11 items-center justify-between gap-4">
            <div>
              <Label htmlFor="sav">Count Savings in weekly limit</Label>
              <p className="text-sm text-muted-foreground">Off: the limit tracks Needs + Wants only.</p>
            </div>
            <Switch id="sav" checked={settings.weeklyCountsSavings} onCheckedChange={(v) => update({ weeklyCountsSavings: v })} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="font-heading text-base">Data</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Button variant="outline" className="h-11 justify-start" disabled={syncing} onClick={() => void refresh().then(() => toast.success('Setup lists refreshed'))}>
            <RefreshCw className={syncing ? 'animate-spin' : ''} aria-hidden /> Refresh Setup lists &amp; data
          </Button>
          <Button variant="outline" className="h-11 justify-start" disabled={!expenses.length} onClick={exportCsv}>
            <Download aria-hidden /> Export {expenses.length} entries as CSV
          </Button>
          <p className="text-sm text-muted-foreground">Categories and payment modes are read from your sheet's Setup tab. Edit them there.</p>
          <div className="rounded-lg bg-muted p-3 text-sm">
            <p className="font-medium">Category guessing</p>
            {accuracy ? (
              <p className="tabular text-muted-foreground">
                Right {Math.round(accuracy.top1 * 100)}% of the time on your last {accuracy.total} entries
                {demo && ' (demo data)'}. It auto-fills only when sure ({accuracy.autoFilled} of {accuracy.total}) and asks otherwise.
              </p>
            ) : (
              <p className="text-muted-foreground">Learns from your entries. Needs about 20 before it can be measured.</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
