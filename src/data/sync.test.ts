import { beforeEach, describe, expect, it } from 'vitest'
import { ApiError, NetworkError, type SheetApi } from './api'
import { getExpenses, getOutbox, openDb, type Db } from './db'
import { MockSheetApi } from './mockApi'
import { enqueue, flushOutbox, pullAll } from './sync'
import type { Expense } from '@/lib/types'

const entry = (id: string, over: Partial<Expense> = {}): Expense => ({
  id,
  date: '2026-01-05',
  description: 'Uber',
  category: 'Life Infrastructure',
  amount: 450,
  paymentMode: 'UPI',
  type: 'Need',
  notes: '',
  ...over,
})

let db: Db
beforeEach(async () => {
  db = await openDb(`t-${Math.random()}`)
})

describe('outbox sync', () => {
  it('an entry added offline reaches the sheet exactly once after reconnecting', async () => {
    const api = new MockSheetApi([])
    const offline: SheetApi = Object.assign(Object.create(api) as SheetApi, {
      add: async (): Promise<never> => {
        throw new NetworkError('offline')
      },
    })

    await enqueue(db, { kind: 'add', id: 'a1', expense: entry('a1') })
    expect(await getExpenses(db)).toHaveLength(1) // optimistic

    const r1 = await flushOutbox(db, offline)
    expect(r1.offline).toBe(true)
    expect(await getOutbox(db)).toHaveLength(1)

    // Server applies the write but the response is lost: still safe to retry.
    api.loseNextResponse = true
    expect((await flushOutbox(db, api)).offline).toBe(true)
    const r3 = await flushOutbox(db, api)
    expect(r3.sent).toBe(1)

    expect(api.rows.filter((e) => e.id === 'a1')).toHaveLength(1)
    expect(await getOutbox(db)).toHaveLength(0)
    expect((await getExpenses(db))[0].row).toBeDefined()
  })

  it('folds an edit of a never-synced entry into its pending add', async () => {
    await enqueue(db, { kind: 'add', id: 'a1', expense: entry('a1') })
    await enqueue(db, { kind: 'update', id: 'a1', expense: entry('a1', { amount: 500 }) })
    const q = await getOutbox(db)
    expect(q).toHaveLength(1)
    expect(q[0].expense?.amount).toBe(500)
  })

  it('cancels add+delete of an unsynced entry', async () => {
    await enqueue(db, { kind: 'add', id: 'a1', expense: entry('a1') })
    await enqueue(db, { kind: 'delete', id: 'a1' })
    expect(await getOutbox(db)).toHaveLength(0)
    expect(await getExpenses(db)).toHaveLength(0)
  })

  it('keeps server rejections as failed instead of dropping them', async () => {
    const api = new MockSheetApi([])
    await enqueue(db, { kind: 'update', id: 'ghost', expense: entry('ghost') })
    const r = await flushOutbox(db, api)
    expect(r.failed).toBe(1)
    const q = await getOutbox(db)
    expect(q[0]).toMatchObject({ status: 'failed', error: 'NOT_FOUND' })
  })

  it('treats a busy script lock as temporary, not a failure', async () => {
    await enqueue(db, { kind: 'add', id: 'a1', expense: entry('a1') })
    const busy = { add: async () => { throw new ApiError('LOCK_TIMEOUT') } } as unknown as SheetApi
    expect((await flushOutbox(db, busy)).offline).toBe(true)
    expect((await getOutbox(db))[0].status).toBe('pending')
  })

  it('pull keeps still-queued local changes on top of server rows', async () => {
    const api = new MockSheetApi([entry('s1', { date: '2026-01-02' })])
    await enqueue(db, { kind: 'add', id: 'l1', expense: entry('l1') })
    const { expenses } = await pullAll(db, api, '2026-01-10')
    expect(expenses.map((e) => e.id).sort()).toEqual(['l1', 's1'])
  })
})

describe('rows without an App ID', () => {
  it('sends a second edit under the new hash id the script returned for the first', async () => {
    await enqueue(db, { kind: 'update', id: 'h:old', expense: entry('h:old', { row: 7 }) })
    await enqueue(db, { kind: 'update', id: 'h:old', expense: entry('h:old', { row: 7, amount: 9 }) })
    const seen: { id: string; row?: number }[] = []
    let n = 0
    const api = {
      update: async (id: string, e: Expense) => {
        seen.push({ id, row: e.row })
        return { id: `h:new${++n}`, row: 7 }
      },
    } as unknown as SheetApi
    expect((await flushOutbox(db, api)).sent).toBe(2)
    expect(seen).toEqual([{ id: 'h:old', row: 7 }, { id: 'h:new1', row: 7 }])
    expect((await getExpenses(db)).map((e) => e.id)).toEqual(['h:new2'])
  })
})

describe('bills sync', () => {
  it('caches the list, and treats an older script without bills as unsupported', async () => {
    const { getBills } = await import('./db')
    const { pullBills } = await import('./sync')
    const api = new MockSheetApi([])
    expect(await pullBills(db, api)).toBe(true)
    expect((await getBills(db)).map((b) => b.name)).toContain('Rent')
    const old = { bills: async () => { throw new ApiError('BAD_REQUEST') } } as unknown as SheetApi
    expect(await pullBills(db, old)).toBe(false)
    const offline = { bills: async () => { throw new NetworkError('x') } } as unknown as SheetApi
    await expect(pullBills(db, offline)).rejects.toBeInstanceOf(NetworkError)
  })
})
