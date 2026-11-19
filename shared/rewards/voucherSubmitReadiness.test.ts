import { describe, expect, it } from 'vitest'
import { evaluateVoucherSubmitReadiness } from './voucherSubmitReadiness'

const readyCampaign = {
  serverVerified: true,
  rewardAmountCents: 10_000,
  serverBacked: true,
  provisional: false,
  alreadyClaimed: false,
  busy: false,
}

const readyForm = {
  fullName: 'Jane Citizen',
  phone: '',
  email: 'jane@example.com',
  termsAccepted: true,
  adultSelfAttested: true,
}

describe('evaluateVoucherSubmitReadiness', () => {
  it('enables Send My Voucher when campaign is verified and form is valid', () => {
    const result = evaluateVoucherSubmitReadiness(readyCampaign, readyForm)
    expect(result.canSubmit).toBe(true)
    expect(result.blockers).toHaveLength(0)
  })

  it('allows blank optional phone', () => {
    const result = evaluateVoucherSubmitReadiness(readyCampaign, {
      ...readyForm,
      phone: '',
    })
    expect(result.canSubmit).toBe(true)
  })

  it('shows actionable blockers when campaign is provisional', () => {
    const result = evaluateVoucherSubmitReadiness(
      { ...readyCampaign, provisional: true, serverVerified: false },
      readyForm,
    )
    expect(result.canSubmit).toBe(false)
    expect(result.blockers.join(' ')).toMatch(/not fully server-verified|verification/i)
  })

  it('does not use Not eligible wording for reward blockers', () => {
    const result = evaluateVoucherSubmitReadiness(
      { ...readyCampaign, rewardAmountCents: 0 },
      readyForm,
    )
    expect(result.blockers.join(' ')).not.toMatch(/Not eligible/i)
  })

  it('shows actionable blockers for missing terms', () => {
    const result = evaluateVoucherSubmitReadiness(readyCampaign, {
      ...readyForm,
      termsAccepted: false,
    })
    expect(result.canSubmit).toBe(false)
    expect(result.blockers.join(' ')).toMatch(/terms/i)
  })

  it('requires adult self-attestation and never fabricates it', () => {
    const result = evaluateVoucherSubmitReadiness(readyCampaign, {
      ...readyForm,
      adultSelfAttested: false,
    })
    expect(result.canSubmit).toBe(false)
    expect(result.blockers.join(' ')).toMatch(/adult|18/i)
  })
})
