/**
 * Customer-facing promotional terms presentation.
 * Internal version ids (e.g. promo-terms-v1) stay on claims for audit;
 * customers see label + URL only when Decarby has published them.
 *
 * Do not invent legal terms text. Set publishedForCustomers + publicUrl only
 * after Decarby approves the destination page.
 */

import { PROMOTIONAL_TERMS_VERSION } from './consent.ts'

export type PromotionalTermsPublication = Readonly<{
  /** Internal audit / DB terms_version — never show this id to customers. */
  versionId: string
  /** Readable name for claim form + email. */
  customerLabel: string
  /** Approved public URL, or null until published. */
  publicUrl: string | null
  /** Gate for approved_live issuance + live customer email. */
  publishedForCustomers: boolean
  /**
   * Adult self-attestation checkbox copy (draft — subject to Decarby approval).
   * Do not change the legal age without explicit approval.
   */
  adultAttestationLabel: string
  /** Short live-email terms sentence (no internal version ids). */
  emailTermsSummary: string
}>

const TERMS_CATALOG: Readonly<Record<string, PromotionalTermsPublication>> = Object.freeze({
  [PROMOTIONAL_TERMS_VERSION]: Object.freeze({
    versionId: PROMOTIONAL_TERMS_VERSION,
    customerLabel: 'Decarby Solar Roof Challenge Promotional Terms',
    // Set to the approved page URL and flip publishedForCustomers when Decarby publishes.
    publicUrl: null,
    publishedForCustomers: false,
    adultAttestationLabel: 'I confirm that I am 18 years of age or older.',
    emailTermsSummary:
      'Present this code to Decarby Solar for verification. Offer subject to the Decarby Solar Roof Challenge Promotional Terms. Not transferable for cash.',
  }),
})

/**
 * Local/visual preview only — assumes a future approved URL shape.
 * Never used by deliverVoucherEmail / claim Edge without an explicit override.
 */
export const PREVIEW_PUBLISHED_TERMS_V1: PromotionalTermsPublication = Object.freeze({
  ...TERMS_CATALOG[PROMOTIONAL_TERMS_VERSION],
  publicUrl: 'https://decarbysolar.com.au/promotions/roof-challenge-terms',
  publishedForCustomers: true,
})

export function resolvePromotionalTerms(
  versionId: string,
  override?: PromotionalTermsPublication | null,
): PromotionalTermsPublication | null {
  if (override && override.versionId === versionId) return override
  const found = TERMS_CATALOG[versionId]
  return found ?? null
}

export function isPromotionalTermsPublishedForCustomers(
  terms: PromotionalTermsPublication | null,
): terms is PromotionalTermsPublication & { publicUrl: string } {
  return (
    terms != null &&
    terms.publishedForCustomers === true &&
    typeof terms.publicUrl === 'string' &&
    /^https:\/\//i.test(terms.publicUrl)
  )
}

export type LiveTermsGateResult =
  | Readonly<{ ok: true; terms: PromotionalTermsPublication & { publicUrl: string } }>
  | Readonly<{
      ok: false
      code: 'terms_not_configured' | 'terms_not_published'
      reason: string
    }>

/** Fail closed for approved_live issuance when customer terms are not published. */
export function requirePublishedTermsForLive(versionId: string): LiveTermsGateResult {
  const terms = resolvePromotionalTerms(versionId)
  if (!terms) {
    return {
      ok: false,
      code: 'terms_not_configured',
      reason:
        'Promotional terms are not configured for this campaign. Live claims cannot proceed yet.',
    }
  }
  if (!isPromotionalTermsPublishedForCustomers(terms)) {
    return {
      ok: false,
      code: 'terms_not_published',
      reason:
        'Customer promotional terms have not been published yet. Live claims cannot proceed until Decarby publishes the approved terms page.',
    }
  }
  return { ok: true, terms }
}

export function claimFormTermsPresentation(versionId: string): {
  versionId: string
  customerLabel: string
  publicUrl: string | null
  publishedForCustomers: boolean
  adultAttestationLabel: string
} {
  const terms = resolvePromotionalTerms(versionId)
  return {
    versionId,
    customerLabel: terms?.customerLabel ?? 'Decarby promotional terms',
    publicUrl: isPromotionalTermsPublishedForCustomers(terms) ? terms.publicUrl : null,
    publishedForCustomers: isPromotionalTermsPublishedForCustomers(terms),
    adultAttestationLabel:
      terms?.adultAttestationLabel ?? 'I confirm that I am 18 years of age or older.',
  }
}
