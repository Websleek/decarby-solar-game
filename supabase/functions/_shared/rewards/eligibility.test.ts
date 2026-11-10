import { describe, expect, it } from 'vitest'
import {
  evaluateEligibilityRuleOnly,
  evaluateRewardEligibility,
} from './eligibility.ts'
import { DEMO_REWARD_CAMPAIGN, getDemoRewardBySlug } from './registry.ts'
import type { EligibilityEvaluationInput, EligibilityRule } from './types.ts'

const emptyFacts = {
  verifiedAchievementIds: [] as string[],
  verifiedStarsByLevel: {} as Record<string, number>,
  verifiedCompletedRooftops: [] as string[],
  finalisedLeaderboardStandings: [] as EligibilityEvaluationInput['finalisedLeaderboardStandings'],
}

function activePublishedInput(
  rule: EligibilityRule,
  facts: Partial<typeof emptyFacts> = {},
  overrides: Partial<EligibilityEvaluationInput> = {},
): EligibilityEvaluationInput {
  return {
    ...emptyFacts,
    ...facts,
    campaign: {
      lifecycleStatus: 'active',
      startsAt: null,
      endsAt: null,
    },
    reward: {
      publishingStatus: 'published',
      publicCatalog: true,
      claimsEnabled: true,
      eligibility: rule,
    },
    ...overrides,
  }
}

