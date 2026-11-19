import { beforeEach, describe, expect, it, vi } from 'vitest'

const invoke = vi.fn()
const ensureAnonymousSession = vi.fn()

vi.mock('../config', () => ({
  isBackendConfigured: () => true,
}))

vi.mock('../supabaseClient', () => ({
  getSupabaseClient: () => ({
    functions: { invoke },
  }),
}))

vi.mock('./identity', () => ({
  identityService: {
    ensureAnonymousSession: () => ensureAnonymousSession(),
  },
}))

import { voucherClaimService } from './voucherClaim'

const validForm = {
  fullName: 'Jane Citizen',
  phone: '',
  email: 'jane@example.com',
  termsAccepted: true,
  adultSelfAttested: true,
  marketingOptIn: false,
}

describe('voucherClaimService.claim error handling', () => {
  beforeEach(() => {
    invoke.mockReset()
    ensureAnonymousSession.mockReset()
    ensureAnonymousSession.mockResolvedValue({ kind: 'anonymous' })
  })

  it('surfaces a friendly message for HTTP 409 email_already_used', async () => {
    invoke.mockResolvedValue({
      data: null,
      error: {
        name: 'FunctionsHttpError',
        message: 'Edge Function returned a non-2xx status code',
        context: {
          status: 409,
          json: async () => ({
            ok: false,
            code: 'email_already_used',
            message: 'This email has already been used for this promotion.',
          }),
        },
      },
    })

    const result = await voucherClaimService.claim({
      runId: '11111111-1111-1111-1111-111111111111',
      form: validForm,
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.code).toBe('email_already_used')
      expect(result.message).toBe(
        'This email has already been used to claim a voucher for this promotion. Please use your original voucher.',
      )
      expect(result.message).not.toMatch(/non-2xx/i)
    }
  })

  it('maps other known structured API errors', async () => {
    invoke.mockResolvedValue({
      data: null,
      error: {
        name: 'FunctionsHttpError',
        message: 'Edge Function returned a non-2xx status code',
        context: {
          json: async () => ({
            ok: false,
            code: 'adult_attestation_required',
            message: 'Adult self-attestation is required for approved live issuance.',
          }),
        },
      },
    })

    const result = await voucherClaimService.claim({
      runId: '11111111-1111-1111-1111-111111111111',
      form: validForm,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.code).toBe('adult_attestation_required')
      expect(result.message).toMatch(/18/)
    }
  })

  it('handles unknown error responses without leaking internals', async () => {
    invoke.mockResolvedValue({
      data: null,
      error: {
        name: 'FunctionsHttpError',
        message: 'Edge Function returned a non-2xx status code',
        context: {
          json: async () => ({
            ok: false,
            code: 'db_boom',
            message: 'postgres exception: permission denied for table',
          }),
        },
      },
    })

    const result = await voucherClaimService.claim({
      runId: '11111111-1111-1111-1111-111111111111',
      form: validForm,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.message).not.toMatch(/postgres|permission denied|non-2xx/i)
      expect(result.message).toMatch(/try again|could not process/i)
    }
  })

  it('handles network failures', async () => {
    invoke.mockResolvedValue({
      data: null,
      error: {
        name: 'FunctionsFetchError',
        message: 'Failed to send a request to the Edge Function',
        context: {},
      },
    })

    const result = await voucherClaimService.claim({
      runId: '11111111-1111-1111-1111-111111111111',
      form: validForm,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.code).toBe('network')
      expect(result.message).toMatch(/connection|online service/i)
    }
  })

  it('returns successful voucher claims unchanged', async () => {
    invoke.mockResolvedValue({
      data: {
        ok: true,
        idempotent: false,
        claimId: 'claim-1',
        voucherId: 'voucher-1',
        emailJobId: 'job-1',
        code: 'DEMO-AAAA-BBBB-CCCC',
        amountCents: 5000,
        tierId: 'tier_50',
        expiresAt: '2027-01-01T00:00:00.000Z',
        demo: true,
        redeemable: false,
        issuanceMode: 'demo',
        claimStatus: 'email_sent',
        emailStatus: 'sent',
        emailProvider: 'demo_log',
        message: 'Your voucher request has been processed.',
      },
      error: null,
    })

    const result = await voucherClaimService.claim({
      runId: '11111111-1111-1111-1111-111111111111',
      form: validForm,
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.code).toBe('DEMO-AAAA-BBBB-CCCC')
      expect(result.amountCents).toBe(5000)
      expect(result.demo).toBe(true)
    }
  })
})
