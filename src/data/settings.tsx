import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { DEFAULT_SPLIT, type Split } from '@/lib/budget'
import type { RecurringSaving } from '@/lib/recurring'
import type { WeekStart } from '@/lib/types'

export interface Settings {
  scriptUrl: string
  token: string
  weekStart: WeekStart
  defaultMode: string
  /** Open question from the plan: does the weekly limit count the Saving type? */
  weeklyCountsSavings: boolean
  theme: 'system' | 'light' | 'dark'
  /** Monthly take-home salary. 0 = use the Setup tab's yearly table. */
  salary: number
  split: Split
  recurring: RecurringSaving
  /** Months (YYYY-MM) whose recurring saving this device already handled. */
  recurringDone: string[]
}

const KEY = 'et.settings'
const defaults: Settings = {
  scriptUrl: '',
  token: '',
  weekStart: 'mon',
  defaultMode: 'UPI',
  weeklyCountsSavings: false,
  theme: 'system',
  salary: 0,
  split: DEFAULT_SPLIT,
  recurring: { enabled: false, amount: 0, description: 'Monthly saving', category: '', paymentMode: 'Bank Transfer', day: 1 },
  recurringDone: [],
}

function load(): Settings {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Settings>
    return {
      ...defaults,
      ...saved,
      split: { ...defaults.split, ...saved.split },
      recurring: { ...defaults.recurring, ...saved.recurring },
    }
  } catch {
    return defaults
  }
}

interface Ctx {
  settings: Settings
  update: (patch: Partial<Settings>) => void
}
const SettingsContext = createContext<Ctx | null>(null)

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState(load)

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch }
      try {
        localStorage.setItem(KEY, JSON.stringify(next))
      } catch {
        /* storage blocked: keep in memory */
      }
      return next
    })
  }, [])

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      const dark = settings.theme === 'dark' || (settings.theme === 'system' && mq.matches)
      document.documentElement.classList.toggle('dark', dark)
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0b1120' : '#f8fafc')
    }
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [settings.theme])

  const value = useMemo(() => ({ settings, update }), [settings, update])
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
}

export function useSettings() {
  const ctx = useContext(SettingsContext)
  if (!ctx) throw new Error('useSettings outside SettingsProvider')
  return ctx
}
