import { Link } from 'react-router-dom'
import { AlertCircle, CloudOff, Loader2, RefreshCw } from 'lucide-react'
import { useApp } from '@/data/store'

export function SyncBadge() {
  const { online, syncing, pending, failed } = useApp()
  const base = 'inline-flex min-h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium'

  if (failed.length)
    return (
      <Link to="/settings" className={`${base} bg-destructive/10 text-destructive`}>
        <AlertCircle className="size-3.5" aria-hidden /> {failed.length} failed. Retry
      </Link>
    )
  if (!online)
    return (
      <span role="status" className={`${base} bg-muted text-muted-foreground`}>
        <CloudOff className="size-3.5" aria-hidden /> Offline{pending ? ` · pending sync (${pending})` : ''}
      </span>
    )
  if (syncing)
    return (
      <span role="status" className={`${base} bg-muted text-muted-foreground`}>
        <Loader2 className="size-3.5 animate-spin" aria-hidden /> Syncing…
      </span>
    )
  if (pending)
    return (
      <span role="status" className={`${base} bg-warning/15 text-warning`}>
        <RefreshCw className="size-3.5" aria-hidden /> Pending sync ({pending})
      </span>
    )
  return null
}
