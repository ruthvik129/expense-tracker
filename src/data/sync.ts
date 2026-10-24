import { ApiError, NetworkError, type SheetApi } from './api'
import * as store from './db'
import type { Db, OutboxOp } from './db'
import { addMonths, endOfMonth, startOfMonth, monthKey, todayIST } from '@/lib/dates'
import type { Expense } from '@/lib/types'

export const HISTORY_MONTHS = 13

/** Queue a local change: apply it to the cache now (optimistic) and record it for the sheet. */
export async function enqueue(
  db: Db,
  op: { kind: OutboxOp['kind']; id: string; expense?: Expense },
) {
  const row = (await store.getExpense(db, op.id))?.row
  if (op.kind === 'delete') await store.deleteExpense(db, op.id)
  else if (op.expense) await store.putExpense(db, { ...op.expense, row: op.expense.row ?? row })

  // Collapse edits to an entry the sheet has never seen into the original add.
  const queued = await store.getOutbox(db)
  const prior = queued.find((q) => q.id === op.id && q.kind === 'add' && q.status === 'pending')
  if (prior && op.kind === 'update') {
    await store.putOp(db, { ...prior, expense: op.expense })
    return
  }
  if (prior && op.kind === 'delete') {
    await store.removeOp(db, prior.seq!)
    return
  }
  await store.addOp(db, { ...op, row, expense: op.expense && { ...op.expense, row: op.expense.row ?? row } })
}

export interface FlushResult {
  sent: number
  failed: number
  offline: boolean
}

/**
 * Send queued ops oldest-first. A lost response is retried safely because add is
 * deduped by id on the server. Server rejections stay in the queue as 'failed'
 * so the user can retry or discard; nothing is dropped silently.
 */
export async function flushOutbox(db: Db, api: SheetApi): Promise<FlushResult> {
  const res: FlushResult = { sent: 0, failed: 0, offline: false }
  const blocked = new Set<string>()
  const ops = (await store.getOutbox(db)).sort((a, b) => a.seq! - b.seq!)

  // Rows without an App ID are addressed by a content hash, so an edit can change the id.
  const remap = async (from: number, oldId: string, saved: Expense) => {
    if (saved.id !== oldId) await store.deleteExpense(db, oldId)
    await store.putExpense(db, saved)
    for (const later of ops.slice(from + 1)) {
      if (later.id !== oldId) continue
      later.id = saved.id
      later.row = saved.row
      if (later.expense) later.expense = { ...later.expense, id: saved.id, row: saved.row }
      await store.putOp(db, later)
    }
  }

  for (const [i, op] of ops.entries()) {
    if (op.status === 'failed') blocked.add(op.id)
    if (op.status === 'failed' || blocked.has(op.id)) {
      res.failed++
      continue
    }
    try {
      if (op.kind === 'add' && op.expense) {
        const { id, row } = await api.add(op.expense)
        await remap(i, op.id, { ...op.expense, id, row })
      } else if (op.kind === 'update' && op.expense) {
        const { id, row } = await api.update(op.id, op.expense)
        await remap(i, op.id, { ...op.expense, id, row })
      } else if (op.kind === 'delete') {
        await api.remove(op.id, op.row)
      }
      await store.removeOp(db, op.seq!)
      res.sent++
    } catch (e) {
      // Busy script lock is temporary: stop and try again on the next flush, like being offline.
      if (e instanceof NetworkError || (e instanceof ApiError && e.code === 'LOCK_TIMEOUT')) {
        res.offline = true
        break
      }
      const code = e instanceof ApiError ? e.code : e instanceof Error ? e.message : 'ERROR'
      await store.putOp(db, { ...op, status: 'failed', error: code })
      blocked.add(op.id)
      res.failed++
    }
  }
  return res
}

/**
 * Pull the Recurring Payments list. An older deployed script answers BAD_REQUEST to the
 * new action: report that as "not supported yet" instead of failing the whole sync.
 */
export async function pullBills(db: Db, api: SheetApi): Promise<boolean> {
  try {
    await store.setBills(db, await api.bills())
    return true
  } catch (e) {
    if (e instanceof ApiError && e.code === 'BAD_REQUEST') return false
    throw e
  }
}

/** Pull setup lists + the last 13 months, then layer still-queued local changes on top. */
export async function pullAll(db: Db, api: SheetApi, now = todayIST()) {
  const from = startOfMonth(addMonths(monthKey(now), -(HISTORY_MONTHS - 1)))
  const to = endOfMonth(monthKey(now))
  const [boot, rows] = await Promise.all([api.bootstrap(), api.expenses(from, to)])

  const byId = new Map(rows.map((r) => [r.id, r]))
  for (const op of (await store.getOutbox(db)).sort((a, b) => a.seq! - b.seq!)) {
    if (op.kind === 'delete') byId.delete(op.id)
    else if (op.expense) byId.set(op.id, op.expense)
  }
  const merged = [...byId.values()]
  await store.replaceExpenses(db, merged)
  await store.setBootstrap(db, boot)
  await store.setLastSync(db, new Date().toISOString())
  return { bootstrap: boot, expenses: merged }
}
