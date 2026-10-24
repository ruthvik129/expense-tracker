import type { Bill } from '@/lib/bills'
import type { Bootstrap, Expense, Ymd } from '@/lib/types'

/** The server answered with ok:false. Retrying will not help until the cause is fixed. */
export class ApiError extends Error {
  code: string
  constructor(code: string, message?: string) {
    super(message ?? code)
    this.code = code
  }
}

/** The request never got an answer (offline, DNS, CORS). Safe to retry. */
export class NetworkError extends Error {}

export interface SheetApi {
  bootstrap(): Promise<Bootstrap>
  expenses(from: Ymd, to: Ymd): Promise<Expense[]>
  add(expense: Expense): Promise<{ id: string; row: number }>
  update(id: string, expense: Expense): Promise<{ id: string; row: number }>
  remove(id: string, row?: number): Promise<void>
  bills(): Promise<Bill[]>
  saveBill(bill: Bill): Promise<Bill>
  deleteBill(id: string): Promise<void>
}

type Envelope<T> = ({ ok: true } & T) | { ok: false; error: string }

export class HttpSheetApi implements SheetApi {
  private url: string
  private token: string
  constructor(url: string, token: string) {
    this.url = url
    this.token = token
  }

  private async send<T>(init?: RequestInit, query?: Record<string, string>): Promise<T> {
    const u = new URL(this.url)
    for (const [k, v] of Object.entries(query ?? {})) u.searchParams.set(k, v)
    let res: Response
    try {
      res = await fetch(u, init)
    } catch (e) {
      throw new NetworkError(e instanceof Error ? e.message : 'network')
    }
    let body: Envelope<T>
    try {
      body = await res.json()
    } catch {
      throw new ApiError('BAD_RESPONSE', 'Script did not return JSON. Check the web-app URL and deployment access.')
    }
    if (!body.ok) throw new ApiError(body.error)
    return body as T
  }

  // POST bodies are text/plain JSON so the browser skips the CORS preflight.
  private post<T>(payload: Record<string, unknown>) {
    return this.send<T>({
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ token: this.token, ...payload }),
    })
  }

  // GETs carry the token in the query (Apps Script cannot read GET headers); POSTs in the body.
  async bootstrap() {
    const r = await this.send<{ data?: Bootstrap } & Bootstrap>(undefined, { action: 'bootstrap', token: this.token })
    return r.data ?? r
  }
  async expenses(from: Ymd, to: Ymd) {
    const r = await this.send<{ expenses?: Expense[]; rows?: Expense[] }>(undefined, {
      action: 'expenses',
      token: this.token,
      from,
      to,
    })
    return r.expenses ?? r.rows ?? []
  }
  add(expense: Expense) {
    return this.post<{ id: string; row: number }>({ action: 'add', expense })
  }
  update(id: string, expense: Expense) {
    return this.post<{ id: string; row: number }>({ action: 'update', id, expense, row: expense.row })
  }
  async remove(id: string, row?: number) {
    await this.post<object>({ action: 'delete', id, row })
  }
  async bills() {
    return (await this.send<{ bills: Bill[] }>(undefined, { action: 'bills', token: this.token })).bills
  }
  async saveBill(bill: Bill) {
    return (await this.post<{ bill: Bill }>({ action: 'billSave', bill })).bill
  }
  async deleteBill(id: string) {
    await this.post<object>({ action: 'billDelete', id })
  }
}
