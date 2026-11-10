import {
  evaluateRewardEligibility,
  type EligibilityEvaluationInput,
  type EligibilityEvaluationResult,
  type RewardCampaign,
  type RewardDefinition,
} from '../../../shared/rewards/index'
import {
  DEMO_REWARD_CAMPAIGN,
  listDemoRewardDefinitions,
} from '../../../shared/rewards/registry'

/**
 * Phase 4C.1 promotional rewards foundation.
 * Eligibility evaluation only — never creates claims, vouchers, or discounts.
 */
export type PromotionalEligibilityFacts = Readonly<{
  verifiedAchievementIds: readonly string[]
  verifiedStarsByLevel: Readonly<Record<string, number>>
  verifiedCompletedRooftops: readonly string[]
  finalisedLeaderboardStandings: EligibilityEvaluationInput['finalisedLeaderboardStandings']
  nowIso?: string
}>

export type PromotionalEligibilityView = Readonly<{
  reward: RewardDefinition
  campaign: RewardCampaign
  result: EligibilityEvaluationResult
}>

export function listInactiveDemoRewards(): readonly RewardDefinition[] {
  return listDemoRewardDefinitions()
}

export function getInactiveDemoCampaign(): RewardCampaign {
  return DEMO_REWARD_CAMPAIGN
}

/**
 * Pure evaluation against a provided reward/campaign pair.
 * Does not persist claims, audit rows, or inventory changes.
 */
export function evaluatePromotionalEligibility(input: {
  campaign: RewardCampaign
  reward: RewardDefinition
  facts: PromotionalEligibilityFacts
}): EligibilityEvaluationResult {
  return evaluateRewardEligibility({
    verifiedAchievementIds: input.facts.verifiedAchievementIds,
    verifiedStarsByLevel: input.facts.verifiedStarsByLevel,
    verifiedCompletedRooftops: input.facts.verifiedCompletedRooftops,
    finalisedLeaderboardStandings: input.facts.finalisedLeaderboardStandings,
    nowIso: input.facts.nowIso,
    campaign: {
      lifecycleStatus: input.campaign.lifecycleStatus,
      startsAt: input.campaign.startsAt,
      endsAt: input.campaign.endsAt,
    },
    reward: {
      publishingStatus: input.reward.publishingStatus,
      publicCatalog: input.reward.publicCatalog,
      claimsEnabled: input.reward.claimsEnabled,
      eligibility: input.reward.eligibility,
    },
  })
}

/**
 * Evaluate demo placeholders against server-authoritative facts.
 * Demo rewards remain unavailable for live claims by design.
 */
export function evaluateDemoPromotionalEligibility(
  facts: PromotionalEligibilityFacts,
): readonly PromotionalEligibilityView[] {
  const campaign = DEMO_REWARD_CAMPAIGN
  return listDemoRewardDefinitions().map((reward) => ({
    reward,
    campaign,
    result: evaluatePromotionalEligibility({ campaign, reward, facts }),
  }))
}

/**
 * Intentionally unimplemented in Phase 4C.1.
 * Public claim / redemption endpoints must not be enabled yet.
 */
export function requestPromotionalClaim(): never {
  throw new Error(
    'Promotional reward claims are disabled in Phase 4C.1. No claim endpoint is available.',
  )
}

export const promotionalRewardService = {
  listInactiveDemoRewards,
  getInactiveDemoCampaign,
  evaluatePromotionalEligibility,
  evaluateDemoPromotionalEligibility,
  requestPromotionalClaim,
}
