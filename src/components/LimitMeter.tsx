import { limitState, type LimitState } from '@/lib/aggregate'
import { formatINR } from '@/lib/format'
import { cn } from '@/lib/utils'

const fill: Record<LimitState, string> = { ok: 'bg-primary', warn: 'bg-warning', over: 'bg-destructive' }
const text: Record<LimitState, string> = { ok: 'text-muted-foreground', warn: 'text-warning', over: 'text-destructive' }

/**
 * Spent vs limit. Colour is never the only signal: the caption states the status in words.
 * `inverse` flips the sense for savings goals, where reaching the target is good.
 */
export function LimitMeter({ label, spent, limit, inverse }: { label: string; spent: number; limit: number; inverse?: boolean }) {
  const state: LimitState = inverse ? 'ok' : limitState(spent, limit)
  const pct = limit > 0 ? Math.min(100, (spent / limit) * 100) : 0
  const left = limit - spent
  const caption = inverse
    ? left <= 0 ? 'Goal reached' : `${formatINR(left)} to go`
    : state === 'over' ? `Over by ${formatINR(-left)}` : state === 'warn' ? `${formatINR(left)} left · nearing limit` : `${formatINR(left)} left`
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium">{label}</span>
        <span className="tabular text-sm"><strong className="font-semibold">{formatINR(spent)}</strong> <span className="text-muted-foreground">/ {formatINR(limit)}</span></span>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={limit}
        aria-valuenow={Math.min(spent, limit)}
        aria-valuetext={`${formatINR(spent)} of ${formatINR(limit)}. ${caption}`}
        className="h-3 overflow-hidden rounded-full bg-muted"
      >
        <div className={cn('h-full rounded-full transition-[width] duration-300', inverse && spent >= limit ? 'bg-success' : fill[state])} style={{ width: `${pct}%` }} />
      </div>
      <p className={cn('mt-1 text-sm', inverse && spent >= limit ? 'text-success' : text[state])}>{caption}</p>
    </div>
  )
}
