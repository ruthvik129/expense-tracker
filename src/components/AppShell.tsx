import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { BarChart3, CalendarDays, History, PlusCircle, ReceiptText, Settings } from 'lucide-react'
import { useApp } from '@/data/store'
import { SyncBadge } from '@/components/SyncBadge'
import { cn } from '@/lib/utils'
import { dueCount } from '@/lib/bills'
import { todayIST } from '@/lib/dates'

const tabs = [
  { to: '/', label: 'Add', icon: PlusCircle, match: (p: string) => p === '/' },
  { to: '/bills', label: 'Bills', icon: ReceiptText, match: (p: string) => p.startsWith('/bills') },
  { to: '/history', label: 'History', icon: History, match: (p: string) => p.startsWith('/history') },
  { to: '/week', label: 'Insights', icon: BarChart3, match: (p: string) => p === '/week' || p === '/month' },
  { to: '/year', label: 'Year', icon: CalendarDays, match: (p: string) => p.startsWith('/year') },
]

export function AppShell() {
  const { pathname } = useLocation()
  const { demo, bills, expenses } = useApp()
  const due = dueCount(bills, todayIST(), expenses)

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-xl flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-md focus:bg-card focus:p-2">
        Skip to content
      </a>
      <header className="sticky top-0 z-20 flex min-h-12 items-center justify-between gap-2 bg-background/90 px-4 pt-[env(safe-area-inset-top)] backdrop-blur">
        <span className="font-heading text-sm font-semibold tracking-tight text-muted-foreground">Expense Tracker</span>
        <div className="flex items-center gap-1">
          <SyncBadge />
          <Link
            to="/settings"
            aria-label="Settings"
            aria-current={pathname.startsWith('/settings') ? 'page' : undefined}
            className={cn(
              'flex size-11 items-center justify-center rounded-full transition-colors duration-150 hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring',
              pathname.startsWith('/settings') ? 'text-primary' : 'text-muted-foreground',
            )}
          >
            <Settings className="size-5" aria-hidden />
          </Link>
        </div>
      </header>
      {demo && (
        <div role="note" className="mx-4 mb-2 rounded-lg bg-accent px-3 py-2 text-sm text-accent-foreground">
          Demo data, not your sheet. Add your script URL and token in Settings.
        </div>
      )}
      <main id="main" className="flex-1 px-4 pb-28 pt-2">
        <Outlet />
      </main>
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-30 border-t bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
      >
        <ul className="mx-auto flex max-w-xl">
          {tabs.map(({ to, label, icon: Icon, match }) => {
            const active = match(pathname)
            return (
              <li key={to} className="flex-1">
                <NavLink
                  to={to}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs font-medium transition-colors duration-150',
                    'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring',
                    active ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <span className="relative">
                    <Icon className="size-6" aria-hidden strokeWidth={active ? 2.4 : 1.8} />
                    {to === '/bills' && due > 0 && (
                      <span className="tabular absolute -right-2.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-white">
                        {due}
                      </span>
                    )}
                  </span>
                  {label}
                  {to === '/bills' && due > 0 && <span className="sr-only">, {due} due</span>}
                </NavLink>
              </li>
            )
          })}
        </ul>
      </nav>
    </div>
  )
}
