const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
})
const num = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 })

export const formatINR = (n: number) => inr.format(n)
export const formatNumber = (n: number) => num.format(n)

/** ₹1.2k / ₹3.4L for tight chart axes. */
export function formatCompact(n: number): string {
  const abs = Math.abs(n)
  if (abs >= 100_000) return `₹${trim(n / 100_000)}L`
  if (abs >= 1_000) return `₹${trim(n / 1_000)}k`
  return `₹${Math.round(n)}`
}
const trim = (n: number) => String(Math.round(n * 10) / 10)

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
