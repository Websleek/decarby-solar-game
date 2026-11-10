import { loadActiveProfile, requireAuthenticatedUser } from '../_shared/auth.ts'
import { corsHeaders, jsonResponse, publicError } from '../_shared/cors.ts'
import { clientKey, takeRateToken } from '../_shared/rateLimit.ts'
import {
  PROMOTIONAL_TERMS_VERSION,
  validatePromotionalConsentInput,
} from '../_shared/rewards/consent.ts'

/**
 * Records durable promotional consent for the authenticated player.
 * Adult flag is self-attestation only — not independently verified age proof.
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return publicError(405, 'method_not_allowed', 'Use POST.')

  if (!takeRateToken(`record-consent:${clientKey(req)}`, { max: 10 })) {
    return publicError(429, 'rate_limited', 'Too many consent requests. Try again shortly.')
  }

  try {
    const auth = await requireAuthenticatedUser(req)
    if ('error' in auth) {
      return publicError(401, 'unauthenticated', 'Sign in to record promotional consent.')
    }

    const profile = await loadActiveProfile(auth.admin, auth.user.id)
    if (!profile) {
      return publicError(403, 'profile_required', 'An active online profile is required.')
    }

    const body = (await req.json().catch(() => null)) as {
      adultSelfAttested?: unknown
      termsAccepted?: unknown
      termsVersion?: unknown
      marketingOptIn?: unknown
    } | null

    if (!body || typeof body !== 'object') {
      return publicError(400, 'invalid_request', 'Invalid request body.')
    }

    const input = {
      adultSelfAttested: body.adultSelfAttested === true,
      termsAccepted: body.termsAccepted === true,
      termsVersion:
        typeof body.termsVersion === 'string' ? body.termsVersion : PROMOTIONAL_TERMS_VERSION,
      marketingOptIn: body.marketingOptIn === true,
    }

    const validated = validatePromotionalConsentInput(input, PROMOTIONAL_TERMS_VERSION)
    if (!validated.ok) {
      return publicError(400, validated.code, validated.reason)
    }

    const { data, error } = await auth.userClient.rpc('record_my_promotional_consent', {
      p_adult_self_attested: true,
      p_terms_accepted: true,
      p_terms_version: PROMOTIONAL_TERMS_VERSION,
      p_marketing_opt_in: input.marketingOptIn === true,
    })
    if (error) {
      console.error('record_my_promotional_consent failed', error)
      return publicError(500, 'consent_failed', 'Could not record promotional consent.')
    }

    const row = Array.isArray(data) ? data[0] : data
    const r = (row ?? {}) as Record<string, unknown>
    return jsonResponse({
      ok: true,
      consent: {
        consentId: String(r.consent_id ?? ''),
        termsVersion: String(r.terms_version ?? PROMOTIONAL_TERMS_VERSION),
        recordedAt: String(r.recorded_at ?? ''),
        marketingOptIn: Boolean(r.marketing_opt_in),
        adultAttestationMethod: 'self_attestation_unverified',
        independentlyVerifiedAge: false,
      },
      publicClaimingEnabled: false,
    })
  } catch (error) {
    console.error('record-promotional-consent failed', error)
    return publicError(500, 'server_error', 'Could not record promotional consent.')
  }
})
