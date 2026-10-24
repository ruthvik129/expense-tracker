#!/usr/bin/env node
// Milestone 2 acceptance check against your TEST COPY of the sheet.
// Usage: node scripts/smoke-sheet.mjs "<web-app URL ending in /exec>" "<token>"
// It adds one clearly-labelled row, edits it, deletes it, and checks each step.
// Reads the token from argv only; nothing is saved.

const [url, token] = process.argv.slice(2)
if (!url || !token) {
  console.error('Usage: node scripts/smoke-sheet.mjs "<web-app URL>" "<token>"')
  process.exit(2)
}

let failed = 0
const step = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`)
  if (!ok) failed++
}
const get = async (params) => {
  const u = new URL(url)
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v)
  return (await fetch(u)).json()
}
const post = async (body) =>
  (await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ token, ...body }) })).json()

const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date())
const id = `smoke-${crypto.randomUUID()}`

try {
  const bad = await get({ action: 'bootstrap', token: 'wrong' })
  step('wrong token is rejected', bad.ok === false && bad.error === 'UNAUTHORIZED', bad.error)

  const boot = await get({ action: 'bootstrap', token })
  step('bootstrap', boot.ok, boot.ok ? `${boot.data.categories.length} categories, ${boot.data.paymentModes.length} modes, weekly limit ${boot.data.weeklyLimit}, tz ${boot.data.sheetTimezone}` : boot.error)
  if (!boot.ok) throw new Error('cannot continue without bootstrap')

  const expense = {
    id, date: today, description: 'ZZ SMOKE TEST - safe to delete', amount: 1,
    category: boot.data.categories[0].name, paymentMode: boot.data.paymentModes[0], notes: 'scripts/smoke-sheet.mjs',
  }
  const added = await post({ action: 'add', expense })
  step('add', added.ok && added.row > 0, added.ok ? `row ${added.row}, id ${added.id}` : added.error)

  const again = await post({ action: 'add', expense })
  step('retried add does not duplicate', again.ok && again.row === added.row, `row ${again.row}`)

  const list = await get({ action: 'expenses', token, from: today, to: today })
  const mine = (list.expenses ?? []).filter((e) => e.description === expense.description)
  step('row reads back exactly once', mine.length === 1, `found ${mine.length}`)
  step('date reads back as the same day', mine[0]?.date === today, mine[0]?.date)

  const upd = await post({ action: 'update', id: added.id, row: added.row, expense: { ...expense, amount: 2, id: added.id, row: added.row } })
  step('update', upd.ok, upd.ok ? `row ${upd.row}` : upd.error)
  const after = await get({ action: 'expenses', token, from: today, to: today })
  step('update is visible', (after.expenses ?? []).some((e) => e.description === expense.description && e.amount === 2))

  const del = await post({ action: 'delete', id: upd.id ?? added.id, row: upd.row ?? added.row })
  step('delete', del.ok, del.error)
  const gone = await get({ action: 'expenses', token, from: today, to: today })
  step('row is gone', !(gone.expenses ?? []).some((e) => e.description === expense.description))
} catch (e) {
  step('request', false, e instanceof Error ? e.message : String(e))
}

console.log(failed ? `\n${failed} check(s) failed.` : '\nAll checks passed. Now open the sheet and confirm the analysis tabs still show no #REF/#N/A errors.')
process.exit(failed ? 1 : 0)
