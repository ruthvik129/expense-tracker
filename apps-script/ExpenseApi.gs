/**
 * @OnlyCurrentDoc  Limits the script's access to this one spreadsheet.
 *
 * Expense Tracker backend. Bound to your copy of the "Finance Tracker Template" sheet.
 *
 * Add this as a NEW file (ExpenseApi.gs) next to your existing Code.gs, in the TEST COPY first.
 * It shares one namespace with your other files, so its globals are prefixed EXPENSE_API.
 * See apps-script/README.md.
 *
 * Rules this script follows:
 * - Finds tables by header text, never by fixed cells.
 * - Writes values cell by cell. Never clears formats, validation or formulas.
 * - Never writes the Type column if that column holds any formula.
 * - Every request needs the shared secret stored in Script Properties as TOKEN.
 */

var EXPENSE_API = {
  DAILY_SHEET: 'Daily Expense Tracker',
  SETUP_SHEET: 'Setup',
  HEADER_SCAN_ROWS: 30,
  RECENT_ADDS_KEPT: 100,
  APP_ID_HEADER: 'App ID',
  BILLS_SHEET: 'Recurring Payments',
};

/** Columns of the Recurring Payments tab, in the order the tab is created with. */
var EXPENSE_API_BILL_HEADERS = ['Name', 'Amount', 'Category', 'Payment Mode', 'Due Day', 'Active', 'ID'];

var EXPENSE_API_HEADERS = {
  date: 'date',
  description: 'description',
  category: 'category',
  amount: 'amount',
  paymentMode: 'payment mode',
  type: 'type',
  notes: 'notes',
  appId: 'app id',
};
var EXPENSE_API_REQUIRED = ['date', 'description', 'category', 'amount', 'paymentMode'];

// ---------------------------------------------------------------------------
// Web app entry points
// ---------------------------------------------------------------------------

function doGet(e) {
  return respond_(function () {
    return route_((e && e.parameter) || {}, null);
  });
}

function doPost(e) {
  return respond_(function () {
    var body;
    try {
      body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    } catch (_) {
      throw fail_('BAD_REQUEST');
    }
    return route_((e && e.parameter) || {}, body);
  });
}

