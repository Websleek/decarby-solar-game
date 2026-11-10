import { describe, expect, it } from 'vitest'
import { getDemoRewardBySlug } from '../../../shared/rewards/registry'
import {
  evaluatePromotionalEligibility,
  promotionalRewardService,
} from './promotionalRewards'

describe('promotionalRewards service', () => {
  it('evaluates a published active reward with verified facts only', () => {
    const reward = getDemoRewardBySlug('star-collector-example-100')!
    const result = evaluatePromotionalEligibility({
      campaign: {
        ...promotionalRewardService.getInactiveDemoCampaign(),
        lifecycleStatus: 'active',
        publicCatalog: true,
      },
      reward: {
        ...reward,
        publishingStatus: 'published',
        publicCatalog: true,
        claimsEnabled: true,
      },
      facts: {
        verifiedAchievementIds: [],
        verifiedStarsByLevel: {
          'sunny-house': 3,
          'chimney-challenge': 3,
          'tricky-rooftop': 2,
          'solar-puzzle-master': 1,
          'decarby-solar-champion': 1,
        },
        verifiedCompletedRooftops: [],
        finalisedLeaderboardStandings: [],
      },
    })
    expect(result.status).toBe('eligible')
    expect(result.eligible).toBe(true)
  })

  it('does not treat missing player verified facts as eligible', () => {
    const reward = getDemoRewardBySlug('solar-starter-consultation')!
    const result = evaluatePromotionalEligibility({
      campaign: {
        ...promotionalRewardService.getInactiveDemoCampaign(),
        lifecycleStatus: 'active',
        publicCatalog: true,
      },
      reward: {
        ...reward,
        publishingStatus: 'published',
        publicCatalog: true,
        claimsEnabled: true,
      },
      facts: {
        verifiedAchievementIds: [],
        verifiedStarsByLevel: {},
        verifiedCompletedRooftops: [],
        finalisedLeaderboardStandings: [],
      },
    })
    expect(result.status).toBe('verification_required')
    expect(result.eligible).toBe(false)
  })
})
