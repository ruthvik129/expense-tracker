import { execFile } from 'node:child_process'
import { readFileSync } from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import vm from 'node:vm'
import { beforeEach, describe, expect, it } from 'vitest'
import { FakeSheet, makeServices } from './fakeSheets'

const SOURCE = readFileSync(path.join(import.meta.dirname, 'ExpenseApi.gs'), 'utf8')
const TOKEN = 'secret-123'
const CATS = [
  ['Life Infrastructure', 'Need'], ['Future Me', 'Saving'], ['Performance & Growth', 'Need'],
  ['Relationships & Generosity', 'Want'], ['Lifestyle Enjoyment', 'Want'],
]
const MODES = ['Credit Card', 'Debit Card', 'UPI', 'Cash', 'Bank Transfer']
const istDate = (ymd: string) => new Date(`${ymd}T00:00:00+05:30`)

/** The user's template: Setup tab at fixed spots, daily table under a title, pre-formatted empty rows. */
function template(opts: { typeFormula?: boolean; filledRows?: number } = {}) {
  const setup = new FakeSheet('Setup', 30, 6)
  ;['Year', 'Salary', 'Needs', 'Wants', 'Savings'].forEach((h, i) => setup.set(1, i + 1, h))
  ;[2025, 2026].forEach((y, i) => {
    const s = 100000 * 1.1 ** i
    ;[y, s, s * 0.5, s * 0.3, s * 0.2].forEach((v, j) => setup.set(2 + i, j + 1, v))
  })
  setup.set(10, 1, 'Category List'); setup.set(10, 2, 'Type'); setup.set(10, 4, 'Payment Mode')
  CATS.forEach(([n, t], i) => { setup.set(11 + i, 1, n); setup.set(11 + i, 2, t) })
  MODES.forEach((m, i) => setup.set(11 + i, 4, m))
  setup.set(20, 1, 'Weekly limit'); setup.set(21, 1, 10000)

  const daily = new FakeSheet('Daily Expense Tracker', 12, 7)
  daily.set(1, 1, 'Daily Expense Tracker')
  ;['Date', 'Description', 'Category', 'Amount', 'Payment Mode', 'Type', 'Notes'].forEach((h, i) => daily.set(3, i + 1, h))
  const rows: [string, string, string, number, string, string, string][] = [
    ['2026-01-01', 'Uber late night - NYE', 'Life Infrastructure', 450, 'UPI', 'Need', 'NYE cab home'],
    ['2026-01-02', 'Swiggy', 'Lifestyle Enjoyment', 320, 'Credit Card', 'Want', ''],
    ['2026-01-03', 'Rent', 'Life Infrastructure', 18000, 'Bank Transfer', 'Need', ''],
  ].slice(0, opts.filledRows ?? 3) as never
  for (let r = 4; r <= 12; r++) {
    daily.validations.set(`${r},3`, { list: CATS.map((c) => c[0]) })
    daily.formats.set(`${r},4`, '₹#,##0')
    if (opts.typeFormula) daily.set(r, 6, '', `=IFERROR(VLOOKUP(C${r},Setup!A11:B15,2,0),"")`)
  }
  rows.forEach((row, i) => row.forEach((v, j) => {
    if (j === 5 && opts.typeFormula) daily.cell(4 + i, 6).v = v // formula result
    else daily.set(4 + i, j + 1, j === 0 ? istDate(v as string) : v)
  }))
  const analysis = new FakeSheet('Weekly Analysis', 5, 3)
  analysis.set(1, 1, 0, "=SUMIFS('Daily Expense Tracker'!D:D,'Daily Expense Tracker'!A:A,\">=\"&B1)")
  return { setup, daily, analysis, sheets: [setup, daily, analysis] }
}

function load(sheets: FakeSheet[], props: Record<string, string> = { TOKEN }) {
  const svc = makeServices(sheets, 'Asia/Kolkata', props)
  const ctx = vm.createContext({ ...svc.globals, JSON, Math, Object, String, Number, Date, RegExp, Error, isFinite, isNaN, parseFloat })
  vm.runInContext(SOURCE, ctx)
  const call = (method: 'doGet' | 'doPost', arg: unknown) => JSON.parse((ctx[method] as (e: unknown) => { content: string })(arg).content)
  return {
    svc,
    ctx,
    get: (params: Record<string, string>) => call('doGet', { parameter: { token: TOKEN, ...params } }),
    post: (body: Record<string, unknown>) => call('doPost', { parameter: {}, postData: { contents: JSON.stringify({ token: TOKEN, ...body }) } }),
    run: (fn: string) => (ctx[fn] as () => void)(),
  }
}