function respond_(fn) {
  var out;
  try {
    var result = fn();
    out = { ok: true };
    for (var k in result) out[k] = result[k];
  } catch (err) {
    var known = err && err.code;
    // Stack traces go to the private execution log only, never to the caller.
    if (!known) console.error(err && err.stack ? err.stack : err);
    out = { ok: false, error: known ? err.code : 'INTERNAL' };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function route_(params, body) {
  var req = {};
  var k;
  for (k in params) req[k] = params[k];
  for (k in body || {}) req[k] = body[k];
  checkToken_(req.token);

  switch (req.action) {
    case 'bootstrap':
      return { data: bootstrap_() };
    case 'expenses':
      return { expenses: listExpenses_(req.from, req.to) };
    case 'add':
      return withLock_(function () { return addExpense_(req.expense); });
    case 'update':
      return withLock_(function () { return updateExpense_(req.id, req.expense, req.row); });
    case 'delete':
      return withLock_(function () { return deleteExpense_(req.id, req.row); });
    // Recurring payments live in their own tab and never touch the daily table,
    // so they skip the calendar rebuild.
    case 'bills':
      return withLock_(function () { return { bills: listBills_() }; }, true);
    case 'billSave':
      return withLock_(function () { return { bill: saveBill_(req.bill) }; }, true);
    case 'billDelete':
      return withLock_(function () { deleteBill_(req.id); return {}; }, true);
    default:
      throw fail_('BAD_REQUEST');
  }
}

function fail_(code) {
  var e = new Error(code);
  e.code = code;
  return e;
}

function checkToken_(token) {
  var expected = PropertiesService.getScriptProperties().getProperty('TOKEN');
  if (!expected) throw fail_('TOKEN_NOT_SET');
  if (!token || !safeEqual_(String(token), expected)) {
    // Reject fast and keep only a count, never the attempted value.
    var cache = CacheService.getScriptCache();
    var n = Number(cache.get('badTokens') || 0) + 1;
    cache.put('badTokens', String(n), 3600);
    if (n % 10 === 1) console.warn('Rejected requests with a bad token in the last hour: ' + n);
    throw fail_('UNAUTHORIZED');
  }
}

function safeEqual_(a, b) {
  if (a.length !== b.length) return false;
  var diff = 0;
  for (var i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function withLock_(fn, skipRefresh) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw fail_('LOCK_TIMEOUT');
  var result;
  try {
    result = fn();
  } finally {
    lock.releaseLock();
  }
  if (!skipRefresh) refreshSheetViews_();
  return result;
}

/**
 * onEdit only fires for edits made by hand, never for script writes. Do what your onEdit
 * does for the Daily tab (rebuild the Yearly Calendar) so the sheet stays current.
 * A failure here never fails the write: the row is already saved.
 */
function refreshSheetViews_() {
  if (typeof buildYearlyCalendar !== 'function') return;
  try {
    SpreadsheetApp.flush();
    buildYearlyCalendar();
  } catch (err) {
    console.warn('Yearly Calendar refresh failed after an app write: ' + (err && err.message));
  }
}

// ---------------------------------------------------------------------------
// Setup tab (read-only)
// ---------------------------------------------------------------------------

function bootstrap_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(EXPENSE_API.SETUP_SHEET);
  if (!sh) throw fail_('SETUP_NOT_FOUND');
  var grid = sh.getDataRange().getValues();
  var setup = readSetup_(grid);
  setup.sheetTimezone = ss.getSpreadsheetTimeZone();
  // Lets the app know whether logged bills can be recognised by their App ID.
  try {
    setup.appIdColumn = !!table_().cols.appId;
  } catch (_) {
    setup.appIdColumn = false;
  }
  return setup;
}

function readSetup_(grid) {
  function find(label) {
    for (var r = 0; r < grid.length; r++) {
      for (var c = 0; c < grid[r].length; c++) {
        if (norm_(grid[r][c]) === label) return { r: r, c: c };
      }
    }
    return null;
  }
  function blank(v) {
    return v === '' || v === null || v === undefined;
  }

  var categories = [];
  var cl = find('category list');
  if (cl) {
    // Type is the "Type" header on the same row, else the next column.
    var typeCol = cl.c + 1;
    for (var c = cl.c + 1; c < grid[cl.r].length; c++) {
      if (norm_(grid[cl.r][c]) === 'type') { typeCol = c; break; }
    }
    for (var r = cl.r + 1; r < grid.length && !blank(grid[r][cl.c]); r++) {
      categories.push({ name: String(grid[r][cl.c]).trim(), type: normType_(grid[r][typeCol]) });
    }
  }

  var paymentModes = [];
  var pm = find('payment mode') || find('payment modes');
  if (pm) {
    for (var r2 = pm.r + 1; r2 < grid.length && !blank(grid[r2][pm.c]); r2++) {
      paymentModes.push(String(grid[r2][pm.c]).trim());
    }
  }

  var weeklyLimit = 0;
  var wl = find('weekly limit');
  if (wl) {
    var below = wl.r + 1 < grid.length ? grid[wl.r + 1][wl.c] : '';
    var right = grid[wl.r][wl.c + 1];
    weeklyLimit = toNumber_(below) || toNumber_(right) || 0;
  }

  var budgets = [];
  var yr = find('year');
  if (yr) {
    var cols = {};
    for (var c2 = yr.c; c2 < grid[yr.r].length; c2++) {
      var h = norm_(grid[yr.r][c2]);
      if (h === 'salary' || h === 'needs' || h === 'wants' || h === 'savings') cols[h] = c2;
    }
    for (var r3 = yr.r + 1; r3 < grid.length; r3++) {
      var year = toNumber_(grid[r3][yr.c]);
      if (!year) break;
      budgets.push({
        year: year,
        salary: toNumber_(grid[r3][cols.salary]) || 0,
        needs: toNumber_(grid[r3][cols.needs]) || 0,
        wants: toNumber_(grid[r3][cols.wants]) || 0,
        savings: toNumber_(grid[r3][cols.savings]) || 0,
      });
    }
  }

  return { categories: categories, paymentModes: paymentModes, weeklyLimit: weeklyLimit, budgets: budgets };
}

function normType_(v) {
  var t = norm_(v);
  if (t.indexOf('want') === 0) return 'Want';
  if (t.indexOf('saving') === 0) return 'Saving';
  return 'Need';
}

// ---------------------------------------------------------------------------
// Daily Expense Tracker table
// ---------------------------------------------------------------------------

function table_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(EXPENSE_API.DAILY_SHEET);
  if (!sh) throw fail_('SHEET_NOT_FOUND');
  var scanRows = Math.min(EXPENSE_API.HEADER_SCAN_ROWS, sh.getMaxRows());
  var scan = sh.getRange(1, 1, scanRows, sh.getMaxColumns()).getValues();
  for (var r = 0; r < scan.length; r++) {
    var row = scan[r].map(norm_);
    if (row.indexOf(EXPENSE_API_HEADERS.date) < 0 || row.indexOf(EXPENSE_API_HEADERS.description) < 0) continue;
    var cols = {};
    for (var key in EXPENSE_API_HEADERS) cols[key] = row.indexOf(EXPENSE_API_HEADERS[key]) + 1; // 0 = column missing
    for (var i = 0; i < EXPENSE_API_REQUIRED.length; i++) if (!cols[EXPENSE_API_REQUIRED[i]]) throw fail_('HEADER_NOT_FOUND');
    var width = 0;
    for (var k in cols) width = Math.max(width, cols[k]);
    return {
      sh: sh,
      headerRow: r + 1,
      cols: cols,
      width: width,
      tz: ss.getSpreadsheetTimeZone(),
      typeHasFormula: columnHasFormula_(sh, r + 1, cols.type),
    };
  }
  throw fail_('HEADER_NOT_FOUND');
}

function columnHasFormula_(sh, headerRow, col) {
  if (!col) return false;
  var n = sh.getMaxRows() - headerRow + 1;
  // Include the header cell: an ARRAYFORMULA there fills the whole column.
  var formulas = sh.getRange(headerRow, col, n, 1).getFormulas();
  for (var i = 0; i < formulas.length; i++) if (formulas[i][0]) return true;
  return false;
}

/** All data rows (any row with a date) as { row, values }. */
function dataRows_(t) {
  var last = t.sh.getLastRow();
  if (last <= t.headerRow) return [];
  var values = t.sh.getRange(t.headerRow + 1, 1, last - t.headerRow, t.width).getValues();
  var out = [];
  for (var i = 0; i < values.length; i++) {
    if (blank_(values[i][t.cols.date - 1])) continue;
    out.push({ row: t.headerRow + 1 + i, values: values[i] });
  }
  return out;
}

function toExpense_(t, r) {
  var v = function (key) { return t.cols[key] ? r.values[t.cols[key] - 1] : ''; };
  var date = toYmd_(v('date'), t.tz);
  if (!date) return null;
  var description = String(v('description')).trim();
  var amount = toNumber_(v('amount')) || 0;
  var appId = t.cols.appId ? String(v('appId')).trim() : '';
  return {
    id: appId || 'h:' + hash_(date, description, amount),
    row: r.row,
    date: date,
    description: description,
    category: String(v('category')).trim(),
    amount: amount,
    paymentMode: String(v('paymentMode')).trim(),
    type: normType_(v('type')),
    notes: String(v('notes')).trim(),
  };
}

function listExpenses_(from, to) {
  if (!isYmd_(from) || !isYmd_(to)) throw fail_('BAD_REQUEST');
  var t = table_();
  var out = [];
  var rows = dataRows_(t);
  for (var i = 0; i < rows.length; i++) {
    var e = toExpense_(t, rows[i]);
    if (e && e.date >= from && e.date <= to) out.push(e);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

function addExpense_(x) {
  var t = table_();
  var setup = bootstrap_();
  validate_(x, setup);

  // Idempotent: a retried add returns the row it already created.
  if (t.cols.appId) {
    var found = findByAppId_(t, x.id);
    if (found) return { id: x.id, row: found };
  } else {
    var seen = recentAdds_()[x.id];
    if (seen) {
      var again = findByHash_(t, seen, 0);
      return { id: 'h:' + seen, row: again || -1 };
    }
  }

  var row = firstEmptyRow_(t);
  writeRow_(t, row, x, setup);
  var h = hash_(x.date, String(x.description).trim(), Number(x.amount));
  if (!t.cols.appId) rememberAdd_(x.id, h);
  return { id: t.cols.appId ? x.id : 'h:' + h, row: row };
}

function updateExpense_(id, x, rowHint) {
  if (!id) throw fail_('BAD_REQUEST');
  var t = table_();
  var setup = bootstrap_();
  validate_(x, setup);
  var row = locate_(t, String(id), Number(rowHint) || 0);
  var keepAppId = !String(id).startsWith('h:');
  writeRow_(t, row, keepAppId ? x : copyWithoutId_(x), setup);
  var newId = keepAppId ? id : 'h:' + hash_(x.date, String(x.description).trim(), Number(x.amount));
  return { id: newId, row: row };
}

function deleteExpense_(id, rowHint) {
  if (!id) throw fail_('BAD_REQUEST');
  var t = table_();
  var row = locate_(t, String(id), Number(rowHint) || 0);
  t.sh.deleteRow(row);
  return {};
}

function copyWithoutId_(x) {
  var y = {};
  for (var k in x) if (k !== 'id') y[k] = x[k];
  return y;
}

function validate_(x, setup) {
  if (!x || typeof x !== 'object') throw fail_('BAD_REQUEST');
  if (!isYmd_(x.date)) throw fail_('BAD_DATE');
  var amount = Number(x.amount);
  if (!isFinite(amount) || amount <= 0) throw fail_('BAD_AMOUNT');
  if (!String(x.description || '').trim()) throw fail_('BAD_DESCRIPTION');
  if (!setup.categories.some(function (c) { return c.name === x.category; })) throw fail_('BAD_CATEGORY');
  if (setup.paymentModes.indexOf(x.paymentMode) < 0) throw fail_('BAD_PAYMENT_MODE');
}

/** First row under the header whose Date, Description and Amount are all empty. */
function firstEmptyRow_(t) {
  var max = t.sh.getMaxRows();
  var n = max - t.headerRow;
  if (n > 0) {
    var values = t.sh.getRange(t.headerRow + 1, 1, n, t.width).getValues();
    for (var i = 0; i < values.length; i++) {
      var v = values[i];
      if (blank_(v[t.cols.date - 1]) && blank_(v[t.cols.description - 1]) && blank_(v[t.cols.amount - 1])) {
        return t.headerRow + 1 + i;
      }
    }
  }
  // Table is full: add one row at the bottom (it inherits the formatting of the row above).
  t.sh.insertRowAfter(max);
  return max + 1;
}

/** Values only, one cell at a time, so formats, validation and other formulas stay intact. */
function writeRow_(t, row, x, setup) {
  function put(key, value) {
    if (t.cols[key]) t.sh.getRange(row, t.cols[key]).setValue(value);
  }
  put('date', toSheetDate_(x.date, t.tz));
  put('description', String(x.description).trim());
  put('category', x.category);
  put('amount', Math.round(Number(x.amount) * 100) / 100);
  put('paymentMode', x.paymentMode);
  if (t.cols.type && !t.typeHasFormula) {
    var cat = setup.categories.filter(function (c) { return c.name === x.category; })[0];
    put('type', cat ? cat.type : 'Need');
  }
  put('notes', String(x.notes || '').trim());
  if (t.cols.appId && x.id) put('appId', x.id);
}

function locate_(t, id, rowHint) {
  if (id.startsWith('h:')) {
    var row = findByHash_(t, id.slice(2), rowHint);
    if (!row) throw fail_('STALE');
    return row;
  }
  if (!t.cols.appId) throw fail_('NOT_FOUND');
  var found = findByAppId_(t, id);
  if (!found) throw fail_('NOT_FOUND');
  return found;
}

function findByAppId_(t, id) {
  var rows = dataRows_(t);
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].values[t.cols.appId - 1]).trim() === id) return rows[i].row;
  }
  return 0;
}