describe('evaluateRewardEligibility', () => {
  it('accepts verified achievement eligibility and never creates claims', () => {
    const rule: EligibilityRule = { kind: 'achievement', achievementId: 'solar_starter' }
    const result = evaluateRewardEligibility(
      activePublishedInput(rule, { verifiedAchievementIds: ['solar_starter'] }),
    )
    expect(result).toEqual({
      status: 'eligible',
      eligible: true,
      reason: 'Verified achievement awarded: solar_starter',
    })
    expect(result).not.toHaveProperty('claimId')
    expect(result).not.toHaveProperty('voucherCode')
    expect(result).not.toHaveProperty('discount')
  })

  it('rejects unverified local achievement progress', () => {
    const result = evaluateEligibilityRuleOnly(
      { kind: 'achievement', achievementId: 'solar_starter' },
      emptyFacts,
    )
    expect(result.status).toBe('verification_required')
    expect(result.eligible).toBe(false)
  })

  it('locks when verified stars are below threshold', () => {
    const result = evaluateEligibilityRuleOnly(
      { kind: 'verified_stars_at_least', minStars: 10 },
      {
        ...emptyFacts,
        verifiedStarsByLevel: { 'sunny-house': 3, 'chimney-challenge': 2 },
      },
    )
    expect(result.status).toBe('locked')
    expect(result.eligible).toBe(false)
  })

  it('eligibilizes at exact verified star threshold', () => {
    const result = evaluateEligibilityRuleOnly(
      { kind: 'verified_stars_at_least', minStars: 10 },
      {
        ...emptyFacts,
        verifiedStarsByLevel: {
          'sunny-house': 3,
          'chimney-challenge': 3,
          'tricky-rooftop': 2,
          'solar-puzzle-master': 1,
          'decarby-solar-champion': 1,
        },
      },
    )
    expect(result.status).toBe('eligible')
    expect(result.eligible).toBe(true)
  })

  it('eligibilizes above verified star threshold', () => {
    const result = evaluateEligibilityRuleOnly(
      { kind: 'verified_stars_at_least', minStars: 10 },
      {
        ...emptyFacts,
        verifiedStarsByLevel: {
          'sunny-house': 3,
          'chimney-challenge': 3,
          'tricky-rooftop': 3,
          'solar-puzzle-master': 3,
          'decarby-solar-champion': 3,
        },
      },
    )
    expect(result.status).toBe('eligible')
  })

  it('returns unavailable for inactive draft campaign placeholders', () => {
    const reward = getDemoRewardBySlug('solar-starter-consultation')!
    const result = evaluateRewardEligibility({
      ...emptyFacts,
      verifiedAchievementIds: ['solar_starter'],
      campaign: DEMO_REWARD_CAMPAIGN,
      reward,
    })
    expect(result.status).toBe('unavailable')
    expect(result.eligible).toBe(false)
  })

  it('returns unavailable when campaign is paused', () => {
    const result = evaluateRewardEligibility(
      activePublishedInput(
        { kind: 'achievement', achievementId: 'solar_starter' },
        { verifiedAchievementIds: ['solar_starter'] },
        {
          campaign: {
            lifecycleStatus: 'paused',
            startsAt: null,
            endsAt: null,
          },
        },
      ),
    )
    expect(result.status).toBe('unavailable')
    expect(result.reason).toMatch(/paused/i)
  })

  it('returns expired when campaign end date has passed', () => {
    const result = evaluateRewardEligibility(
      activePublishedInput(
        { kind: 'achievement', achievementId: 'solar_starter' },
        { verifiedAchievementIds: ['solar_starter'] },
        {
          nowIso: '2026-11-10T00:00:00.000Z',
          campaign: {
            lifecycleStatus: 'active',
            startsAt: '2026-01-01T00:00:00.000Z',
            endsAt: '2026-06-01T00:00:00.000Z',
          },
        },
      ),
    )
    expect(result.status).toBe('expired')
  })

  it('returns expired when campaign lifecycle is expired', () => {
    const result = evaluateRewardEligibility(
      activePublishedInput(
        { kind: 'achievement', achievementId: 'solar_starter' },
        { verifiedAchievementIds: ['solar_starter'] },
        {
          campaign: {
            lifecycleStatus: 'expired',
            startsAt: null,
            endsAt: null,
          },
        },
      ),
    )
    expect(result.status).toBe('expired')
  })

  it('fails closed on unknown eligibility rules', () => {
    const result = evaluateEligibilityRuleOnly(
      { kind: 'not_a_real_rule' } as unknown as EligibilityRule,
      emptyFacts,
    )
    expect(result.status).toBe('unsupported_rule')
    expect(result.eligible).toBe(false)
  })

  it('requires finalised leaderboard snapshots', () => {
    const rule: EligibilityRule = {
      kind: 'leaderboard_rank_at_most',
      board: 'overall',
      maxRank: 10,
      requiresFinalisedSnapshot: true,
    }
    const liveOnly = evaluateEligibilityRuleOnly(rule, {
      ...emptyFacts,
      finalisedLeaderboardStandings: [{ board: 'overall', rank: 1, finalised: false }],
    })
    expect(liveOnly.status).toBe('unavailable')

    const finalised = evaluateEligibilityRuleOnly(rule, {
      ...emptyFacts,
      finalisedLeaderboardStandings: [{ board: 'overall', rank: 5, finalised: true }],
    })
    expect(finalised.status).toBe('eligible')
  })

  it('evaluates combined AND / OR rules', () => {
    const andRule: EligibilityRule = {
      kind: 'all',
      rules: [
        { kind: 'achievement', achievementId: 'solar_champion' },
        { kind: 'verified_rooftops_at_least', minRooftops: 5 },
      ],
    }
    expect(
      evaluateEligibilityRuleOnly(andRule, {
        ...emptyFacts,
        verifiedAchievementIds: ['solar_champion'],
        verifiedCompletedRooftops: ['a', 'b', 'c', 'd'],
      }).status,
    ).toBe('locked')

    expect(
      evaluateEligibilityRuleOnly(andRule, {
        ...emptyFacts,
        verifiedAchievementIds: ['solar_champion'],
        verifiedCompletedRooftops: ['a', 'b', 'c', 'd', 'e'],
      }).status,
    ).toBe('eligible')

    const orRule: EligibilityRule = {
      kind: 'any',
      rules: [
        { kind: 'verified_stars_at_least', minStars: 15 },
        {
          kind: 'leaderboard_rank_at_most',
          board: 'overall',
          maxRank: 10,
          requiresFinalisedSnapshot: true,
        },
      ],
    }
    expect(
      evaluateEligibilityRuleOnly(orRule, {
        ...emptyFacts,
        finalisedLeaderboardStandings: [{ board: 'overall', rank: 3, finalised: true }],
      }).status,
    ).toBe('eligible')
  })
})
