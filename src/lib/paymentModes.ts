type Family = 'upi' | 'credit' | 'debit' | 'cash' | 'bank'

function family(name: string): Family | undefined {
  const s = name.toLowerCase()
  if (/upi|gpay|google pay|phonepe|phone pe|paytm|bhim/.test(s)) return 'upi'
  if (/credit|\bcc\b/.test(s)) return 'credit'
  if (/debit|\bdc\b/.test(s)) return 'debit'
  if (/cash/.test(s)) return 'cash'
  if (/bank|transfer|neft|imps|rtgs|net ?banking/.test(s)) return 'bank'
  return undefined
}

/**
 * The sheet's own spelling of a payment mode: exact, then ignoring case and spaces, then by
 * kind ("UPI" finds "GPay / UPI"). Undefined when the sheet has nothing like it.
 */
export function matchMode(name: string | undefined, modes: string[]): string | undefined {
  if (!name) return undefined
  if (modes.includes(name)) return name
  const key = (s: string) => s.toLowerCase().replace(/\s+/g, '')
  const loose = modes.find((m) => key(m) === key(name))
  if (loose) return loose
  const f = family(name)
  return f ? modes.find((m) => family(m) === f) : undefined
}
