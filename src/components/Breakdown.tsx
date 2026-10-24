import { formatINR } from '@/lib/format'

/** Ranked bars with the amounts written out, so the data is readable without the chart colours. */
export function Breakdown({ rows, total }: { rows: { name: string; total: number }[]; total: number }) {
  if (!rows.length) return null
  return (
    <ul className="flex flex-col gap-3">
      {rows.map((r) => {
        const pct = total > 0 ? (r.total / total) * 100 : 0
        return (
          <li key={r.name}>
            <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
              <span className="truncate">{r.name}</span>
              <span className="tabular shrink-0"><strong className="font-semibold">{formatINR(r.total)}</strong> <span className="text-muted-foreground">{Math.round(pct)}%</span></span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
              <div className="h-full rounded-full bg-chart-1" style={{ width: `${pct}%` }} />
            </div>
          </li>
        )
      })}
    </ul>
  )
}
