import { validateAdultConsent, type AdultConsentAttestation } from './adultConsent.ts'
import {
  assertClaimTransition,
  canTransitionClaim,
  isCapacityConsumingClaimStatus,
} from './claimTransitions.ts'
import { evaluateRewardEligibility } from './eligibility.ts'
import type {
  AuditEventType,
  ClaimStatus,
  EligibilityEvaluationResult,
  RewardCampaign,
  RewardDefinition,
} from './types.ts'

/** Server-authoritative eligibility facts only. Never accept client-forged progress. */
export type ServerEligibilityFacts = Readonly<{
  verifiedAchievementIds: readonly string[]
  verifiedStarsByLevel: Readonly<Record<string, number>>
  verifiedCompletedRooftops: readonly string[]
  finalisedLeaderboardStandings: readonly Readonly<{
    board: 'overall' | 'speed'
    rank: number
    finalised: boolean
  }>[]
  nowIso?: string
}>

/**
 * Authenticated claimant bound to a server-resolved player profile.
 * playerId must come from trusted profile lookup (user_id = auth.uid()), never client input alone.
 */
export type ClaimantIdentity = Readonly<{
  userId: string
  playerId: string
  moderationStatus: 'active' | 'flagged' | 'restricted'
  adultConsent: AdultConsentAttestation
}>

export type RewardClaimRecord = Readonly<{
  id: string
  playerId: string
  rewardId: string
  campaignId: string
  status: ClaimStatus
  claimPolicy: 'one_per_player_reward' | 'campaign_controlled'
  eligibilitySnapshot: Readonly<Record<string, unknown>>
  redemptionMetadata: Readonly<Record<string, unknown>>
  createdAt: string
  updatedAt: string
  decidedAt: string | null
  redeemedAt: string | null
  expiresAt: string | null
}>

export type RewardAuditRecord = Readonly<{
  id: string
  eventType: AuditEventType
  campaignId: string | null
  rewardId: string | null
  claimId: string | null
  playerId: string | null
  actorRole: 'system' | 'service_role' | 'player' | 'admin'
  payload: Readonly<Record<string, unknown>>
  createdAt: string
}>

export type ClaimRejectionCode =
  | 'public_claims_disabled'
  | 'workflow_gated'
  | 'missing_profile'
  | 'moderation_blocked'
  | 'adult_verification_required'
  | 'consent_required'
  | 'cross_account'
  | 'ineligible'
  | 'claims_disabled'
  | 'campaign_inactive'
  | 'campaign_expired'
  | 'reward_unpublished'
  | 'per_player_limit'
  | 'capacity_exhausted'
  | 'invalid_transition'
  | 'unauthorized'
  | 'forged_input_rejected'

export type ClaimRequestOutcome =
  | Readonly<{
      kind: 'created'
      claim: RewardClaimRecord
      eligibility: EligibilityEvaluationResult
      audits: readonly RewardAuditRecord[]
    }>
  | Readonly<{
      kind: 'existing'
      claim: RewardClaimRecord
      eligibility: EligibilityEvaluationResult
      audits: readonly RewardAuditRecord[]
      duplicate: true
    }>
  | Readonly<{
      kind: 'rejected'
      code: ClaimRejectionCode
      reason: string
      eligibility?: EligibilityEvaluationResult
      audits: readonly RewardAuditRecord[]
    }>

export type ClaimTransitionOutcome =
  | Readonly<{
      kind: 'transitioned'
      claim: RewardClaimRecord
      from: ClaimStatus
      to: ClaimStatus
      audits: readonly RewardAuditRecord[]
    }>
  | Readonly<{
      kind: 'rejected'
      code: ClaimRejectionCode
      reason: string
      audits: readonly RewardAuditRecord[]
    }>

export type ClaimWorkflowGate = Readonly<{
  /**
   * Internal/test harness only. When false, claim creation is refused even if
   * a definition has claimsEnabled (protects against accidental live enabling).
   * Production public paths must leave this false.
   */
  internalClaimsAllowed: boolean
}>

export type ClaimInventorySnapshot = Readonly<{
  /** Existing claim for this player+reward, if any. */
  existingClaim: RewardClaimRecord | null
  /** Capacity-consuming claims for this player+reward. */
  playerConsumingCount: number
  /** Capacity-consuming claims for this reward across all players. */
  rewardConsumingCount: number
}>

function mapEligibilityToRejection(
  eligibility: EligibilityEvaluationResult,
): ClaimRejectionCode {
  if (eligibility.status === 'expired') return 'campaign_expired'
  if (eligibility.status === 'unavailable') {
    if (/claims are not enabled/i.test(eligibility.reason)) return 'claims_disabled'
    if (/publishing status/i.test(eligibility.reason)) return 'reward_unpublished'
    if (/paused|draft|scheduled|not active|not started|inactive and hidden/i.test(eligibility.reason)) {
      return 'campaign_inactive'
    }
    return 'claims_disabled'
  }
  return 'ineligible'
}

