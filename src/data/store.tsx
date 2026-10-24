import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import type { Bootstrap, Expense } from '@/lib/types'
import { ApiError, HttpSheetApi, NetworkError, type SheetApi } from './api'
import * as store from './db'
import type { Db, OutboxOp } from './db'
import { MockSheetApi, demoBootstrap } from './mockApi'
import { useSettings } from './settings'
import { enqueue, flushOutbox, pullAll, pullBills } from './sync'
import type { Bill } from '@/lib/bills'
import { dueRecurring } from '@/lib/recurring'
import { matchMode } from '@/lib/paymentModes'
import { todayIST } from '@/lib/dates'
import { formatINR } from '@/lib/format'

export type NewExpense = Omit<Expense, 'id' | 'row' | 'type'>

interface Ctx {
  ready: boolean
  demo: boolean
  expenses: Expense[]
  bootstrap: Bootstrap
  /** True until the first load finished and no cache exists yet. */
  loading: boolean
  loadError: string | null
  online: boolean
  syncing: boolean
  pending: number
  failed: OutboxOp[]
  lastSync: string | null
  add: (e: NewExpense) => Promise<void>
  update: (id: string, e: NewExpense) => Promise<void>
  remove: (id: string) => Promise<void>
  refresh: () => Promise<void>
  retryFailed: () => Promise<void>
  discardFailed: (seq: number) => Promise<void>
  bills: Bill[]
  /** False while the deployed script is older than the Recurring Payments feature. */
  billsSupported: boolean
  /** Bill list edits go straight to the sheet (no offline queue); rejects with a readable message. */
  saveBill: (bill: Bill) => Promise<void>
  deleteBill: (id: string) => Promise<void>
  /** Queue several entries with ids chosen by the caller (bills use one id per month). */
  logEntries: (entries: Omit<Expense, 'row' | 'type'>[]) => Promise<void>
}

const AppContext = createContext<Ctx | null>(null)

const errMsg = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong')

function billError(e: unknown): string {
  if (e instanceof NetworkError) return "You're offline. Changes to the bill list need a connection."
  if (e instanceof ApiError) {
    if (e.code === 'BAD_REQUEST') return 'Your Apps Script is older than this feature. Update ExpenseApi.gs and deploy a new version.'
    if (e.code === 'BAD_CATEGORY' || e.code === 'BAD_PAYMENT_MODE') return 'That category or payment mode is not in your Setup tab. Refresh Setup lists in Settings.'
    return `The sheet said ${e.code}.`
  }
  return errMsg(e)
}

