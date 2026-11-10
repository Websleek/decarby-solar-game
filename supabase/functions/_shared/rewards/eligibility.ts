import { validateEligibilityRule } from './validate.ts'
import type {
  EligibilityEvaluationInput,
  EligibilityEvaluationResult,
  EligibilityRule,
} from './types.ts'

function locked(reason: string): EligibilityEvaluationResult {
  return { status: 'locked', reason, eligible: false }
}

function unavailable(reason: string): EligibilityEvaluationResult {
  return { status: 'unavailable', reason, eligible: false }
}

function expired(reason: string): EligibilityEvaluationResult {
  return { status: 'expired', reason, eligible: false }
}

function unsupported(reason: string): EligibilityEvaluationResult {
  return { status: 'unsupported_rule', reason, eligible: false }
}

function verificationRequired(reason: string): EligibilityEvaluationResult {
  return { status: 'verification_required', reason, eligible: false }
}

function eligible(reason: string): EligibilityEvaluationResult {
  return { status: 'eligible', reason, eligible: true }
}

function sumVerifiedStars(starsByLevel: Readonly<Record<string, number>>): number {
  return Object.values(starsByLevel).reduce((sum, value) => {
    if (!Number.isFinite(value) || value < 0) return sum
    return sum + Math.trunc(value)
  }, 0)
}

function evaluateRule(
  rule: EligibilityRule,
  input: EligibilityEvaluationInput,
): EligibilityEvaluationResult {
  const validation = validateEligibilityRule(rule)
  if (!validation.ok) return unsupported(validation.reason)

  switch (rule.kind) {
    case 'achievement': {
      if (input.verifiedAchievementIds.includes(rule.achievementId)) {
        return eligible(`Verified achievement awarded: ${rule.achievementId}`)
      }
      return verificationRequired(
        `Requires persisted verified achievement "${rule.achievementId}" (local progress is not accepted).`,
      )
    }
    case 'verified_stars_at_least': {
      const total = sumVerifiedStars(input.verifiedStarsByLevel)
      if (total >= rule.minStars) {
        return eligible(`Verified Classic stars total ${total} (need ${rule.minStars}).`)
      }
      return locked(`Verified Classic stars total ${total}; need at least ${rule.minStars}.`)
    }
    case 'verified_rooftops_at_least': {
      const count = new Set(input.verifiedCompletedRooftops).size
      if (count >= rule.minRooftops) {
        return eligible(`Verified rooftop completions: ${count} (need ${rule.minRooftops}).`)
      }
      return locked(
        `Verified rooftop completions: ${count}; need at least ${rule.minRooftops}.`,
      )
    }
    case 'leaderboard_rank_at_most': {
      if (rule.requiresFinalisedSnapshot !== true) {
        return unsupported('Leaderboard rules require requiresFinalisedSnapshot: true')
      }
      const hit = input.finalisedLeaderboardStandings.find(
        (row) =>
          row.board === rule.board &&
          row.finalised === true &&
          row.rank >= 1 &&
          row.rank <= rule.maxRank,
      )
      if (hit) {
        return eligible(
          `Finalised ${rule.board} leaderboard rank ${hit.rank} qualifies (max ${rule.maxRank}).`,
        )
      }
      const liveOnly = input.finalisedLeaderboardStandings.some(
        (row) => row.board === rule.board && row.finalised !== true,
      )
      if (liveOnly) {
        return unavailable(
          'Live leaderboard ranks are not accepted; a finalised snapshot is required.',
        )
      }
      return locked(
        `No finalised ${rule.board} standing at rank ${rule.maxRank} or better.`,
      )
    }
    case 'all': {
      for (const child of rule.rules) {
        const childResult = evaluateRule(child, input)
        if (!childResult.eligible) return childResult
      }
      return eligible('All configured eligibility rules passed.')
    }
    case 'any': {
      let bestFailure: EligibilityEvaluationResult | null = null
      for (const child of rule.rules) {
        const childResult = evaluateRule(child, input)
        if (childResult.eligible) {
          return eligible(`Matched eligibility rule: ${child.kind}`)
        }
        bestFailure = bestFailure ?? childResult
      }
      return bestFailure ?? locked('No eligibility rules matched.')
    }
    default: {
      const exhaustive: never = rule
      return unsupported(`Unsupported eligibility rule: ${JSON.stringify(exhaustive)}`)
    }
  }
}

/**
 * Pure eligibility evaluation. Never creates claims, invents discounts,
 * or mutates inventory. Unknown rules fail closed.
 */
export function evaluateRewardEligibility(
  input: EligibilityEvaluationInput,
): EligibilityEvaluationResult {
  const now = Date.parse(input.nowIso ?? new Date().toISOString())
  if (!Number.isFinite(now)) {
    return unavailable('Invalid evaluation timestamp.')
  }

  const { campaign, reward } = input

  if (campaign.lifecycleStatus === 'expired' || campaign.lifecycleStatus === 'archived') {
    return expired(`Campaign is ${campaign.lifecycleStatus}.`)
  }
  if (campaign.lifecycleStatus === 'paused') {
    return unavailable('Campaign is paused.')
  }
  if (campaign.lifecycleStatus === 'draft' || campaign.lifecycleStatus === 'scheduled') {
    return unavailable(`Campaign is ${campaign.lifecycleStatus} and not accepting promotions.`)
  }
  if (campaign.lifecycleStatus !== 'active') {
    return unavailable(`Campaign lifecycle status "${campaign.lifecycleStatus}" is not active.`)
  }

  if (campaign.startsAt) {
    const starts = Date.parse(campaign.startsAt)
    if (Number.isFinite(starts) && now < starts) {
      return unavailable('Campaign has not started yet.')
    }
  }
  if (campaign.endsAt) {
    const ends = Date.parse(campaign.endsAt)
    if (Number.isFinite(ends) && now > ends) {
      return expired('Campaign end date has passed.')
    }
  }

  if (reward.publishingStatus !== 'published') {
    return unavailable(`Reward publishing status is "${reward.publishingStatus}".`)
  }
  if (!reward.publicCatalog && !reward.claimsEnabled) {
    // Hidden development placeholders (Phase 4C.1 demo rewards).
    return unavailable('Reward is inactive and hidden from live promotional claims.')
  }
  if (!reward.claimsEnabled) {
    return unavailable('Reward claims are not enabled for this definition.')
  }

  return evaluateRule(reward.eligibility, input)
}

/**
 * Convenience: evaluate rule logic only (campaign/reward gates already passed).
 * Still fails closed on unknown rules. Does not create claims.
 */
export function evaluateEligibilityRuleOnly(
  rule: EligibilityRule,
  facts: Omit<EligibilityEvaluationInput, 'campaign' | 'reward' | 'nowIso'>,
): EligibilityEvaluationResult {
  return evaluateRule(rule, {
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
  })
}
