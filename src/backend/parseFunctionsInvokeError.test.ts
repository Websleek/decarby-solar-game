import { describe, expect, it } from 'vitest'
import { CLAIM_ERROR_FALLBACK, CLAIM_NETWORK_ERROR } from '../../shared/rewards/claimErrorMessages'
import { parseFunctionsInvokeError } from './parseFunctionsInvokeError'

describe('parseFunctionsInvokeError', () => {
  it('reads structured JSON from FunctionsHttpError Response context (HTTP 409)', async () => {
    const body = {
      ok: false,
      code: 'email_already_used',
      message: 'This email has already been used for this promotion.',
    }
    const error = {
      name: 'FunctionsHttpError',
      message: 'Edge Function returned a non-2xx status code',
      context: {
        ok: false,
        status: 409,
        json: async () => body,
      },
    }

    const parsed = await parseFunctionsInvokeError(error)
    expect(parsed.code).toBe('email_already_used')
    expect(parsed.message).toBe(
      'This email has already been used to claim a voucher for this promotion. Please use your original voucher.',
    )
    expect(parsed.message).not.toMatch(/non-2xx/i)
  })

  it('maps known structured API errors from Response context', async () => {
    const error = {
      name: 'FunctionsHttpError',
      message: 'Edge Function returned a non-2xx status code',
      context: {
        json: async () => ({
          ok: false,
          code: 'rate_limited',
          message: 'Too many voucher requests. Try again shortly.',
        }),
      },
    }
    const parsed = await parseFunctionsInvokeError(error)
    expect(parsed.code).toBe('rate_limited')
    expect(parsed.message).toMatch(/wait|moment|try again/i)
  })

  it('falls back safely for unknown non-2xx bodies', async () => {
    const error = {
      name: 'FunctionsHttpError',
      message: 'Edge Function returned a non-2xx status code',
      context: {
        json: async () => ({ ok: false, code: 'weird_internal', message: 'relation "x" does not exist' }),
      },
    }
    const parsed = await parseFunctionsInvokeError(error)
    expect(parsed.message).toBe(CLAIM_ERROR_FALLBACK)
  })

  it('maps network / fetch failures', async () => {
    const error = {
      name: 'FunctionsFetchError',
      message: 'Failed to send a request to the Edge Function',
      context: { cause: 'offline' },
    }
    const parsed = await parseFunctionsInvokeError(error)
    expect(parsed.code).toBe('network')
    expect(parsed.message).toBe(CLAIM_NETWORK_ERROR)
  })

  it('prefers structured data payload when present', async () => {
    const parsed = await parseFunctionsInvokeError(
      { name: 'FunctionsHttpError', message: 'Edge Function returned a non-2xx status code' },
      { ok: false, code: 'not_eligible', message: 'not eligible' },
    )
    expect(parsed.code).toBe('not_eligible')
    expect(parsed.message).toMatch(/eligible/i)
  })
})
