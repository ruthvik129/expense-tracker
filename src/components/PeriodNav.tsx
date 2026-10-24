import { Link, useLocation } from 'react-router-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function InsightsTabs() {
  const { pathname } = useLocation()
  return (
    <div role="tablist" aria-label="Period" className="mb-4 grid grid-cols-2 rounded-xl bg-muted p-1">
      {[['/week', 'Weekly'], ['/month', 'Monthly']].map(([to, label]) => (
        <Link
          key={to}
          to={to}
          role="tab"
          aria-selected={pathname === to}
          className={cn(
            'flex min-h-11 items-center justify-center rounded-lg text-sm font-medium transition-colors duration-150',
            pathname === to ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground',
          )}
        >
          {label}
        </Link>
      ))}
    </div>
  )
}

export function PeriodPicker({
  label,
  sub,
  onPrev,
  onNext,
  nextDisabled,
  onToday,
  atCurrent,
}: {
  label: string
  sub?: string
  onPrev: () => void
  onNext: () => void
  nextDisabled?: boolean
  onToday?: () => void
  atCurrent?: boolean
}) {
  return (
    <div className="mb-4 flex items-center justify-between gap-2">
      <Button variant="outline" size="icon" className="size-11" onClick={onPrev} aria-label="Previous">
        <ChevronLeft aria-hidden />
      </Button>
      <div className="flex flex-col items-center text-center">
        <h2 className="font-heading text-lg font-semibold" aria-live="polite">{label}</h2>
        {sub && <span className="text-sm text-muted-foreground">{sub}</span>}
        {onToday && !atCurrent && (
          <button type="button" onClick={onToday} className="mt-0.5 text-sm font-medium text-primary underline-offset-2 hover:underline">
            Jump to now
          </button>
        )}
      </div>
      <Button variant="outline" size="icon" className="size-11" onClick={onNext} disabled={nextDisabled} aria-label="Next">
        <ChevronRight aria-hidden />
      </Button>
    </div>
  )
}