const entry = (over: Record<string, unknown> = {}) => ({
  id: 'uuid-1', date: '2026-01-05', description: 'Coffee', category: 'Lifestyle Enjoyment',
  amount: 180, paymentMode: 'UPI', notes: 'with Ravi', ...over,
})

describe('Apps Script: auth and errors', () => {
  it('rejects a missing or wrong token without details', () => {
    const { get } = load(template().sheets)
    expect(get({ action: 'bootstrap', token: '' })).toEqual({ ok: false, error: 'UNAUTHORIZED' })
    expect(get({ action: 'bootstrap', token: 'nope' })).toEqual({ ok: false, error: 'UNAUTHORIZED' })
  })
  it('says when TOKEN was never set', () => {
    const { get } = load(template().sheets, {})
    expect(get({ action: 'bootstrap' })).toEqual({ ok: false, error: 'TOKEN_NOT_SET' })
  })
  it('never leaks a stack trace', () => {
    const t = template()
    const { get, ctx, svc } = load(t.sheets)
    ctx.bootstrap_ = () => { throw new Error('secret internals at line 42') }
    expect(get({ action: 'bootstrap' })).toEqual({ ok: false, error: 'INTERNAL' })
    expect(svc.logs.join('\n')).toContain('secret internals') // only in the private log
  })
  it('rejects malformed POST bodies and unknown actions', () => {
    const { ctx, get } = load(template().sheets)
    const raw = JSON.parse((ctx.doPost as (e: unknown) => { content: string })({ parameter: {}, postData: { contents: '{nope' } }).content)
    expect(raw).toEqual({ ok: false, error: 'BAD_REQUEST' })
    expect(get({ action: 'drop_tables' })).toEqual({ ok: false, error: 'BAD_REQUEST' })
  })
})

describe('Apps Script: reads', () => {
  it('bootstrap finds the Setup tables by header text', () => {
    const { get } = load(template().sheets)
    const r = get({ action: 'bootstrap' })
    expect(r.ok).toBe(true)
    expect(r.data.categories).toEqual(CATS.map(([name, type]) => ({ name, type })))
    expect(r.data.paymentModes).toEqual(MODES)
    expect(r.data.weeklyLimit).toBe(10000)
    expect(r.data.budgets[1]).toMatchObject({ year: 2026, salary: 110000.00000000001 })
    expect(r.data.sheetTimezone).toBe('Asia/Kolkata')
  })
  it('still finds things after the user moves tables around', () => {
    const t = template()
    t.setup.rows.unshift(...Array.from({ length: 3 }, () => FakeSheet.blankRow(6)))
    t.daily.rows.unshift(FakeSheet.blankRow(7))
    const { get } = load(t.sheets)
    expect(get({ action: 'bootstrap' }).data.weeklyLimit).toBe(10000)
    expect(get({ action: 'expenses', from: '2026-01-01', to: '2026-01-31' }).expenses).toHaveLength(3)
  })
  it('lists rows in range as calendar days in the sheet timezone', () => {
    const { get } = load(template().sheets)
    const r = get({ action: 'expenses', from: '2026-01-02', to: '2026-01-31' })
    expect(r.expenses.map((e: { date: string }) => e.date)).toEqual(['2026-01-02', '2026-01-03'])
    expect(r.expenses[0]).toMatchObject({ row: 5, description: 'Swiggy', amount: 320, type: 'Want' })
    expect(r.expenses[0].id).toMatch(/^h:[0-9a-f]{8}$/)
  })
  it('reads dates typed as text like "Thu, 01 Jan 2026"', () => {
    const t = template()
    t.daily.set(4, 1, 'Thu, 01 Jan 2026')
    const { get } = load(t.sheets)
    expect(get({ action: 'expenses', from: '2026-01-01', to: '2026-01-01' }).expenses).toHaveLength(1)
  })
  it('rejects malformed date ranges', () => {
    const { get } = load(template().sheets)
    expect(get({ action: 'expenses', from: '1 jan', to: '2026-01-31' })).toEqual({ ok: false, error: 'BAD_REQUEST' })
  })
})

