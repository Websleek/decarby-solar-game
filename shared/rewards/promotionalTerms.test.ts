import { describe, expect, it } from 'vitest'
import { REWARD_TIERS } from '../campaign/rewardTiers'
import { PROMOTIONAL_TERMS_VERSION } from './consent'
import {
  claimFormTermsPresentation,
  requirePublishedTermsForLive,
  resolveCustomerTermsHref,
  resolvePromotionalTerms,
  VOUCHER_TERMS_BODY,
} from './promotionalTerms'

describe('voucher terms content', () => {
  it('publishes in-product terms with the Decarby-supplied conditions', () => {
    const terms = resolvePromotionalTerms(PROMOTIONAL_TERMS_VERSION)
    expect(terms?.publishedForCustomers).toBe(true)
    expect(terms?.body.promoter).toBe('Decarby Pty Ltd')
    expect(terms?.body.conditions).toContain('Vouchers do not expire.')
    expect(terms?.body.conditions).toContain('Participants must be at least 18 years old.')
    expect(terms?.body.enquiryEmail).toBe('hello@decarbysolar.com.au')
    expect(terms?.publicUrl).toBe('https://decarby-solar-game.vercel.app/voucher-terms/')
    expect(resolveCustomerTermsHref(terms)).toBe(
      'https://decarby-solar-game.vercel.app/voucher-terms/',
    )
    expect(JSON.stringify(terms)).not.toMatch(/subject to Decarby approval before publication/i)
  })

  it('keeps reward rows aligned with public game tiers', () => {
    const byAmount = new Map(
      VOUCHER_TERMS_BODY.rewardRows.map((row) => [row.rewardLabel, row.starsLabel]),
    )
    for (const tier of REWARD_TIERS) {
      expect(byAmount.has(tier.displayLabel)).toBe(true)
    }
    expect(byAmount.get('A$50 OFF')).toBe('0–5')
    expect(byAmount.get('A$100 OFF')).toBe('6–7')
    expect(byAmount.get('A$250 OFF')).toBe('8')
    expect(byAmount.get('A$500 OFF')).toBe('9')
  })

  it('exposes a claim-form href without showing internal version ids', () => {
    const presentation = claimFormTermsPresentation(PROMOTIONAL_TERMS_VERSION)
    expect(presentation.href).toBe('https://decarby-solar-game.vercel.app/voucher-terms/')
    expect(presentation.customerLabel).not.toMatch(/promo-terms-v1/)
    expect(presentation.adultAttestationLabel).toMatch(/18/)
  })

  it('passes the live terms gate once in-product terms are published', () => {
    const gate = requirePublishedTermsForLive(PROMOTIONAL_TERMS_VERSION)
    expect(gate.ok).toBe(true)
  })
})
