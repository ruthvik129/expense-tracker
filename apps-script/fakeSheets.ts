/**
 * Just enough of SpreadsheetApp & friends to run ExpenseApi.gs under Node for tests.
 * Cells hold a value and an optional formula; validations and formats are tracked so tests
 * can prove the script never clears them.
 */
type Cell = { v: unknown; f: string }

export class FakeSheet {
  rows: Cell[][]
  validations = new Map<string, { list: string[] }>()
  formats = new Map<string, string>()
  hidden = new Set<number>()
  frozenRows = 0
  bold = new Set<string>()
  constructor(public name: string, maxRows: number, maxCols: number) {
    this.rows = Array.from({ length: maxRows }, () => FakeSheet.blankRow(maxCols))
  }
  static blankRow(n: number): Cell[] {
    return Array.from({ length: n }, () => ({ v: '', f: '' }))
  }
  getName() { return this.name }
  getMaxRows() { return this.rows.length }
  getMaxColumns() { return this.rows[0].length }
  getLastRow() {
    for (let r = this.rows.length; r >= 1; r--) if (this.rows[r - 1].some((c) => c.v !== '' || c.f)) return r
    return 0
  }
  getLastColumn() {
    let last = 0
    for (const row of this.rows) row.forEach((c, i) => { if (c.v !== '' || c.f) last = Math.max(last, i + 1) })
    return last
  }
  cell(r: number, c: number) {
    const cell = this.rows[r - 1]?.[c - 1]
    if (!cell) throw new Error(`out of range ${r},${c}`)
    return cell
  }
  set(r: number, c: number, v: unknown, f = '') { Object.assign(this.cell(r, c), { v, f }) }
  getRange(r: number, c: number, nr = 1, nc = 1) { return new FakeRange(this, r, c, nr, nc) }
  getDataRange() { return this.getRange(1, 1, Math.max(1, this.getLastRow()), Math.max(1, this.getLastColumn())) }
  deleteRow(r: number) {
    this.rows.splice(r - 1, 1)
    this.shiftKeys(r, -1)
  }
  insertRowAfter(r: number) {
    // Like Sheets: the new row copies formats/validation of the row above, not values.
    this.rows.splice(r, 0, FakeSheet.blankRow(this.getMaxColumns()))
    this.shiftKeys(r + 1, 1)
    for (let c = 1; c <= this.getMaxColumns(); c++) {
      const v = this.validations.get(`${r},${c}`)
      if (v) this.validations.set(`${r + 1},${c}`, v)
      const fm = this.formats.get(`${r},${c}`)
      if (fm) this.formats.set(`${r + 1},${c}`, fm)
    }
  }
  insertColumnAfter() { for (const row of this.rows) row.push({ v: '', f: '' }) }
  hideColumns(c: number) { this.hidden.add(c) }
  setFrozenRows(n: number) { this.frozenRows = n }
  private shiftKeys(from: number, by: number) {
    for (const m of [this.validations, this.formats]) {
      const entries = [...m.entries()]
      m.clear()
      for (const [k, v] of entries) {
        const [r, c] = k.split(',').map(Number)
        if (by < 0 && r === from) continue
        m.set(`${r >= from ? r + by : r},${c}`, v as never)
      }
    }
  }
}

export class FakeRange {
  constructor(private sh: FakeSheet, private r: number, private c: number, private nr: number, private nc: number) {}
  private map<T>(fn: (cell: Cell) => T): T[][] {
    return Array.from({ length: this.nr }, (_, i) => Array.from({ length: this.nc }, (_, j) => fn(this.sh.cell(this.r + i, this.c + j))))
  }
  getValues() { return this.map((c) => c.v) }
  getFormulas() { return this.map((c) => c.f) }
  getFormula() { return this.sh.cell(this.r, this.c).f }
  getValue() { return this.sh.cell(this.r, this.c).v }
  getDataValidation() { return this.sh.validations.get(`${this.r},${this.c}`) ?? null }
  setValues(rows: unknown[][]) {
    rows.forEach((row, i) => row.forEach((v, j) => this.sh.set(this.r + i, this.c + j, v)))
    return this
  }
  setFontWeight(w: string) {
    for (let i = 0; i < this.nr; i++) for (let j = 0; j < this.nc; j++) if (w === 'bold') this.sh.bold.add(`${this.r + i},${this.c + j}`)
    return this
  }
  setValue(v: unknown) {
    const rule = this.sh.validations.get(`${this.r},${this.c}`)
    if (rule && !rule.list.includes(String(v))) throw new Error('violates data validation')
    this.sh.set(this.r, this.c, v) // overwrites a formula, exactly like Sheets would
  }
}

export function makeServices(sheets: FakeSheet[], tz = 'Asia/Kolkata', props: Record<string, string> = {}) {
  const cache = new Map<string, string>()
  const logs: string[] = []
  return {
    logs,
    props,
    globals: {
      SpreadsheetApp: {
        flush: () => undefined,
        getActiveSpreadsheet: () => ({
          getSheetByName: (n: string) => sheets.find((s) => s.name === n) ?? null,
          getSheets: () => sheets,
          insertSheet: (n: string) => {
            const sh = new FakeSheet(n, 20, 8)
            sheets.push(sh)
            return sh
          },
          getSpreadsheetTimeZone: () => tz,
        }),
      },
      ContentService: {
        MimeType: { JSON: 'application/json' },
        createTextOutput: (s: string) => ({ content: s, setMimeType() { return this } }),
      },
      PropertiesService: {
        getScriptProperties: () => ({
          getProperty: (k: string) => props[k] ?? null,
          setProperty: (k: string, v: string) => { props[k] = v },
        }),
      },
      CacheService: { getScriptCache: () => ({ get: (k: string) => cache.get(k) ?? null, put: (k: string, v: string) => void cache.set(k, v) }) },
      LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => undefined }) },
      Utilities: {
        formatDate: (d: Date, zone: string) =>
          new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d),
        parseDate: (s: string) => new Date(`${s}T00:00:00+05:30`), // tests run in IST
        getUuid: () => crypto.randomUUID(),
      },
      console: { log: (m: string) => logs.push(m), warn: (m: string) => logs.push(m), error: (m: string) => logs.push(String(m)) },
    },
  }
}