/**
 * Rows without an App ID are matched by date + description + amount. The row hint is
 * checked first; if rows moved, a single unique match elsewhere is accepted.
 */
function findByHash_(t, h, rowHint) {
  var rows = dataRows_(t);
  var matches = [];
  for (var i = 0; i < rows.length; i++) {
    var e = toExpense_(t, rows[i]);
    if (!e) continue;
    if (hash_(e.date, e.description, e.amount) !== h) continue;
    if (rows[i].row === rowHint) return rowHint;
    matches.push(rows[i].row);
  }
  return matches.length === 1 ? matches[0] : 0;
}

function recentAdds_() {
  try {
    return JSON.parse(PropertiesService.getScriptProperties().getProperty('RECENT_ADDS') || '{}');
  } catch (_) {
    return {};
  }
}

function rememberAdd_(id, h) {
  var map = recentAdds_();
  map[id] = h;
  var keys = Object.keys(map);
  while (keys.length > EXPENSE_API.RECENT_ADDS_KEPT) delete map[keys.shift()];
  PropertiesService.getScriptProperties().setProperty('RECENT_ADDS', JSON.stringify(map));
}

// ---------------------------------------------------------------------------
// Recurring Payments tab (the app's list of monthly bills)
// ---------------------------------------------------------------------------