export function AppProvider({ children }: { children: ReactNode }) {
  const { settings, update: updateSettings } = useSettings()
  const demo = !settings.scriptUrl || !settings.token

  const [db, setDb] = useState<Db | null>(null)
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [boot, setBoot] = useState<Bootstrap | null>(null)
  const [outbox, setOutbox] = useState<OutboxOp[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [online, setOnline] = useState(navigator.onLine)
  const [lastSync, setLastSync] = useState<string | null>(null)
  const [bills, setBills] = useState<Bill[]>([])
  const [billsSupported, setBillsSupported] = useState(true)

  // Demo mode uses a throwaway in-memory sheet and its own DB, so it never mixes with real data.
  const demoApi = useRef<MockSheetApi | null>(null)
  const api: SheetApi = useMemo(() => {
    if (demo) return (demoApi.current ??= new MockSheetApi())
    return new HttpSheetApi(settings.scriptUrl, settings.token)
  }, [demo, settings.scriptUrl, settings.token])

  const syncing_ = useRef(false)

  const reload = useCallback(async (d: Db) => {
    const [list, ops, b, ls, bl] = await Promise.all([
      store.getExpenses(d),
      store.getOutbox(d),
      store.getBootstrap(d),
      store.getLastSync(d),
      store.getBills(d),
    ])
    setExpenses(list)
    setBills(bl)
    setOutbox(ops)
    if (b) setBoot(b)
    setLastSync(ls ?? null)
  }, [])

  const sync = useCallback(
    async (d: Db, opts: { pull: boolean; quiet?: boolean }) => {
      if (syncing_.current) return
      syncing_.current = true
      setSyncing(true)
      try {
        const flush = await flushOutbox(d, api)
        if (flush.offline) setOnline(false)
        else {
          if (opts.pull) {
            await pullAll(d, api)
            setBillsSupported(await pullBills(d, api))
          }
          setOnline(true)
          setLoadError(null)
        }
        if (flush.failed && !opts.quiet) toast.error(`${flush.failed} change(s) could not sync. Open Settings to retry.`)
      } catch (e) {
        if (e instanceof NetworkError) setOnline(false)
        else setLoadError(errMsg(e))
      } finally {
        await reload(d)
        syncing_.current = false
        setSyncing(false)
        setLoading(false)
      }
    },
    [api, reload],
  )

  // (Re)open the right database whenever we switch between demo and a real sheet.
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setExpenses([])
    setBoot(null)
    store.openDb(demo ? 'expense-tracker-demo' : 'expense-tracker').then(async (d) => {
      if (cancelled) return
      if (demo) {
        // Fresh demo each visit: seed the cache directly.
        await store.replaceExpenses(d, [])
      }
      setDb(d)
      await reload(d)
      if (cancelled) return
      const cached = await store.getBootstrap(d)
      if (cached) setLoading(false) // show cache immediately, refresh behind it
      await sync(d, { pull: true, quiet: true })
    })
    return () => {
      cancelled = true
    }
  }, [demo, reload, sync])

  useEffect(() => {
    const on = () => {
      setOnline(true)
      if (db) void sync(db, { pull: true })
    }
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [db, sync])

  const bootstrap = boot ?? demoBootstrap()
  const typeOf = useCallback(
    (category: string) => bootstrap.categories.find((c) => c.name === category)?.type ?? 'Need',
    [bootstrap],
  )

  const write = useCallback(
    async (op: { kind: OutboxOp['kind']; id: string; expense?: Expense }) => {
      if (!db) return
      await enqueue(db, op)
      await reload(db)
      void sync(db, { pull: false })
    },
    [db, reload, sync],
  )

  // Recurring saving: once per month per sheet, after the first load so we can see existing rows.
  useEffect(() => {
    if (demo || loading || !db || !boot) return
    const tag = ` ${settings.scriptUrl}`
    const handled = settings.recurringDone.filter((m) => m.endsWith(tag)).map((m) => m.slice(0, 7))
    const due = dueRecurring(settings.recurring, todayIST(), handled, expenses, boot.categories)
    if (!due) return
    updateSettings({ recurringDone: [...settings.recurringDone, due.month + tag].slice(-24) })
    if (due.entry) {
      // The sheet rejects modes outside its Setup list, so use its own spelling.
      const paymentMode = matchMode(due.entry.paymentMode, boot.paymentModes) ?? boot.paymentModes[0]
      void write({ kind: 'add', id: due.entry.id, expense: { ...due.entry, paymentMode, type: typeOf(due.entry.category) } })
      toast.success(`Added this month's saving: ${formatINR(due.entry.amount)}`, {
        description: 'Delete it from History if you did not save this month.',
      })
    }
  }, [demo, loading, db, boot, expenses, settings.recurring, settings.recurringDone, settings.scriptUrl, updateSettings, write, typeOf])

  const value: Ctx = {
    ready: !!db,
    demo,
    expenses,
    bootstrap,
    loading,
    loadError,
    online,
    syncing,
    pending: outbox.filter((o) => o.status === 'pending').length,
    failed: outbox.filter((o) => o.status === 'failed'),
    lastSync,
    add: (e) => {
      const id = crypto.randomUUID()
      return write({ kind: 'add', id, expense: { ...e, id, type: typeOf(e.category) } })
    },
    update: (id, e) => write({ kind: 'update', id, expense: { ...e, id, type: typeOf(e.category) } }),
    remove: (id) => write({ kind: 'delete', id }),
    refresh: async () => {
      if (db) await sync(db, { pull: true })
    },
    retryFailed: async () => {
      if (!db) return
      for (const op of await store.getOutbox(db)) if (op.status === 'failed') await store.putOp(db, { ...op, status: 'pending', error: undefined })
      await sync(db, { pull: true })
    },
    bills,
    billsSupported,
    saveBill: async (bill) => {
      if (!db) return
      try {
        const saved = await api.saveBill(bill)
        const next = bills.some((b) => b.id === saved.id) ? bills.map((b) => (b.id === saved.id ? saved : b)) : [...bills, saved]
        await store.setBills(db, next)
        setBills(next)
      } catch (e) {
        throw new Error(billError(e))
      }
    },
    deleteBill: async (id) => {
      if (!db) return
      try {
        await api.deleteBill(id)
      } catch (e) {
        if (!(e instanceof ApiError && e.code === 'NOT_FOUND')) throw new Error(billError(e))
      }
      const next = bills.filter((b) => b.id !== id)
      await store.setBills(db, next)
      setBills(next)
    },
    logEntries: async (entries) => {
      if (!db) return
      for (const e of entries) await enqueue(db, { kind: 'add', id: e.id, expense: { ...e, type: typeOf(e.category) } })
      await reload(db)
      void sync(db, { pull: false })
    },
    discardFailed: async (seq) => {
      if (!db) return
      await store.removeOp(db, seq)
      await sync(db, { pull: true, quiet: true })
    },
  }

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp outside AppProvider')
  return ctx
}