function buildEligibilitySnapshot(
  eligibility: EligibilityEvaluationResult,
  facts: ServerEligibilityFacts,
  identity: ClaimantIdentity,
): Record<string, unknown> {
  return {
    status: eligibility.status,
    reason: eligibility.reason,
    eligible: eligibility.eligible,
    evaluatedAt: facts.nowIso ?? new Date().toISOString(),
    verifiedAchievementIds: [...facts.verifiedAchievementIds],
    verifiedStarTotal: Object.values(facts.verifiedStarsByLevel).reduce(
      (sum, n) => sum + (Number.isFinite(n) ? Math.trunc(n) : 0),
      0,
    ),
    verifiedRooftopCount: new Set(facts.verifiedCompletedRooftops).size,
    finalisedStandingCount: facts.finalisedLeaderboardStandings.filter((s) => s.finalised).length,
    adultConfirmed: identity.adultConsent.adultConfirmed === true,
    consentGranted: identity.adultConsent.consentGranted === true,
    // Never store vouchers/codes — none are issued in 4C.2.
    voucherIssued: false,
    redeemable: false,
  }
}

function auditEventTypeForTransition(to: ClaimStatus): AuditEventType {
  switch (to) {
    case 'approved':
      return 'claim_approved'
    case 'rejected':
      return 'claim_rejected'
    case 'redeemed':
      return 'claim_redeemed'
    case 'expired':
      return 'claim_expired'
    case 'cancelled':
      // Additive semantics via payload; enum value claim_cancelled may also exist post-migration.
      return 'claim_rejected'
    default:
      return 'claim_requested'
  }
}

/**
 * Validates identity, adult/consent, campaign/reward gates, eligibility and limits
 * without mutating storage. Pure planning step for transactional claim creation.
 */
export function planClaimRequest(input: {
  gate: ClaimWorkflowGate
  identity: ClaimantIdentity
  campaign: RewardCampaign
  reward: RewardDefinition
  serverFacts: ServerEligibilityFacts
  inventory: ClaimInventorySnapshot
  /**
   * Reject if callers attempt to smuggle client-forged progress alongside server facts.
   * Presence of this bag always fails closed.
   */
  clientForgedProgress?: unknown
}): ClaimRequestOutcome {
  const audits: RewardAuditRecord[] = []
  const nowIso = input.serverFacts.nowIso ?? new Date().toISOString()

  if (input.clientForgedProgress != null) {
    return {
      kind: 'rejected',
      code: 'forged_input_rejected',
      reason:
        'Client-submitted achievements, scores, stars or ranks are never trusted for promotional claims.',
      audits,
    }
  }

  if (!input.gate.internalClaimsAllowed) {
    return {
      kind: 'rejected',
      code: 'workflow_gated',
      reason:
        'Internal claim workflow is gated. Public promotional claims remain disabled.',
      audits,
    }
  }

  if (!input.identity.userId || !input.identity.playerId) {
    return {
      kind: 'rejected',
      code: 'missing_profile',
      reason: 'Authenticated player profile is required to request a claim.',
      audits,
    }
  }

  if (input.identity.moderationStatus !== 'active') {
    return {
      kind: 'rejected',
      code: 'moderation_blocked',
      reason: 'Player profile is not in an active moderation state.',
      audits,
    }
  }

  const consent = validateAdultConsent(input.identity.adultConsent)
  if (!consent.ok) {
    return {
      kind: 'rejected',
      code: consent.code,
      reason: consent.reason,
      audits,
    }
  }

  if (input.reward.campaignId !== input.campaign.id) {
    return {
      kind: 'rejected',
      code: 'unauthorized',
      reason: 'Reward does not belong to the supplied campaign.',
      audits,
    }
  }

  if (!input.reward.claimsEnabled) {
    const eligibility = evaluateRewardEligibility({
      ...input.serverFacts,
      campaign: input.campaign,
      reward: input.reward,
    })
    return {
      kind: 'rejected',
      code: 'claims_disabled',
      reason: 'Reward claims are not enabled for this definition.',
      eligibility,
      audits,
    }
  }

  const eligibility = evaluateRewardEligibility({
    ...input.serverFacts,
    campaign: input.campaign,
    reward: input.reward,
  })

  // Always record a planned eligibility check shape for callers to persist inside a transaction.
  const eligibilityAudit: Omit<RewardAuditRecord, 'id' | 'createdAt'> = {
    eventType: 'eligibility_checked',
    campaignId: input.campaign.id,
    rewardId: input.reward.id,
    claimId: null,
    playerId: input.identity.playerId,
    actorRole: 'service_role',
    payload: {
      status: eligibility.status,
      eligible: eligibility.eligible,
      reason: eligibility.reason,
    },
  }

  if (input.inventory.existingClaim) {
    return {
      kind: 'existing',
      claim: input.inventory.existingClaim,
      eligibility,
      duplicate: true,
      audits: [
        {
          id: 'planned-eligibility',
          createdAt: nowIso,
          ...eligibilityAudit,
          claimId: input.inventory.existingClaim.id,
        },
      ],
    }
  }

  if (!eligibility.eligible) {
    return {
      kind: 'rejected',
      code: mapEligibilityToRejection(eligibility),
      reason: eligibility.reason,
      eligibility,
      audits: [
        {
          id: 'planned-eligibility',
          createdAt: nowIso,
          ...eligibilityAudit,
        },
      ],
    }
  }

  if (input.inventory.playerConsumingCount >= input.reward.perPlayerLimit) {
    return {
      kind: 'rejected',
      code: 'per_player_limit',
      reason: `Per-player claim limit reached (${input.reward.perPlayerLimit}).`,
      eligibility,
      audits: [
        {
          id: 'planned-eligibility',
          createdAt: nowIso,
          ...eligibilityAudit,
        },
      ],
    }
  }

  if (
    input.reward.capacityLimit != null &&
    input.inventory.rewardConsumingCount >= input.reward.capacityLimit
  ) {
    return {
      kind: 'rejected',
      code: 'capacity_exhausted',
      reason: `Reward capacity exhausted (${input.reward.capacityLimit}).`,
      eligibility,
      audits: [
        {
          id: 'planned-eligibility',
          createdAt: nowIso,
          ...eligibilityAudit,
        },
      ],
    }
  }

  const claimPolicy = input.campaign.defaultOneClaimPerPlayerReward
    ? 'one_per_player_reward'
    : 'campaign_controlled'

  const claim: RewardClaimRecord = {
    id: 'planned',
    playerId: input.identity.playerId,
    rewardId: input.reward.id,
    campaignId: input.campaign.id,
    status: 'pending',
    claimPolicy,
    eligibilitySnapshot: buildEligibilitySnapshot(eligibility, input.serverFacts, input.identity),
    redemptionMetadata: {
      voucherIssued: false,
      redeemable: false,
      monetaryValueIssued: false,
    },
    createdAt: nowIso,
    updatedAt: nowIso,
    decidedAt: null,
    redeemedAt: null,
    expiresAt: null,
  }

  return {
    kind: 'created',
    claim,
    eligibility,
    audits: [
      {
        id: 'planned-eligibility',
        createdAt: nowIso,
        ...eligibilityAudit,
      },
      {
        id: 'planned-claim-requested',
        createdAt: nowIso,
        eventType: 'claim_requested',
        campaignId: input.campaign.id,
        rewardId: input.reward.id,
        claimId: 'planned',
        playerId: input.identity.playerId,
        actorRole: 'service_role',
        payload: {
          status: 'pending',
          duplicate: false,
          voucherIssued: false,
        },
      },
    ],
  }
}

