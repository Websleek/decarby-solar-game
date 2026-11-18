import { describe, expect, it } from 'vitest'
import {
  evaluateVerifiedLevelRows,
  needsRewardDecisionReconcile,
  isCorrectableRewardDecision,
} from './rewardDecisionReconcile.ts'

const verifiedLevels = [
  {
    status: 'verified',
    level_id: 'sunny-house',
    verified_stars: 2,
    verified_score: 1200,
    verified_record_id: 'rec-1',
    level_version: 1,
  },
  {
    status: 'verified',
    level_id: 'chimney-challenge',
    verified_stars: 2,
    verified_score: 1300,
    verified_record_id: 'rec-2',
    level_version: 1,
  },
  {
    status: 'verified',
    level_id: 'tricky-rooftop',
    verified_stars: 1,
    verified_score: 1100,
    verified_record_id: 'rec-3',
    level_version: 1,
  },
] as const

describe('reward decision reconciliation', () => {
  it('evaluates a completed 5/9-star run as A$50 eligible', () => {
    const decision = evaluateVerifiedLevelRows(verifiedLevels)
    expect(decision.eligible).toBe(true)
    if (decision.eligible) {
      expect(decision.amountCents).toBe(5_000)
      expect(decision.totalStars).toBe(5)
      expect(decision.tierId).toBe('tier_50')
    }
  })

  it('marks stale ineligible decisions as needing reconcile', () => {
    const fresh = evaluateVerifiedLevelRows(verifiedLevels)
    expect(
      needsRewardDecisionReconcile(
        {
          eligible: false,
          tier_id: null,
          amount_cents: 0,
          total_stars: 5,
          total_score: 3600,
          voucher_issued: false,
          decision: { eligible: false, code: 'incomplete_campaign' },
        },
        fresh,
        false,
      ),
    ).toBe(true)
  })

  it('does not reconcile after a claim exists or voucher issued', () => {
    const fresh = evaluateVerifiedLevelRows(verifiedLevels)
    expect(
      isCorrectableRewardDecision(
        {
          eligible: false,
          tier_id: null,
          amount_cents: 0,
          total_stars: 5,
          total_score: 0,
          voucher_issued: false,
        },
        true,
      ),
    ).toBe(false)
    expect(
      needsRewardDecisionReconcile(
        {
          eligible: false,
          tier_id: null,
          amount_cents: 0,
          total_stars: 5,
          total_score: 0,
          voucher_issued: true,
        },
        fresh,
        false,
      ),
    ).toBe(false)
  })

  it('keeps matching eligible decisions immutable', () => {
    const fresh = evaluateVerifiedLevelRows(verifiedLevels)
    expect(
      needsRewardDecisionReconcile(
        {
          eligible: true,
          tier_id: 'tier_50',
          amount_cents: 5_000,
          total_stars: 5,
          total_score: 3600,
          voucher_issued: false,
        },
        fresh,
        false,
      ),
    ).toBe(false)
  })

  it('still rejects incomplete campaigns', () => {
    const decision = evaluateVerifiedLevelRows(verifiedLevels.slice(0, 2))
    expect(decision.eligible).toBe(false)
  })
})