/** The tab, created with headers on first save. Reads never create it. */
function billsSheet_(create) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(EXPENSE_API.BILLS_SHEET);
  if (sh || !create) return sh;
  sh = ss.insertSheet(EXPENSE_API.BILLS_SHEET);
  var header = sh.getRange(1, 1, 1, EXPENSE_API_BILL_HEADERS.length);
  header.setValues([EXPENSE_API_BILL_HEADERS]);
  header.setFontWeight('bold');
  sh.setFrozenRows(1);
  return sh;
}

function billCols_(sh) {
  var row = sh.getRange(1, 1, 1, sh.getMaxColumns()).getValues()[0].map(norm_);
  var cols = {};
  var keys = { name: 'name', amount: 'amount', category: 'category', paymentMode: 'payment mode', dueDay: 'due day', active: 'active', id: 'id' };
  for (var k in keys) cols[k] = row.indexOf(keys[k]) + 1;
  if (!cols.name || !cols.amount || !cols.category || !cols.paymentMode || !cols.id) throw fail_('BILLS_HEADER_NOT_FOUND');
  var width = 0;
  for (var c in cols) width = Math.max(width, cols[c]);
  return { cols: cols, width: width };
}

/** Every bill row. Rows typed into the sheet by hand get an ID on first read. */
function listBills_() {
  var sh = billsSheet_(false);
  if (!sh) return [];
  var b = billCols_(sh);
  var last = sh.getLastRow();
  if (last < 2) return [];
  var values = sh.getRange(2, 1, last - 1, b.width).getValues();
  var out = [];
  for (var i = 0; i < values.length; i++) {
    var v = values[i];
    var get = function (key) { return b.cols[key] ? v[b.cols[key] - 1] : ''; };
    var name = String(get('name')).trim();
    if (!name) continue;
    var id = String(get('id')).trim();
    if (!id) {
      id = Utilities.getUuid();
      sh.getRange(2 + i, b.cols.id).setValue(id);
    }
    var due = Math.round(toNumber_(get('dueDay')));
    var active = get('active');
    out.push({
      id: id,
      name: name,
      amount: toNumber_(get('amount')),
      category: String(get('category')).trim(),
      paymentMode: String(get('paymentMode')).trim(),
      dueDay: due >= 1 && due <= 31 ? due : null,
      active: !(active === false || /^(false|no|n|0)$/i.test(String(active).trim())),
    });
  }
  return out;
}