export function planClaimTransition(input: {
  claim: RewardClaimRecord
  to: ClaimStatus
  actorRole?: RewardAuditRecord['actorRole']
  reason?: string
  nowIso?: string
}): ClaimTransitionOutcome {
  const nowIso = input.nowIso ?? new Date().toISOString()
  if (!canTransitionClaim(input.claim.status, input.to)) {
    return {
      kind: 'rejected',
      code: 'invalid_transition',
      reason: `Invalid claim transition: ${input.claim.status} -> ${input.to}`,
      audits: [],
    }
  }
  assertClaimTransition(input.claim.status, input.to)

  // 4C.2 never auto-issues vouchers; redeemed is reserved for a later authorised step.
  const redemptionMetadata =
    input.to === 'redeemed'
      ? {
          ...input.claim.redemptionMetadata,
          // Still no code generation in this phase — redemption metadata stays non-monetary.
          voucherIssued: false,
          redeemable: false,
          note: 'Status redeemed recorded without issuing a voucher code (4C.2).',
        }
      : input.claim.redemptionMetadata

  const claim: RewardClaimRecord = {
    ...input.claim,
    status: input.to,
    updatedAt: nowIso,
    decidedAt:
      input.to === 'approved' || input.to === 'rejected' || input.to === 'cancelled'
        ? nowIso
        : input.claim.decidedAt,
    redeemedAt: input.to === 'redeemed' ? nowIso : input.claim.redeemedAt,
    expiresAt: input.to === 'expired' ? nowIso : input.claim.expiresAt,
    redemptionMetadata,
  }

  const eventType = auditEventTypeForTransition(input.to)
  return {
    kind: 'transitioned',
    claim,
    from: input.claim.status,
    to: input.to,
    audits: [
      {
        id: 'planned-transition',
        createdAt: nowIso,
        eventType,
        campaignId: claim.campaignId,
        rewardId: claim.rewardId,
        claimId: claim.id,
        playerId: claim.playerId,
        actorRole: input.actorRole ?? 'service_role',
        payload: {
          from: input.claim.status,
          to: input.to,
          reason: input.reason ?? null,
          voucherIssued: false,
          action: input.to === 'cancelled' ? 'cancelled' : input.to,
        },
      },
    ],
  }
}

export function countConsumingClaims(claims: readonly RewardClaimRecord[]): number {
  return claims.filter((c) => isCapacityConsumingClaimStatus(c.status)).length
}
