/**
 * Customer-facing Decarby Solar Roof Challenge voucher terms.
 * Internal version ids (e.g. promo-terms-v1) stay on claims for audit only.
 *
 * Absolute publicUrl is the Vercel production terms page until Decarby hosts a
 * marketing-site mirror. Deploy/activation still require explicit promoter approval.
 */

import { PROMOTIONAL_TERMS_VERSION } from './consent.ts'

/** Initial absolute public terms URL (Vercel production). */
export const VOUCHER_TERMS_PUBLIC_URL =
  'https://decarby-solar-game.vercel.app/voucher-terms/' as const

export type PromotionalTermsRewardRow = Readonly<{
  starsLabel: string
  rewardLabel: string
}>

export type PromotionalTermsBody = Readonly<{
  promoter: string
  howItWorks: string
  rewardRows: readonly PromotionalTermsRewardRow[]
  conditions: readonly string[]
  enquiryEmail: string
}>

export type PromotionalTermsPublication = Readonly<{
  /** Internal audit / DB terms_version — never show this id to customers. */
  versionId: string
  /** Readable name for claim form + email. */
  customerLabel: string
  /** Absolute https URL used in emails + claim checkbox. */
  publicUrl: string | null
  /** Same-origin path for direct refresh on the game host. */
  inAppPath: string
  /** True when customers may be shown / linked to these terms. */
  publishedForCustomers: boolean
  adultAttestationLabel: string
  /** Short live-email terms sentence (no internal version ids). */
  emailTermsSummary: string
  body: PromotionalTermsBody
}>

export const VOUCHER_TERMS_BODY: PromotionalTermsBody = Object.freeze({
  promoter: 'Decarby Pty Ltd',
  howItWorks:
    'Complete the three rooftops in the Decarby Solar Roof Challenge to earn a promotional discount voucher based on your verified total stars.',
  rewardRows: Object.freeze([
    Object.freeze({ starsLabel: '0–5', rewardLabel: 'A$50 OFF' }),
    Object.freeze({ starsLabel: '6–7', rewardLabel: 'A$100 OFF' }),
    Object.freeze({ starsLabel: '8', rewardLabel: 'A$250 OFF' }),
    Object.freeze({ starsLabel: '9', rewardLabel: 'A$500 OFF' }),
  ]),
  conditions: Object.freeze([
    'Each participant may claim one voucher per email address for this promotion.',
    'Each voucher has a unique verification code.',
    'Vouchers do not expire.',
    'Each voucher may be redeemed once only.',
    'Present your voucher code to Decarby Solar when arranging a purchase or service to have the discount applied.',
    'Decarby staff will verify the code before redemption.',
    'After redemption, the voucher cannot be used again.',
    'The game does not restrict vouchers to a particular installation type.',
    'Combining this voucher with other offers is managed by Decarby outside this game and is not controlled by the Roof Challenge software.',
    'Vouchers cannot be exchanged for cash.',
    'Participants must be at least 18 years old.',
    'Providing contact details for voucher delivery does not automatically subscribe participants to marketing communications. Marketing updates are optional and separate.',
  ]),
  enquiryEmail: 'hello@decarbysolar.com.au',
})

const TERMS_CATALOG: Readonly<Record<string, PromotionalTermsPublication>> = Object.freeze({
  [PROMOTIONAL_TERMS_VERSION]: Object.freeze({
    versionId: PROMOTIONAL_TERMS_VERSION,
    customerLabel: 'Decarby Solar Roof Challenge Voucher Terms',
    publicUrl: VOUCHER_TERMS_PUBLIC_URL,
    inAppPath: '/voucher-terms/',
    publishedForCustomers: true,
    adultAttestationLabel: 'I confirm that I am 18 years of age or older.',
    emailTermsSummary:
      'One voucher per email. Does not expire. Redeemable once. Present this code to Decarby Solar when arranging a purchase or service. Not exchangeable for cash. Participants must be 18+. Optional marketing consent is separate.',
    body: VOUCHER_TERMS_BODY,
  }),
})

/** Optional alternate marketing-site URL for future Decarby.com hosting. */
export const PREVIEW_PUBLISHED_TERMS_V1: PromotionalTermsPublication = Object.freeze({
  ...TERMS_CATALOG[PROMOTIONAL_TERMS_VERSION],
  publicUrl: 'https://decarbysolar.com.au/promotions/roof-challenge-terms',
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
): terms is PromotionalTermsPublication {
  return terms != null && terms.publishedForCustomers === true
}

export function resolveCustomerTermsHref(
  terms: PromotionalTermsPublication | null,
): string | null {
  if (!isPromotionalTermsPublishedForCustomers(terms)) return null
  if (typeof terms.publicUrl === 'string' && /^https:\/\//i.test(terms.publicUrl)) {
    return terms.publicUrl
  }
  if (typeof terms.inAppPath === 'string' && terms.inAppPath.startsWith('/')) {
    return terms.inAppPath
  }
  return null
}

export type LiveTermsGateResult =
  | Readonly<{ ok: true; terms: PromotionalTermsPublication }>
  | Readonly<{
      ok: false
      code: 'terms_not_configured' | 'terms_not_published'
      reason: string
    }>

/** Fail closed for approved_live tooling when customer terms are not published. */
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
  if (!isPromotionalTermsPublishedForCustomers(terms) || !resolveCustomerTermsHref(terms)) {
    return {
      ok: false,
      code: 'terms_not_published',
      reason:
        'Customer promotional terms have not been published yet. Live claims cannot proceed until Decarby approves publication.',
    }
  }
  return { ok: true, terms }
}

export function claimFormTermsPresentation(versionId: string): {
  versionId: string
  customerLabel: string
  href: string | null
  publicUrl: string | null
  inAppPath: string | null
  publishedForCustomers: boolean
  adultAttestationLabel: string
} {
  const terms = resolvePromotionalTerms(versionId)
  const href = resolveCustomerTermsHref(terms)
  return {
    versionId,
    customerLabel: terms?.customerLabel ?? 'Decarby promotional terms',
    href,
    publicUrl:
      terms?.publicUrl && /^https:\/\//i.test(terms.publicUrl) ? terms.publicUrl : null,
    inAppPath: terms?.inAppPath ?? null,
    publishedForCustomers: isPromotionalTermsPublishedForCustomers(terms),
    adultAttestationLabel:
      terms?.adultAttestationLabel ?? 'I confirm that I am 18 years of age or older.',
  }
}