function saveBill_(bill) {
  if (!bill || typeof bill !== 'object') throw fail_('BAD_REQUEST');
  var name = String(bill.name || '').trim();
  if (!name) throw fail_('BAD_DESCRIPTION');
  var amount = Number(bill.amount);
  if (!isFinite(amount) || amount <= 0) throw fail_('BAD_AMOUNT');
  var due = bill.dueDay === null || bill.dueDay === undefined || bill.dueDay === '' ? '' : Number(bill.dueDay);
  if (due !== '' && !(due >= 1 && due <= 31 && Math.round(due) === due)) throw fail_('BAD_DUE_DAY');
  var setup = bootstrap_();
  if (!setup.categories.some(function (c) { return c.name === bill.category; })) throw fail_('BAD_CATEGORY');
  if (setup.paymentModes.indexOf(bill.paymentMode) < 0) throw fail_('BAD_PAYMENT_MODE');

  var sh = billsSheet_(true);
  var b = billCols_(sh);
  var id = String(bill.id || '').trim() || Utilities.getUuid();
  var row = findBillRow_(sh, b, id);
  if (!row) {
    row = Math.max(sh.getLastRow(), 1) + 1;
    if (row > sh.getMaxRows()) sh.insertRowAfter(sh.getMaxRows());
  }
  var put = function (key, value) { if (b.cols[key]) sh.getRange(row, b.cols[key]).setValue(value); };
  put('name', name);
  put('amount', Math.round(amount * 100) / 100);
  put('category', bill.category);
  put('paymentMode', bill.paymentMode);
  put('dueDay', due);
  put('active', bill.active !== false);
  put('id', id);
  return { id: id, name: name, amount: Math.round(amount * 100) / 100, category: bill.category, paymentMode: bill.paymentMode, dueDay: due === '' ? null : due, active: bill.active !== false };
}

