import { describe, expect, it } from 'vitest'
import {
  CLAIM_ERROR_FALLBACK,
  customerMessageForClaimError,
  parseClaimErrorPayload,
} from './claimErrorMessages'

describe('customerMessageForClaimError', () => {
  it('maps duplicate email to the approved customer copy', () => {
    expect(customerMessageForClaimError('email_already_used')).toBe(
      'This email has already been used to claim a voucher for this promotion. Please use your original voucher.',
    )
  })

  it('maps other known structured codes', () => {
    expect(customerMessageForClaimError('adult_attestation_required')).toMatch(/18/)
    expect(customerMessageForClaimError('terms_required')).toMatch(/terms/i)
    expect(customerMessageForClaimError('invalid_email')).toMatch(/email/i)
    expect(customerMessageForClaimError('rate_limited')).toMatch(/wait|moment|try again/i)
    expect(customerMessageForClaimError('not_eligible')).toMatch(/eligible/i)
  })

  it('never echoes SQL or stack traces from unknown errors', () => {
    expect(
      customerMessageForClaimError(
        'mystery',
        'ERROR: duplicate key value violates unique constraint "promotional_voucher_claims_email"',
      ),
    ).toBe(CLAIM_ERROR_FALLBACK)
    expect(
      customerMessageForClaimError('mystery', 'TypeError: cannot read property x of undefined\n  at claim'),
    ).toBe(CLAIM_ERROR_FALLBACK)
  })

  it('allows short safe unknown public messages', () => {
    expect(customerMessageForClaimError('custom_gate', 'Please finish verification first.')).toBe(
      'Please finish verification first.',
    )
  })
})

describe('parseClaimErrorPayload', () => {
  it('parses Edge publicError bodies', () => {
    expect(
      parseClaimErrorPayload({
        ok: false,
        code: 'email_already_used',
        message: 'This email has already been used for this promotion.',
      }),
    ).toEqual({
      code: 'email_already_used',
      message:
        'This email has already been used to claim a voucher for this promotion. Please use your original voucher.',
    })
  })

  it('returns null for empty payloads', () => {
    expect(parseClaimErrorPayload(null)).toBeNull()
    expect(parseClaimErrorPayload({})).toBeNull()
  })
})
