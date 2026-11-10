import {
  CAMPAIGN_LIFECYCLE_STATUSES,
  CLAIM_STATUSES,
  LEADERBOARD_ELIGIBILITY_BOARDS,
  REWARD_CURRENCIES,
  REWARD_PUBLISHING_STATUSES,
  REWARD_TYPES,
  type EligibilityRule,
  type MonetaryValueCents,
  type RewardDefinitionDraft,
  type RewardType,
} from './types.ts'

export type ValidationResult =
  | Readonly<{ ok: true }>
  | Readonly<{ ok: false; reason: string }>

export function validateMonetaryValue(value: MonetaryValueCents | null | undefined): ValidationResult {
  if (value == null) return { ok: true }
  if (!REWARD_CURRENCIES.includes(value.currency)) {
    return { ok: false, reason: `Unsupported currency: ${String(value.currency)}` }
  }
  if (!Number.isInteger(value.amountCents) || value.amountCents < 0) {
    return { ok: false, reason: 'amountCents must be a non-negative integer' }
  }
  if (value.amountCents > 100_000_000) {
    return { ok: false, reason: 'amountCents exceeds supported maximum' }
  }
  return { ok: true }
}

export function validatePercentageBasisPoints(
  rewardType: RewardType,
  basisPoints: number | null,
): ValidationResult {
  if (rewardType !== 'percentage_discount') {
    if (basisPoints != null) {
      return { ok: false, reason: 'percentageBasisPoints only allowed for percentage_discount' }
    }
    return { ok: true }
  }
  if (basisPoints == null || !Number.isInteger(basisPoints) || basisPoints <= 0 || basisPoints > 10_000) {
    return {
      ok: false,
      reason: 'percentage_discount requires percentageBasisPoints between 1 and 10000',
    }
  }
  return { ok: true }
}

export function validateEligibilityRule(rule: unknown, depth = 0): ValidationResult {
  if (depth > 8) return { ok: false, reason: 'Eligibility rule nesting exceeds maximum depth' }
  if (!rule || typeof rule !== 'object' || Array.isArray(rule)) {
    return { ok: false, reason: 'Eligibility rule must be an object' }
  }
  const kind = (rule as { kind?: unknown }).kind
  if (typeof kind !== 'string') return { ok: false, reason: 'Eligibility rule kind is required' }

  switch (kind) {
    case 'achievement': {
      const achievementId = (rule as { achievementId?: unknown }).achievementId
      if (typeof achievementId !== 'string' || achievementId.trim().length < 3) {
        return { ok: false, reason: 'achievement rule requires achievementId' }
      }
      return { ok: true }
    }
    case 'verified_stars_at_least': {
      const minStars = (rule as { minStars?: unknown }).minStars
      if (!Number.isInteger(minStars) || Number(minStars) < 1 || Number(minStars) > 15) {
        return { ok: false, reason: 'verified_stars_at_least requires minStars 1..15' }
      }
      return { ok: true }
    }
    case 'verified_rooftops_at_least': {
      const minRooftops = (rule as { minRooftops?: unknown }).minRooftops
      if (!Number.isInteger(minRooftops) || Number(minRooftops) < 1 || Number(minRooftops) > 5) {
        return { ok: false, reason: 'verified_rooftops_at_least requires minRooftops 1..5' }
      }
      return { ok: true }
    }
    case 'leaderboard_rank_at_most': {
      const board = (rule as { board?: unknown }).board
      const maxRank = (rule as { maxRank?: unknown }).maxRank
      const requiresFinalisedSnapshot = (rule as { requiresFinalisedSnapshot?: unknown })
        .requiresFinalisedSnapshot
      if (!LEADERBOARD_ELIGIBILITY_BOARDS.includes(board as never)) {
        return { ok: false, reason: 'leaderboard_rank_at_most requires a supported board' }
      }
      if (!Number.isInteger(maxRank) || Number(maxRank) < 1 || Number(maxRank) > 100) {
        return { ok: false, reason: 'leaderboard_rank_at_most requires maxRank 1..100' }
      }
      if (requiresFinalisedSnapshot !== true) {
        return {
          ok: false,
          reason: 'leaderboard_rank_at_most requires requiresFinalisedSnapshot: true',
        }
      }
      return { ok: true }
    }
    case 'all':
    case 'any': {
      const rules = (rule as { rules?: unknown }).rules
      if (!Array.isArray(rules) || rules.length === 0) {
        return { ok: false, reason: `${kind} requires a non-empty rules array` }
      }
      for (const child of rules) {
        const childResult = validateEligibilityRule(child, depth + 1)
        if (!childResult.ok) return childResult
      }
      return { ok: true }
    }
    default:
      return { ok: false, reason: `Unsupported eligibility rule kind: ${kind}` }
  }
}

export function validateRewardDefinitionDraft(draft: RewardDefinitionDraft): ValidationResult {
  if (!REWARD_TYPES.includes(draft.rewardType)) {
    return { ok: false, reason: `Unsupported reward type: ${draft.rewardType}` }
  }
  if (!REWARD_PUBLISHING_STATUSES.includes(draft.publishingStatus)) {
    return { ok: false, reason: `Unsupported publishing status: ${draft.publishingStatus}` }
  }
  if (!Number.isInteger(draft.perPlayerLimit) || draft.perPlayerLimit < 1) {
    return { ok: false, reason: 'perPlayerLimit must be an integer >= 1' }
  }
  if (
    draft.capacityLimit != null &&
    (!Number.isInteger(draft.capacityLimit) || draft.capacityLimit < 1)
  ) {
    return { ok: false, reason: 'capacityLimit must be null or an integer >= 1' }
  }
  const money = validateMonetaryValue(draft.illustrativeValue)
  if (!money.ok) return money
  const pct = validatePercentageBasisPoints(draft.rewardType, draft.percentageBasisPoints)
  if (!pct.ok) return pct
  return validateEligibilityRule(draft.eligibility)
}

export function isCampaignLifecycleStatus(value: string): boolean {
  return (CAMPAIGN_LIFECYCLE_STATUSES as readonly string[]).includes(value)
}

export function isClaimStatus(value: string): boolean {
  return (CLAIM_STATUSES as readonly string[]).includes(value)
}

export function assertEligibilityRule(rule: EligibilityRule): EligibilityRule {
  const result = validateEligibilityRule(rule)
  if (!result.ok) throw new Error(result.reason)
  return rule
}

export function assertValidRewardDefinition(draft: RewardDefinitionDraft): RewardDefinitionDraft {
  const result = validateRewardDefinitionDraft(draft)
  if (!result.ok) throw new Error(result.reason)
  return draft
}

export function assertValidCampaignLifecycle(status: string): void {
  if (!isCampaignLifecycleStatus(status)) {
    throw new Error(`Unsupported campaign lifecycle status: ${status}`)
  }
}
