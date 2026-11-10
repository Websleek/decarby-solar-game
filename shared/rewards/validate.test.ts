import { describe, expect, it } from 'vitest'
import { DEMO_REWARD_DEFINITIONS } from './registry.ts'
import {
  assertValidRewardDefinition,
  validateEligibilityRule,
  validateMonetaryValue,
  validatePercentageBasisPoints,
  validateRewardDefinitionDraft,
} from './validate.ts'
import type { RewardDefinition } from './types.ts'

describe('reward validation', () => {
  it('accepts all demo reward definitions', () => {
    expect(DEMO_REWARD_DEFINITIONS).toHaveLength(4)
    for (const reward of DEMO_REWARD_DEFINITIONS) {
      expect(validateRewardDefinitionDraft(reward).ok).toBe(true)
      expect(reward.claimsEnabled).toBe(false)
      expect(reward.publicCatalog).toBe(false)
      expect(reward.publishingStatus).toBe('draft')
    }
  })

  it('rejects invalid monetary values', () => {
    expect(validateMonetaryValue({ amountCents: -1, currency: 'AUD' }).ok).toBe(false)
    expect(validateMonetaryValue({ amountCents: 12.5, currency: 'AUD' }).ok).toBe(false)
    expect(validateMonetaryValue({ amountCents: 100, currency: 'USD' as 'AUD' }).ok).toBe(false)
    expect(validateMonetaryValue({ amountCents: 10000, currency: 'AUD' }).ok).toBe(true)
  })

  it('rejects invalid percentage configuration', () => {
    expect(validatePercentageBasisPoints('fixed_discount', 500).ok).toBe(false)
    expect(validatePercentageBasisPoints('percentage_discount', null).ok).toBe(false)
    expect(validatePercentageBasisPoints('percentage_discount', 0).ok).toBe(false)
    expect(validatePercentageBasisPoints('percentage_discount', 2500).ok).toBe(true)
  })

  it('rejects unknown eligibility rules and invalid thresholds', () => {
    expect(validateEligibilityRule({ kind: 'mystery' }).ok).toBe(false)
    expect(validateEligibilityRule({ kind: 'verified_stars_at_least', minStars: 45 }).ok).toBe(
      false,
    )
    expect(validateEligibilityRule({ kind: 'verified_rooftops_at_least', minRooftops: 8 }).ok).toBe(
      false,
    )
    expect(
      validateEligibilityRule({
        kind: 'leaderboard_rank_at_most',
        board: 'overall',
        maxRank: 5,
        requiresFinalisedSnapshot: false,
      }).ok,
    ).toBe(false)
  })

  it('throws on invalid reward drafts', () => {
    const bad: RewardDefinition = {
      ...DEMO_REWARD_DEFINITIONS[0],
      illustrativeValue: { amountCents: -5, currency: 'AUD' },
    }
    expect(() => assertValidRewardDefinition(bad)).toThrow(/amountCents/)
  })
})
