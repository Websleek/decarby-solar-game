import {
  createInternalClaimHarness,
  type InternalClaimHarness,
} from '../../../shared/rewards/claimHarness'
import {
  planClaimRequest,
  planClaimTransition,
  type ClaimantIdentity,
  type ClaimInventorySnapshot,
  type ClaimRequestOutcome,
  type ClaimTransitionOutcome,
  type ClaimWorkflowGate,
  type ServerEligibilityFacts,
} from '../../../shared/rewards/claimWorkflow'
import {
  evaluateRewardEligibility,
  type EligibilityEvaluationInput,
  type EligibilityEvaluationResult,
  type RewardCampaign,
  type RewardDefinition,
} from '../../../shared/rewards/index'
import type { ClaimStatus } from '../../../shared/rewards/types'
import {
  DEMO_REWARD_CAMPAIGN,
  listDemoRewardDefinitions,
} from '../../../shared/rewards/registry'

/**
 * Phase 4C.1/4C.2 promotional rewards.
 * Public claiming remains disabled. Internal claim workflow is service-role / harness only.
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

export type {
  ClaimantIdentity,
  ClaimRequestOutcome,
  ClaimTransitionOutcome,
  ClaimWorkflowGate,
  InternalClaimHarness,
  ServerEligibilityFacts,
}

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
 * Public/frontend claim path — always disabled.
 * No live claiming, codes, or Reward Centre claim button integration in 4C.2.
 */
export function requestPromotionalClaim(): never {
  throw new Error(
    'Public promotional reward claims are disabled. No public claim endpoint is available.',
  )
}

/**
 * Pure claim planning for trusted service-role callers.
 * Does not write to the database; pair with request_player_reward_claim RPC.
 */
export function planTrustedClaimRequest(input: {
  gate: ClaimWorkflowGate
  identity: ClaimantIdentity
  campaign: RewardCampaign
  reward: RewardDefinition
  serverFacts: ServerEligibilityFacts
  inventory: ClaimInventorySnapshot
  clientForgedProgress?: unknown
}): ClaimRequestOutcome {
  return planClaimRequest(input)
}

export function planTrustedClaimTransition(input: {
  claim: Parameters<typeof planClaimTransition>[0]['claim']
  to: ClaimStatus
  reason?: string
}): ClaimTransitionOutcome {
  return planClaimTransition(input)
}

/**
 * Explicitly gated in-memory harness for developers/tests.
 * Never points at production campaigns. Never issues vouchers.
 */
export function createPromotionalClaimTestHarness(
  gate: ClaimWorkflowGate = { internalClaimsAllowed: true },
): InternalClaimHarness {
  return createInternalClaimHarness(gate)
}

export const promotionalRewardService = {
  listInactiveDemoRewards,
  getInactiveDemoCampaign,
  evaluatePromotionalEligibility,
  evaluateDemoPromotionalEligibility,
  requestPromotionalClaim,
  planTrustedClaimRequest,
  planTrustedClaimTransition,
  createPromotionalClaimTestHarness,
}
