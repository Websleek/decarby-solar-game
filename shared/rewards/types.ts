/** Phase 4C.1 — promotional reward types (foundation only; no live redemptions). */

export const REWARD_CURRENCIES = ['AUD'] as const
export type RewardCurrency = (typeof REWARD_CURRENCIES)[number]

export const REWARD_TYPES = [
  'consultation_benefit',
  'fixed_discount',
  'percentage_discount',
  'voucher',
  'special_offer',
] as const
export type RewardType = (typeof REWARD_TYPES)[number]

export const CAMPAIGN_LIFECYCLE_STATUSES = [
  'draft',
  'scheduled',
  'active',
  'paused',
  'expired',
  'archived',
] as const
export type CampaignLifecycleStatus = (typeof CAMPAIGN_LIFECYCLE_STATUSES)[number]

export const REWARD_PUBLISHING_STATUSES = ['draft', 'published', 'archived'] as const
export type RewardPublishingStatus = (typeof REWARD_PUBLISHING_STATUSES)[number]

export const CLAIM_STATUSES = [
  'pending',
  'approved',
  'rejected',
  'redeemed',
  'expired',
  'cancelled',
] as const
export type ClaimStatus = (typeof CLAIM_STATUSES)[number]

export const ELIGIBILITY_RESULT_STATUSES = [
  'eligible',
  'locked',
  'unavailable',
  'expired',
  'unsupported_rule',
  'verification_required',
] as const
export type EligibilityResultStatus = (typeof ELIGIBILITY_RESULT_STATUSES)[number]

export const LEADERBOARD_ELIGIBILITY_BOARDS = ['overall', 'speed'] as const
export type LeaderboardEligibilityBoard = (typeof LEADERBOARD_ELIGIBILITY_BOARDS)[number]

/** Typed eligibility configuration stored as JSONB. Unknown kinds fail closed. */
export type EligibilityRule =
  | Readonly<{ kind: 'achievement'; achievementId: string }>
  | Readonly<{ kind: 'verified_stars_at_least'; minStars: number }>
  | Readonly<{ kind: 'verified_rooftops_at_least'; minRooftops: number }>
  | Readonly<{
      kind: 'leaderboard_rank_at_most'
      board: LeaderboardEligibilityBoard
      maxRank: number
      /** Leaderboard promotions require a finalised snapshot; live ranks alone are insufficient. */
      requiresFinalisedSnapshot: true
    }>
  | Readonly<{ kind: 'all'; rules: readonly EligibilityRule[] }>
  | Readonly<{ kind: 'any'; rules: readonly EligibilityRule[] }>

export type MonetaryValueCents = Readonly<{
  amountCents: number
  currency: RewardCurrency
}>

export type RewardDefinitionDraft = Readonly<{
  id: string
  campaignId: string
  slug: string
  title: string
  shortDescription: string
  rewardType: RewardType
  /** Illustrative monetary value in integer cents; never redeemable in 4C.1. */
  illustrativeValue: MonetaryValueCents | null
  /** Percentage basis points for percentage_discount (100 = 1%). Null otherwise. */
  percentageBasisPoints: number | null
  eligibility: EligibilityRule
  publishingStatus: RewardPublishingStatus
  /** When false, hidden from any future public promotional catalog. */
  publicCatalog: boolean
  /** When false, claim creation is blocked even if eligible. */
  claimsEnabled: boolean
  displayOrder: number
  perPlayerLimit: number
  capacityLimit: number | null
}>

export type RewardCampaignDraft = Readonly<{
  id: string
  slug: string
  title: string
  description: string
  lifecycleStatus: CampaignLifecycleStatus
  startsAt: string | null
  endsAt: string | null
  /** When false, hidden from any future public promotional catalog. */
  publicCatalog: boolean
  /** Default policy: one claim per player per reward. */
  defaultOneClaimPerPlayerReward: boolean
}>

/** Canonical aliases used by registry + evaluators. */
export type RewardDefinition = RewardDefinitionDraft
export type RewardCampaign = RewardCampaignDraft

export const AUDIT_EVENT_TYPES = [
  'eligibility_checked',
  'claim_requested',
  'claim_approved',
  'claim_rejected',
  'claim_redeemed',
  'claim_expired',
  'campaign_updated',
] as const
export type AuditEventType = (typeof AUDIT_EVENT_TYPES)[number]

export type EligibilityEvaluationInput = Readonly<{
  /** Persisted verified achievement IDs only. */
  verifiedAchievementIds: readonly string[]
  /** Best verified Classic stars per level. */
  verifiedStarsByLevel: Readonly<Record<string, number>>
  /** Distinct verified Classic rooftop completions. */
  verifiedCompletedRooftops: readonly string[]
  /**
   * Finalised leaderboard snapshot standings only.
   * Live RPC ranks must not be used unless marked finalised.
   */
  finalisedLeaderboardStandings: readonly Readonly<{
    board: LeaderboardEligibilityBoard
    rank: number
    finalised: boolean
  }>[]
  nowIso?: string
  campaign: Readonly<{
    lifecycleStatus: CampaignLifecycleStatus
    startsAt: string | null
    endsAt: string | null
  }>
  reward: Readonly<{
    publishingStatus: RewardPublishingStatus
    publicCatalog: boolean
    claimsEnabled: boolean
    eligibility: EligibilityRule
  }>
}>

export type EligibilityEvaluationResult = Readonly<{
  status: EligibilityResultStatus
  reason: string
  /** True only when status === 'eligible'. Never implies a claim exists. */
  eligible: boolean
}>
