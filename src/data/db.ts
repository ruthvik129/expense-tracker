import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { Bill } from '@/lib/bills'
import type { Bootstrap, Expense } from '@/lib/types'

export type OpKind = 'add' | 'update' | 'delete'
export interface OutboxOp {
  seq?: number
  kind: OpKind
  id: string
  expense?: Expense
  /** Sheet row at queue time; the script needs it for rows without an App ID. */
  row?: number
  status: 'pending' | 'failed'
  error?: string
  createdAt: number
}

interface Schema extends DBSchema {
  expenses: { key: string; value: Expense }
  outbox: { key: number; value: OutboxOp }
  meta: { key: string; value: unknown }
}

export type Db = IDBPDatabase<Schema>

export const openDb = (name = 'expense-tracker') =>
  openDB<Schema>(name, 1, {
    upgrade(db) {
      db.createObjectStore('expenses', { keyPath: 'id' })
      db.createObjectStore('outbox', { keyPath: 'seq', autoIncrement: true })
      db.createObjectStore('meta')
    },
  })

export const getExpenses = (db: Db) => db.getAll('expenses')
export const getExpense = (db: Db, id: string) => db.get('expenses', id)
export const putExpense = (db: Db, e: Expense) => db.put('expenses', e)
export const deleteExpense = (db: Db, id: string) => db.delete('expenses', id)

export async function replaceExpenses(db: Db, list: Expense[]) {
  const tx = db.transaction('expenses', 'readwrite')
  await tx.store.clear()
  await Promise.all(list.map((e) => tx.store.put(e)))
  await tx.done
}

export const getOutbox = (db: Db) => db.getAll('outbox')
export const addOp = (db: Db, op: Omit<OutboxOp, 'seq' | 'status' | 'createdAt'>) =>
  db.add('outbox', { ...op, status: 'pending', createdAt: Date.now() })
export const putOp = (db: Db, op: OutboxOp) => db.put('outbox', op)
export const removeOp = (db: Db, seq: number) => db.delete('outbox', seq)

export const getBootstrap = (db: Db) => db.get('meta', 'bootstrap') as Promise<Bootstrap | undefined>
export const setBootstrap = (db: Db, b: Bootstrap) => db.put('meta', b, 'bootstrap')
export const getBills = async (db: Db) => ((await db.get('meta', 'bills')) as Bill[] | undefined) ?? []
export const setBills = (db: Db, bills: Bill[]) => db.put('meta', bills, 'bills')
export const getLastSync = (db: Db) => db.get('meta', 'lastSync') as Promise<string | undefined>
export const setLastSync = (db: Db, iso: string) => db.put('meta', iso, 'lastSync')