function deleteBill_(id) {
  if (!id) throw fail_('BAD_REQUEST');
  var sh = billsSheet_(false);
  var row = sh ? findBillRow_(sh, billCols_(sh), String(id)) : 0;
  if (!row) throw fail_('NOT_FOUND');
  sh.deleteRow(row);
}

function findBillRow_(sh, b, id) {
  var last = sh.getLastRow();
  if (last < 2) return 0;
  var ids = sh.getRange(2, b.cols.id, last - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) if (String(ids[i][0]).trim() === id) return 2 + i;
  return 0;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function norm_(v) {
  return String(v === null || v === undefined ? '' : v).trim().toLowerCase().replace(/\s+/g, ' ');
}

function blank_(v) {
  return v === '' || v === null || v === undefined;
}

function isYmd_(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function toNumber_(v) {
  if (typeof v === 'number') return v;
  var n = parseFloat(String(v || '').replace(/[₹,\s]|rs\.?/gi, ''));
  return isFinite(n) ? n : 0;
}

var EXPENSE_API_MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

/** A sheet date (real Date, or text like "Thu, 01 Jan 2026") as YYYY-MM-DD in the sheet's timezone. */
function toYmd_(v, tz) {
  if (v instanceof Date && !isNaN(v.getTime())) return Utilities.formatDate(v, tz, 'yyyy-MM-dd');
  var s = String(v || '').trim();
  if (isYmd_(s)) return s;
  var m = s.match(/(\d{1,2})[\s-]+([A-Za-z]{3})[A-Za-z]*[\s-]+(\d{4})/);
  if (m && EXPENSE_API_MONTHS[m[2].toLowerCase()]) {
    return m[3] + '-' + pad2_(EXPENSE_API_MONTHS[m[2].toLowerCase()]) + '-' + pad2_(Number(m[1]));
  }
  var d = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (d) return d[3] + '-' + pad2_(Number(d[2])) + '-' + pad2_(Number(d[1]));
  return '';
}

/** Midnight of that day in the sheet's timezone, so the sheet's own date maths keeps working. */
function toSheetDate_(ymd, tz) {
  return Utilities.parseDate(ymd, tz, 'yyyy-MM-dd');
}

function pad2_(n) {
  return (n < 10 ? '0' : '') + n;
}

/** FNV-1a over date|description|amount. Identifies rows that have no App ID. */
function hash_(date, description, amount) {
  var s = date + '|' + String(description).trim().toLowerCase() + '|' + Number(amount).toFixed(2);
  var h = 0x811c9dc5;
  for (var i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return ('0000000' + h.toString(16)).slice(-8);
}

// ---------------------------------------------------------------------------
// Run these from the editor (pick the function, press Run, read the Execution log)
// ---------------------------------------------------------------------------

/** Creates a random shared secret, stores it as TOKEN, and logs it once for you to copy. */
function generateToken() {
  var bytes = Utilities.getUuid() + Utilities.getUuid();
  var token = bytes.replace(/-/g, '').slice(0, 40);
  PropertiesService.getScriptProperties().setProperty('TOKEN', token);
  console.log('TOKEN set. Paste this into the app Settings, then clear this log: ' + token);
}

/** Read-only health check of the sheet layout. Nothing is written. */
function diagnose() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var lines = [];
  var t;
  try {
    t = table_();
  } catch (e) {
    console.log('Daily table: ' + (e.code || e.message));
    return;
  }
  var names = Object.keys(t.cols).filter(function (k) { return t.cols[k]; })
    .map(function (k) { return k + '=' + columnLetter_(t.cols[k]); });
  lines.push('Daily table header row: ' + t.headerRow + ' | columns: ' + names.join(', '));
  lines.push('Type column: ' + (t.typeHasFormula ? 'has formulas, the app will NOT write it' : 'typed values, the app writes it from the Setup lookup'));
  lines.push('Data rows: ' + dataRows_(t).length + ' | next entry goes to row ' + peekFirstEmptyRow_(t));
  var next = peekFirstEmptyRow_(t);
  var dv = t.sh.getRange(next, t.cols.category).getDataValidation();
  lines.push('Dropdown on the next empty row Category cell: ' + (dv ? 'yes (kept)' : 'no'));
  lines.push('App ID column: ' + (t.cols.appId ? 'present at ' + columnLetter_(t.cols.appId) : 'not added yet'));

  var free = t.width + 1;
  var colEmpty = t.cols.appId ? true : columnEmpty_(t.sh, free);
  if (!t.cols.appId) lines.push('Column ' + columnLetter_(free) + ' (first after the table): ' + (colEmpty ? 'empty' : 'NOT empty'));

  var risky = wholeRangeRefs_(ss, t.sh.getName());
  lines.push(risky.length ? 'Formulas using whole rows/columns of the daily tab (check before adding App ID):\n  ' + risky.join('\n  ') : 'No formulas use whole rows or wide ranges of the daily tab.');
  var setup = bootstrap_();
  lines.push('Setup: ' + setup.categories.length + ' categories, ' + setup.paymentModes.length + ' payment modes, weekly limit ' + setup.weeklyLimit + ', ' + setup.budgets.length + ' budget years');
  lines.push(!t.cols.appId && colEmpty && !risky.length ? 'Verdict: safe to run setupAppIdColumn().' : 'Verdict: ' + (t.cols.appId ? 'App ID already set up.' : 'review the notes above before setupAppIdColumn(); the app also works without it.'));
  console.log(lines.join('\n'));
}

/** Adds a hidden "App ID" column right after the table, for exact edits and duplicate-proof retries. */
function setupAppIdColumn() {
  var t = table_();
  if (t.cols.appId) {
    console.log('App ID column already exists at ' + columnLetter_(t.cols.appId));
    return;
  }
  var col = t.width + 1;
  if (col > t.sh.getMaxColumns()) t.sh.insertColumnAfter(t.sh.getMaxColumns());
  if (!columnEmpty_(t.sh, col)) {
    console.log('Column ' + columnLetter_(col) + ' is not empty. Nothing changed.');
    return;
  }
  t.sh.getRange(t.headerRow, col).setValue(EXPENSE_API.APP_ID_HEADER);
  t.sh.hideColumns(col);
  console.log('Added hidden "App ID" header at ' + columnLetter_(col) + t.headerRow + '. Existing rows keep working by content match.');
}

function peekFirstEmptyRow_(t) {
  var max = t.sh.getMaxRows();
  var n = max - t.headerRow;
  if (n <= 0) return max + 1;
  var values = t.sh.getRange(t.headerRow + 1, 1, n, t.width).getValues();
  for (var i = 0; i < values.length; i++) {
    var v = values[i];
    if (blank_(v[t.cols.date - 1]) && blank_(v[t.cols.description - 1]) && blank_(v[t.cols.amount - 1])) return t.headerRow + 1 + i;
  }
  return max + 1;
}

function columnEmpty_(sh, col) {
  if (col > sh.getMaxColumns()) return true;
  var vals = sh.getRange(1, col, sh.getMaxRows(), 1).getValues();
  var forms = sh.getRange(1, col, sh.getMaxRows(), 1).getFormulas();
  for (var i = 0; i < vals.length; i++) if (!blank_(vals[i][0]) || forms[i][0]) return false;
  return true;
}

/** Formulas anywhere that reference the daily tab with whole rows (5:5) or ranges wider than A:G. */
function wholeRangeRefs_(ss, dailyName) {
  var out = [];
  var esc = dailyName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  var ref = new RegExp("(?:'" + esc + "'|" + esc.replace(/ /g, '') + ")!\\$?([A-Z]+)?\\$?(\\d+)?:\\$?([A-Z]+)?\\$?(\\d+)?", 'gi');
  ss.getSheets().forEach(function (sh) {
    var range = sh.getDataRange();
    var formulas = range.getFormulas();
    for (var r = 0; r < formulas.length; r++) {
      for (var c = 0; c < formulas[r].length; c++) {
        var f = formulas[r][c];
        if (!f) continue;
        var m;
        ref.lastIndex = 0;
        while ((m = ref.exec(f))) {
          var wholeRow = !m[1] && !m[3] && m[2] && m[4];
          var wide = m[3] && columnNumber_(m[3]) > 7;
          if (wholeRow || wide) out.push(sh.getName() + '!' + columnLetter_(c + 1) + (r + 1) + ': ' + f.slice(0, 80));
        }
      }
    }
  });
  return out.slice(0, 20);
}

function columnLetter_(n) {
  var s = '';
  while (n > 0) {
    var m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function columnNumber_(letters) {
  var n = 0;
  for (var i = 0; i < letters.length; i++) n = n * 26 + (letters.toUpperCase().charCodeAt(i) - 64);
  return n;
}
