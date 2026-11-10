import { PROMOTIONAL_TERMS_VERSION } from '../../../shared/rewards/consent'
import {
  validateVoucherContactForm,
  type ValidatedVoucherContact,
} from '../../../shared/rewards/contactValidation'
import type { ClaimCampaignVoucherResult } from '../../../shared/rewards/voucherClaim'
import { BackendError, toBackendError } from '../errors'
import { isBackendConfigured } from '../config'
import { getSupabaseClient } from '../supabaseClient'
import { identityService } from './identity'

export type VoucherClaimFormState = {
  fullName: string
  phone: string
  email: string
  termsAccepted: boolean
  adultSelfAttested: boolean
  marketingOptIn: boolean
}

export function emptyVoucherClaimForm(): VoucherClaimFormState {
  return {
    fullName: '',
    phone: '',
    email: '',
    termsAccepted: false,
    adultSelfAttested: false,
    marketingOptIn: false,
  }
}

export function validateVoucherClaimFormLocal(
  form: VoucherClaimFormState,
): { ok: true; value: ValidatedVoucherContact } | { ok: false; reason: string; field?: string } {
  const result = validateVoucherContactForm({
    fullName: form.fullName,
    phone: form.phone,
    email: form.email,
    termsAccepted: form.termsAccepted,
    adultSelfAttested: form.adultSelfAttested,
    marketingOptIn: form.marketingOptIn,
    termsVersion: PROMOTIONAL_TERMS_VERSION,
  })
  if (!result.ok) {
    return { ok: false, reason: result.reason, field: result.field }
  }
  return { ok: true, value: result.value }
}

export const voucherClaimService = {
  termsVersion: PROMOTIONAL_TERMS_VERSION,

  async claim(input: {
    runId: string
    form: VoucherClaimFormState
  }): Promise<ClaimCampaignVoucherResult> {
    if (!isBackendConfigured()) {
      return {
        ok: false,
        code: 'not_configured',
        message: 'Online voucher claiming is unavailable offline.',
      }
    }

    const local = validateVoucherClaimFormLocal(input.form)
    if (!local.ok) {
      return { ok: false, code: 'invalid_contact', message: local.reason }
    }

    const client = getSupabaseClient()
    if (!client) {
      return {
        ok: false,
        code: 'not_configured',
        message: 'Online voucher claiming is unavailable.',
      }
    }

    const auth = await identityService.ensureAnonymousSession()
    if (auth.kind !== 'anonymous') {
      throw new BackendError('unauthenticated', 'Sign in anonymously to continue.')
    }

    const { data, error } = await client.functions.invoke('claim-campaign-voucher', {
      body: {
        runId: input.runId,
        fullName: local.value.fullName,
        phone: local.value.phone,
        email: local.value.emailRaw,
        termsAccepted: true,
        adultSelfAttested: true,
        marketingOptIn: local.value.marketingOptIn,
        termsVersion: local.value.termsVersion,
        // Intentionally omitted: amountCents — server decision is authoritative.
      },
    })

    if (error) {
      const mapped = toBackendError(error, 'Voucher claim failed.')
      return { ok: false, code: mapped.code, message: mapped.message }
    }

    const payload = (data ?? {}) as Record<string, unknown>
    if (payload.ok === true) {
      return {
        ok: true,
        idempotent: payload.idempotent === true,
        claimId: String(payload.claimId ?? ''),
        voucherId: String(payload.voucherId ?? ''),
        emailJobId: String(payload.emailJobId ?? ''),
        code: String(payload.code ?? ''),
        amountCents: Number(payload.amountCents ?? 0),
        tierId: String(payload.tierId ?? ''),
        expiresAt: String(payload.expiresAt ?? ''),
        demo: payload.demo === true,
        redeemable: payload.redeemable === true,
        issuanceMode: payload.issuanceMode === 'approved_live' ? 'approved_live' : 'demo',
        claimStatus: (payload.claimStatus as never) ?? 'email_queued',
        emailStatus: (payload.emailStatus as never) ?? 'queued',
        emailProvider:
          payload.emailProvider === 'demo_log' || payload.emailProvider === 'resend'
            ? payload.emailProvider
            : 'unknown',
        message:
          typeof payload.message === 'string'
            ? payload.message
            : 'Your voucher request has been processed.',
      }
    }

    return {
      ok: false,
      code: typeof payload.code === 'string' ? payload.code : 'claim_failed',
      message:
        typeof payload.message === 'string'
          ? payload.message
          : 'Could not process your voucher request.',
    }
  },
}
