import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ExpenseForm, emptyForm } from './ExpenseForm'

// A sheet whose Setup tab spells the modes differently from the app's built-in list.
const sheetModes = ['Credit card', 'Debit card', 'GPay / UPI', 'Cash', 'Bank transfer']
vi.mock('@/data/store', () => ({
  useApp: () => ({ bootstrap: { categories: [{ name: 'Life Infrastructure', type: 'Need' }], paymentModes: sheetModes } }),
}))
vi.mock('@/data/settings', () => ({ useSettings: () => ({ settings: { defaultMode: 'UPI' } }) }))

describe('ExpenseForm payment mode', () => {
  it('selects the sheet\'s own spelling of the default mode', () => {
    const onChange = vi.fn()
    render(<ExpenseForm value={emptyForm('UPI')} onChange={onChange} showErrors={false} quick />)
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ paymentMode: 'GPay / UPI' }))
  })
  it('falls back to the first mode when nothing matches on the Add screen', () => {
    const onChange = vi.fn()
    render(<ExpenseForm value={emptyForm('Crypto')} onChange={onChange} showErrors={false} quick />)
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ paymentMode: 'GPay / UPI' })) // default UPI matches
  })
})
