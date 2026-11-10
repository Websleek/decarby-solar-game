/**
 * Adult-only + consent gates for future promotional claims.
 * Fail closed: missing or false attestations block claim creation.
 * These are server-side attestations — never infer from nickname or client player ID alone.
 */

export type AdultConsentAttestation = Readonly<{
  /** Server-verified / operator-attested adult status for the claimant. */
  adultConfirmed: boolean
  /** Explicit promotional-terms consent for this claim attempt. */
  consentGranted: boolean
  /** Optional ISO timestamp when consent was recorded (audit only). */
  consentRecordedAt?: string | null
}>

export type AdultConsentValidationResult =
  | Readonly<{ ok: true }>
  | Readonly<{ ok: false; code: 'adult_verification_required' | 'consent_required'; reason: string }>

export function validateAdultConsent(attestation: AdultConsentAttestation): AdultConsentValidationResult {
  if (attestation.adultConfirmed !== true) {
    return {
      ok: false,
      code: 'adult_verification_required',
      reason: 'Adult verification is required before promotional claims can proceed.',
    }
  }
  if (attestation.consentGranted !== true) {
    return {
      ok: false,
      code: 'consent_required',
      reason: 'Promotional claim consent is required before a claim can be recorded.',
    }
  }
  return { ok: true }
}
