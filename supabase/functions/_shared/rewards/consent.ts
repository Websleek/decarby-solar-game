/**
 * Durable promotional consent types (Phase 4C.3).
 * Adult confirmation is a self-attestation gate — not independently verified age proof.
 * Do not store full birth dates or identity documents here.
 */

export const PROMOTIONAL_TERMS_VERSION = 'promo-terms-v1' as const

export const ADULT_ATTESTATION_METHODS = ['self_attestation_unverified'] as const
export type AdultAttestationMethod = (typeof ADULT_ATTESTATION_METHODS)[number]

export type PromotionalConsentRecord = Readonly<{
  id: string
  playerId: string
  /** Self-attested adult eligibility — not KYC / ID-verified age. */
  adultSelfAttested: boolean
  adultAttestationMethod: AdultAttestationMethod
  /** Explicit acceptance of promotional reward terms. */
  termsAccepted: boolean
  termsVersion: string
  /** Optional marketing contact consent (separate from terms). */
  marketingOptIn: boolean
  recordedAt: string
  revokedAt: string | null
}>

export type PromotionalConsentInput = Readonly<{
  adultSelfAttested: boolean
  termsAccepted: boolean
  termsVersion: string
  marketingOptIn?: boolean
}>

export type ConsentValidationResult =
  | Readonly<{ ok: true; termsVersion: string }>
  | Readonly<{
      ok: false
      code: 'adult_attestation_required' | 'terms_required' | 'terms_version_mismatch'
      reason: string
    }>

export function validatePromotionalConsentInput(
  input: PromotionalConsentInput,
  expectedTermsVersion: string = PROMOTIONAL_TERMS_VERSION,
): ConsentValidationResult {
  if (input.adultSelfAttested !== true) {
    return {
      ok: false,
      code: 'adult_attestation_required',
      reason:
        'Adult self-attestation is required. This is not independently verified proof of age.',
    }
  }
  if (input.termsAccepted !== true) {
    return {
      ok: false,
      code: 'terms_required',
      reason: 'Explicit acceptance of promotional terms is required.',
    }
  }
  if (input.termsVersion !== expectedTermsVersion) {
    return {
      ok: false,
      code: 'terms_version_mismatch',
      reason: `Terms version must be "${expectedTermsVersion}".`,
    }
  }
  return { ok: true, termsVersion: expectedTermsVersion }
}

/** Maps durable consent into the claim-workflow attestation shape. */
export function consentToClaimAttestation(record: PromotionalConsentRecord): {
  adultConfirmed: boolean
  consentGranted: boolean
  consentRecordedAt: string | null
} {
  const active = record.revokedAt == null
  return {
    adultConfirmed: active && record.adultSelfAttested === true,
    consentGranted: active && record.termsAccepted === true,
    consentRecordedAt: record.recordedAt,
  }
}
