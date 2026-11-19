import { describe, expect, it } from 'vitest'
import {
  formatVoucherExpiryLabel,
  hasVoucherExpiry,
  isPastVoucherExpiry,
} from './voucherExpiry'

describe('voucherExpiry', () => {
  it('treats null/empty as non-expiring', () => {
    expect(hasVoucherExpiry(null)).toBe(false)
    expect(hasVoucherExpiry('')).toBe(false)
    expect(isPastVoucherExpiry(null, Date.now())).toBe(false)
    expect(formatVoucherExpiryLabel(null)).toBe('No expiry')
  })

  it('keeps historical dated expiry behavior', () => {
    expect(hasVoucherExpiry('2020-01-01T00:00:00.000Z')).toBe(true)
    expect(isPastVoucherExpiry('2020-01-01T00:00:00.000Z', Date.parse('2026-01-01'))).toBe(true)
    expect(isPastVoucherExpiry('2099-01-01T00:00:00.000Z', Date.parse('2026-01-01'))).toBe(false)
  })

  it('labels demo non-expiring distinctly from live', () => {
    expect(formatVoucherExpiryLabel(null, { demo: true, redeemable: false })).toMatch(
      /not applicable/i,
    )
  })
})
