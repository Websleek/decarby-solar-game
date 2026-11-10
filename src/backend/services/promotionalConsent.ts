import {
  PROMOTIONAL_TERMS_VERSION,
  validatePromotionalConsentInput,
} from '../../../shared/rewards/consent'
import { BackendError, toBackendError } from '../errors'
import { isBackendConfigured } from '../config'
import { getSupabaseClient } from '../supabaseClient'
import { identityService } from './identity'

export type RecordedPromotionalConsent = Readonly<{
  consentId: string
  termsVersion: string
  recordedAt: string
  marketingOptIn: boolean
  adultAttestationMethod: 'self_attestation_unverified'
  independentlyVerifiedAge: false
}>

function requireClient() {
  if (!isBackendConfigured()) {
    throw new BackendError('not_configured', 'Consent recording needs Supabase credentials.')
  }
  const client = getSupabaseClient()
  if (!client) throw new BackendError('not_configured', 'Consent recording is not configured.')
  return client
}

export const promotionalConsentService = {
  currentTermsVersion(): string {
    return PROMOTIONAL_TERMS_VERSION
  },

  async record(input: {
    adultSelfAttested: boolean
    termsAccepted: boolean
    marketingOptIn?: boolean
  }): Promise<RecordedPromotionalConsent> {
    const validated = validatePromotionalConsentInput({
      adultSelfAttested: input.adultSelfAttested,
      termsAccepted: input.termsAccepted,
      termsVersion: PROMOTIONAL_TERMS_VERSION,
      marketingOptIn: input.marketingOptIn === true,
    })
    if (!validated.ok) {
      throw new BackendError('validation', validated.reason)
    }

    const client = requireClient()
    const auth = await identityService.ensureAnonymousSession()
    if (auth.kind !== 'anonymous') {
      throw new BackendError('unauthenticated', 'Sign in to record promotional consent.')
    }

    const { data, error } = await client.functions.invoke('record-promotional-consent', {
      body: {
        adultSelfAttested: true,
        termsAccepted: true,
        termsVersion: PROMOTIONAL_TERMS_VERSION,
        marketingOptIn: input.marketingOptIn === true,
      },
    })
    if (error) throw toBackendError(error, 'Could not record promotional consent.')
    const payload = data as {
      ok?: boolean
      consent?: RecordedPromotionalConsent
      message?: string
      publicClaimingEnabled?: boolean
    }
    if (!payload?.ok || !payload.consent) {
      throw new BackendError('unknown', payload?.message ?? 'Consent recording failed.')
    }
    if (payload.publicClaimingEnabled === true) {
      throw new BackendError('unsupported', 'Public claiming must remain disabled.')
    }
    return {
      ...payload.consent,
      independentlyVerifiedAge: false,
      adultAttestationMethod: 'self_attestation_unverified',
    }
  },
}