describe('Apps Script: add', () => {
  let t: ReturnType<typeof template>
  beforeEach(() => { t = template({ typeFormula: true }) })

  it('writes values into the first empty row and keeps formulas, dropdowns and formats', () => {
    const { post } = load(t.sheets)
    const r = post({ action: 'add', expense: entry() })
    expect(r).toMatchObject({ ok: true, row: 7 })
    const row = t.daily.rows[6]
    expect(row[0].v).toEqual(istDate('2026-01-05')) // a real Date, not text
    expect(row.slice(1, 5).map((c) => c.v)).toEqual(['Coffee', 'Lifestyle Enjoyment', 180, 'UPI'])
    expect(row[5].f).toMatch(/^=IFERROR\(VLOOKUP/) // Type formula untouched
    expect(row[6].v).toBe('with Ravi')
    expect(t.daily.validations.get('7,3')).toBeTruthy()
    expect(t.daily.formats.get('7,4')).toBe('₹#,##0')
    // Other rows' formulas are still there.
    expect(t.daily.rows[7][5].f).toMatch(/VLOOKUP/)
  })

  it('writes Type from the Setup lookup when the column holds typed values', () => {
    const plain = template()
    const { post } = load(plain.sheets)
    post({ action: 'add', expense: entry({ category: 'Future Me', description: 'SIP' }) })
    expect(plain.daily.rows[6][5].v).toBe('Saving')
  })

  it('never writes Type when an ARRAYFORMULA in the header fills the column', () => {
    const arr = template()
    arr.daily.set(3, 6, 'Type', '={"Type";ARRAYFORMULA(VLOOKUP(C4:C,Setup!A11:B15,2,0))}')
    const { post } = load(arr.sheets)
    post({ action: 'add', expense: entry() })
    expect(arr.daily.rows[6][5]).toEqual({ v: '', f: '' })
  })

  it('a retried add returns the same row instead of adding twice (no App ID column)', () => {
    const { post, get } = load(t.sheets)
    const a = post({ action: 'add', expense: entry() })
    const b = post({ action: 'add', expense: entry() })
    expect(b).toEqual(a)
    expect(get({ action: 'expenses', from: '2026-01-05', to: '2026-01-05' }).expenses).toHaveLength(1)
  })

  it('validates against the Setup lists with stable error codes', () => {
    const { post } = load(t.sheets)
    expect(post({ action: 'add', expense: entry({ category: 'Pets' }) }).error).toBe('BAD_CATEGORY')
    expect(post({ action: 'add', expense: entry({ paymentMode: 'Crypto' }) }).error).toBe('BAD_PAYMENT_MODE')
    expect(post({ action: 'add', expense: entry({ amount: -5 }) }).error).toBe('BAD_AMOUNT')
    expect(post({ action: 'add', expense: entry({ date: '05/01/2026' }) }).error).toBe('BAD_DATE')
    expect(post({ action: 'add', expense: entry({ description: '  ' }) }).error).toBe('BAD_DESCRIPTION')
  })

  it('adds a row at the bottom when the table is full, copying its formatting', () => {
    const full = template()
    for (let r = 7; r <= 12; r++) full.daily.set(r, 1, istDate('2026-01-04'))
    for (let r = 7; r <= 12; r++) { full.daily.set(r, 2, 'x'); full.daily.set(r, 4, 1) }
    const { post } = load(full.sheets)
    expect(post({ action: 'add', expense: entry() }).row).toBe(13)
    expect(full.daily.validations.get('13,3')).toBeTruthy()
  })
})

describe('Apps Script: update and delete without App ID', () => {
  it('edits the matching row and returns its new content id', () => {
    const t = template()
    const { get, post } = load(t.sheets)
    const [swiggy] = get({ action: 'expenses', from: '2026-01-02', to: '2026-01-02' }).expenses
    const r = post({ action: 'update', id: swiggy.id, row: swiggy.row, expense: { ...swiggy, amount: 350 } })
    expect(r).toMatchObject({ ok: true, row: 5 })
    expect(r.id).not.toBe(swiggy.id)
    expect(t.daily.rows[4][3].v).toBe(350)
  })
  it('finds the row again after rows above it moved', () => {
    const t = template()
    const { get, post } = load(t.sheets)
    const [rent] = get({ action: 'expenses', from: '2026-01-03', to: '2026-01-03' }).expenses
    t.daily.deleteRow(4) // someone deleted a row in the sheet
    expect(post({ action: 'delete', id: rent.id, row: rent.row })).toEqual({ ok: true })
    expect(get({ action: 'expenses', from: '2026-01-01', to: '2026-01-31' }).expenses.map((e: { description: string }) => e.description)).toEqual(['Swiggy'])
  })
  it('refuses with STALE when the row was changed in the sheet', () => {
    const t = template()
    const { get, post } = load(t.sheets)
    const [swiggy] = get({ action: 'expenses', from: '2026-01-02', to: '2026-01-02' }).expenses
    t.daily.set(5, 4, 999) // edited in the sheet meanwhile
    expect(post({ action: 'update', id: swiggy.id, row: swiggy.row, expense: swiggy })).toEqual({ ok: false, error: 'STALE' })
    expect(post({ action: 'delete', id: swiggy.id, row: swiggy.row })).toEqual({ ok: false, error: 'STALE' })
  })
})

describe('Apps Script: App ID column', () => {
  it('diagnose flags whole-column references and reports the layout', () => {
    const t = template({ typeFormula: true })
    t.analysis.set(2, 1, 0, "=COUNTA('Daily Expense Tracker'!A:Z)")
    const { run, svc } = load(t.sheets)
    run('diagnose')
    const log = svc.logs.join('\n')
    expect(log).toContain('header row: 3')
    expect(log).toContain('has formulas, the app will NOT write it')
    expect(log).toContain("COUNTA('Daily Expense Tracker'!A:Z)")
    expect(log).not.toContain('SUMIFS') // D:D and A:A are inside the table, fine
    expect(log).toContain('review the notes')
  })
  it('setupAppIdColumn adds a hidden header and then edits go by id', () => {
    const t = template()
    const { run, post, get, svc } = load(t.sheets)
    run('diagnose')
    expect(svc.logs.join('\n')).toContain('safe to run setupAppIdColumn')
    run('setupAppIdColumn')
    expect(t.daily.cell(3, 8).v).toBe('App ID')
    expect(t.daily.hidden.has(8)).toBe(true)

    const a = post({ action: 'add', expense: entry() })
    expect(a).toMatchObject({ ok: true, id: 'uuid-1', row: 7 })
    expect(t.daily.cell(7, 8).v).toBe('uuid-1')
    expect(post({ action: 'add', expense: entry() })).toEqual(a) // dedupe by id
    expect(post({ action: 'update', id: 'uuid-1', expense: entry({ amount: 200 }) })).toMatchObject({ id: 'uuid-1', row: 7 })
    expect(t.daily.cell(7, 4).v).toBe(200)
    // Old rows without an id still work by content.
    const old = get({ action: 'expenses', from: '2026-01-01', to: '2026-01-01' }).expenses[0]
    expect(old.id).toMatch(/^h:/)
    expect(post({ action: 'delete', id: 'uuid-1' })).toEqual({ ok: true })
    expect(post({ action: 'delete', id: 'uuid-1' })).toEqual({ ok: false, error: 'NOT_FOUND' })
  })
})

describe('Apps Script: living next to the user\'s own Code.gs', () => {
  it('rebuilds the Yearly Calendar after app writes, like onEdit does for manual edits', () => {
    const t = template()
    const { post, get, ctx } = load(t.sheets)
    let builds = 0
    ctx.buildYearlyCalendar = () => { builds++ }
    post({ action: 'add', expense: entry() })
    get({ action: 'expenses', from: '2026-01-01', to: '2026-01-31' }) // reads do not rebuild
    expect(builds).toBe(1)
  })
  it('keeps the saved row even if the calendar rebuild throws', () => {
    const t = template()
    const { post, ctx, svc } = load(t.sheets)
    ctx.buildYearlyCalendar = () => { throw new Error('calendar broke') }
    expect(post({ action: 'add', expense: entry() })).toMatchObject({ ok: true, row: 7 })
    expect(svc.logs.join('\n')).toContain('Yearly Calendar refresh failed')
  })
  it('works when there is no buildYearlyCalendar at all', () => {
    const { post } = load(template().sheets)
    expect(post({ action: 'add', expense: entry() }).ok).toBe(true)
  })
  it('handles the real layout: header in row 1, typed Type values, rows from populateTestData', () => {
    const t = template()
    const daily = new FakeSheet('Daily Expense Tracker', 6, 7)
    ;['Date', 'Description', 'Category', 'Amount', 'Payment Mode', 'Type', 'Notes'].forEach((h, i) => daily.set(1, i + 1, h))
    ;[
      ['2026-01-01', 'Uber late night - NYE', 'Life Infrastructure', 450, 'UPI', 'Need', 'NYE cab home'],
      ['2026-01-15', 'SIP - Mutual Fund', 'Future Me', 2000, 'Bank Transfer', 'Saving', 'Skipped last 2 months, partial this month'],
    ].forEach((row, i) => row.forEach((v, j) => daily.set(2 + i, j + 1, j === 0 ? istDate(v as string) : v)))
    const { get, post } = load([t.setup, daily, t.analysis])
    const rows = get({ action: 'expenses', from: '2026-01-01', to: '2026-01-31' }).expenses
    expect(rows.map((e: { row: number; type: string }) => [e.row, e.type])).toEqual([[2, 'Need'], [3, 'Saving']])
    expect(post({ action: 'add', expense: entry({ category: 'Future Me' }) })).toMatchObject({ ok: true, row: 4 })
    expect(daily.cell(4, 6).v).toBe('Saving') // Type written, as populateTestData does
  })

  it('defines none of the user\'s function names', () => {
    const theirs = ['onOpen', 'onEdit', 'buildYearlyCalendar', 'interpolateColor', 'hexToRgb', 'calculateMonthlyScore',
      'applyScoreFormatting', 'buildWeeklyAnalysis', 'handleWeeklyModeUI', 'populateTestData']
    for (const name of theirs) expect(SOURCE).not.toMatch(new RegExp(`function ${name}\\b`))
  })
})

describe('Apps Script: Recurring Payments tab', () => {
  const bill = (over: Record<string, unknown> = {}) => ({
    id: 'bill-rent', name: 'Rent', amount: 12000, category: 'Life Infrastructure',
    paymentMode: 'Bank Transfer', dueDay: 1, active: true, ...over,
  })

  it('returns an empty list and creates nothing until the first save', () => {
    const t = template()
    const { get } = load(t.sheets)
    expect(get({ action: 'bills' })).toEqual({ ok: true, bills: [] })
    expect(t.sheets.map((s) => s.name)).not.toContain('Recurring Payments')
  })

  it('creates the tab with headers on first save, then lists, updates and deletes', () => {
    const t = template()
    const { get, post } = load(t.sheets)
    expect(post({ action: 'billSave', bill: bill() })).toMatchObject({ ok: true, bill: { id: 'bill-rent', dueDay: 1 } })
    const tab = t.sheets.find((s) => s.name === 'Recurring Payments')!
    expect(tab.rows[0].slice(0, 7).map((c) => c.v)).toEqual(['Name', 'Amount', 'Category', 'Payment Mode', 'Due Day', 'Active', 'ID'])
    expect(tab.frozenRows).toBe(1)

    post({ action: 'billSave', bill: bill({ id: 'bill-net', name: 'Netflix', amount: 199, paymentMode: 'Credit Card', category: 'Lifestyle Enjoyment', dueDay: null }) })
    post({ action: 'billSave', bill: bill({ amount: 13000 }) }) // update by id, same row
    expect(get({ action: 'bills' }).bills).toEqual([
      { id: 'bill-rent', name: 'Rent', amount: 13000, category: 'Life Infrastructure', paymentMode: 'Bank Transfer', dueDay: 1, active: true },
      { id: 'bill-net', name: 'Netflix', amount: 199, category: 'Lifestyle Enjoyment', paymentMode: 'Credit Card', dueDay: null, active: true },
    ])
    expect(post({ action: 'billDelete', id: 'bill-rent' })).toEqual({ ok: true })
    expect(get({ action: 'bills' }).bills.map((b: { name: string }) => b.name)).toEqual(['Netflix'])
    expect(post({ action: 'billDelete', id: 'bill-rent' })).toEqual({ ok: false, error: 'NOT_FOUND' })
  })

  it('gives rows typed into the sheet by hand an ID, and reads unticked Active as off', () => {
    const t = template()
    const { get, post } = load(t.sheets)
    post({ action: 'billSave', bill: bill() })
    const tab = t.sheets.find((s) => s.name === 'Recurring Payments')!
    ;['Gym', 1500, 'Performance & Growth', 'Debit Card', 6, false, ''].forEach((v, j) => tab.set(3, j + 1, v))
    const gym = get({ action: 'bills' }).bills[1]
    expect(gym).toMatchObject({ name: 'Gym', active: false, dueDay: 6 })
    expect(gym.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(tab.cell(3, 7).v).toBe(gym.id) // written back, stable next time
    expect(get({ action: 'bills' }).bills[1].id).toBe(gym.id)
  })

  it('validates bills against the Setup lists', () => {
    const { post } = load(template().sheets)
    expect(post({ action: 'billSave', bill: bill({ category: 'Pets' }) }).error).toBe('BAD_CATEGORY')
    expect(post({ action: 'billSave', bill: bill({ paymentMode: 'Crypto' }) }).error).toBe('BAD_PAYMENT_MODE')
    expect(post({ action: 'billSave', bill: bill({ amount: 0 }) }).error).toBe('BAD_AMOUNT')
    expect(post({ action: 'billSave', bill: bill({ dueDay: 32 }) }).error).toBe('BAD_DUE_DAY')
    expect(post({ action: 'billSave', bill: bill({ name: ' ' }) }).error).toBe('BAD_DESCRIPTION')
  })

  it('never rebuilds the Yearly Calendar for bill changes', () => {
    const { post, ctx } = load(template().sheets)
    let builds = 0
    ctx.buildYearlyCalendar = () => { builds++ }
    post({ action: 'billSave', bill: bill() })
    expect(builds).toBe(0)
  })

  it('bootstrap says whether the App ID column exists', () => {
    const t = template()
    const { get, run } = load(t.sheets)
    expect(get({ action: 'bootstrap' }).data.appIdColumn).toBe(false)
    run('setupAppIdColumn')
    expect(get({ action: 'bootstrap' }).data.appIdColumn).toBe(true)
  })
})

describe('Apps Script: token helper', () => {
  it('generateToken stores a long random secret', () => {
    const props: Record<string, string> = {}
    const { run } = load(template().sheets, props)
    run('generateToken')
    expect(props.TOKEN).toMatch(/^[0-9a-f]{40}$/)
  })
})

describe('scripts/smoke-sheet.mjs', () => {
  it('passes end to end against the script served over HTTP', async () => {
    const t = template({ typeFormula: true })
    const { ctx } = load(t.sheets)
    const server = http.createServer((req, res) => {
      const u = new URL(req.url ?? '/', 'http://x')
      const parameter = Object.fromEntries(u.searchParams)
      let body = ''
      req.on('data', (c) => (body += c))
      req.on('end', () => {
        const out = req.method === 'POST'
          ? (ctx.doPost as (e: unknown) => { content: string })({ parameter, postData: { contents: body } })
          : (ctx.doGet as (e: unknown) => { content: string })({ parameter })
        res.setHeader('Content-Type', 'application/json')
        res.end(out.content)
      })
    })
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
    const port = (server.address() as { port: number }).port
    const result = await new Promise<{ code: number; out: string }>((resolve) =>
      execFile('node', [path.join(import.meta.dirname, '../scripts/smoke-sheet.mjs'), `http://127.0.0.1:${port}/exec`, TOKEN], (err, stdout) =>
        resolve({ code: err ? Number(err.code ?? 1) : 0, out: stdout })),
    )
    server.close()
    expect(result.out).not.toContain('FAIL')
    expect(result.code).toBe(0)
    expect(t.daily.rows.flat().some((c) => String(c.v).includes('SMOKE'))).toBe(false) // cleaned up
    expect(t.daily.rows[6][5].f).toMatch(/VLOOKUP/) // the row's Type formula survived add/update/delete
  }, 20000)
})
