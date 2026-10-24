import { Badge } from '@/components/ui/badge'
import { formatINR } from '@/lib/format'
import type { Expense } from '@/lib/types'
import { cn } from '@/lib/utils'

const typeTone: Record<Expense['type'], string> = {
  Need: 'bg-primary/10 text-primary',
  Want: 'bg-warning/15 text-warning',
  Saving: 'bg-success/15 text-success',
}

export function ExpenseRow({ e, onClick }: { e: Expense; onClick?: () => void }) {
  const body = (
    <>
      <div className="min-w-0 flex-1 text-left">
        <p className="truncate text-base font-medium">{e.description}</p>
        <p className="truncate text-sm text-muted-foreground">
          {e.category} · {e.paymentMode}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <span className="tabular font-heading text-base font-semibold">{formatINR(e.amount)}</span>
        <Badge variant="secondary" className={cn('h-5 px-2 text-[11px]', typeTone[e.type])}>
          {e.type}
        </Badge>
      </div>
    </>
  )
  const cls = 'flex min-h-16 w-full items-center gap-3 rounded-xl bg-card px-4 py-3 transition-colors duration-150'
  return onClick ? (
    <button type="button" onClick={onClick} className={cn(cls, 'cursor-pointer hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring')}>
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  )
}
