/**
 * Event campaign reward tiers (AUD cents) for the 3-rooftop primary flow.
 * Pure, authoritative calculator shared by client and server.
 * Thresholds are intentionally easy to retune via REWARD_TIERS.
 */

import { CAMPAIGN_LEVEL_IDS, type CampaignLevelId } from '../achievements/registry.ts'

export const PROMOTIONAL_CAMPAIGN_ID = 'event-three-rooftop-v1' as const
export const PROMOTIONAL_CAMPAIGN_VERSION = 1 as const

export const REWARD_CURRENCY = 'AUD' as const
export const MAX_STARS_PER_LEVEL = 3 as const
/** Max stars for a full 3-level campaign run. */
export const MAX_CAMPAIGN_STARS = CAMPAIGN_LEVEL_IDS.length * MAX_STARS_PER_LEVEL
/** Minimum total stars for the lowest promotional tier. */
export const MIN_REWARD_STARS = 3 as const

export const REWARD_TIER_IDS = ['tier_500', 'tier_250', 'tier_100', 'tier_50'] as const
export type RewardTierId = (typeof REWARD_TIER_IDS)[number]

export type RewardTierDefinition = Readonly<{
  id: RewardTierId
  minStars: number
  maxStars: number
  amountCents: number
  displayLabel: string
}>

/**
 * Inclusive star ranges for total stars across 3 rooftops (max 9).
 * Higher tiers win when ranges are checked top-down.
 *
 * Adjust bands here only — evaluateCampaignReward stays shared.
 */
export const REWARD_TIERS: readonly RewardTierDefinition[] = Object.freeze([
  {
    id: 'tier_500',
    minStars: 9,
    maxStars: 9,
    amountCents: 50_000,
    displayLabel: 'A$500 OFF',
  },
  {
    id: 'tier_250',
    minStars: 8,
    maxStars: 8,
    amountCents: 25_000,
    displayLabel: 'A$250 OFF',
  },
  {
    id: 'tier_100',
    minStars: 6,
    maxStars: 7,
    amountCents: 10_000,
    displayLabel: 'A$100 OFF',
  },
  {
    id: 'tier_50',
    minStars: MIN_REWARD_STARS,
    maxStars: 5,
    amountCents: 5_000,
    displayLabel: 'A$50 OFF',
  },
])

export type VerifiedCampaignLevelResult = Readonly<{
  levelId: CampaignLevelId
  verifiedStars: number
  verifiedScore: number
  verifiedRecordId: string
  levelVersion: number
}>

export type CampaignRewardDecision =
  | Readonly<{
      eligible: true
      tierId: RewardTierId
      amountCents: number
      currency: typeof REWARD_CURRENCY
      displayLabel: string
      totalStars: number
      totalScore: number
      reason: string
    }>
  | Readonly<{
      eligible: false
      tierId: null
      amountCents: 0
      currency: typeof REWARD_CURRENCY
      displayLabel: null
      totalStars: number
      totalScore: number
      reason: string
      code:
        | 'incomplete_campaign'
        | 'missing_level'
        | 'zero_star_level'
        | 'invalid_stars'
        | 'duplicate_level'
        | 'wrong_level_set'
        | 'below_minimum_stars'
    }>

export function formatAudCents(amountCents: number): string {
  const dollars = amountCents / 100
  return `A$${dollars.toLocaleString('en-AU', {
    minimumFractionDigits: dollars % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })} OFF`
}

export function pickTierForStars(totalStars: number): RewardTierDefinition | null {
  if (!Number.isInteger(totalStars) || totalStars < 0) return null
  for (const tier of REWARD_TIERS) {
    if (totalStars >= tier.minStars && totalStars <= tier.maxStars) return tier
  }
  return null
}

/**
 * Evaluate promotional eligibility from a single qualifying run's verified results.
 * Does not accept localStorage stars or unrelated personal-best history.
 */
export function evaluateCampaignReward(
  results: readonly VerifiedCampaignLevelResult[],
): CampaignRewardDecision {
  const byLevel = new Map<string, VerifiedCampaignLevelResult>()
  let totalScore = 0

  for (const row of results) {
    if (!(CAMPAIGN_LEVEL_IDS as readonly string[]).includes(row.levelId)) {
      return ineligible('wrong_level_set', 0, 0, `Unsupported level "${row.levelId}".`)
    }
    if (byLevel.has(row.levelId)) {
      return ineligible('duplicate_level', 0, 0, `Duplicate verified result for ${row.levelId}.`)
    }
    if (
      !Number.isInteger(row.verifiedStars) ||
      row.verifiedStars < 0 ||
      row.verifiedStars > MAX_STARS_PER_LEVEL
    ) {
      return ineligible('invalid_stars', 0, 0, `Invalid stars for ${row.levelId}.`)
    }
    if (!row.verifiedRecordId || typeof row.verifiedRecordId !== 'string') {
      return ineligible('missing_level', 0, 0, `Missing verified record for ${row.levelId}.`)
    }
    if (!Number.isInteger(row.verifiedScore) || row.verifiedScore < 0) {
      return ineligible('invalid_stars', 0, 0, `Invalid score for ${row.levelId}.`)
    }
    byLevel.set(row.levelId, row)
    totalScore += row.verifiedScore
  }

  if (byLevel.size !== CAMPAIGN_LEVEL_IDS.length) {
    return ineligible(
      'incomplete_campaign',
      sumStars(byLevel),
      totalScore,
      `Requires verified results for all ${CAMPAIGN_LEVEL_IDS.length} rooftops in this run.`,
    )
  }

  for (const levelId of CAMPAIGN_LEVEL_IDS) {
    const row = byLevel.get(levelId)
    if (!row) {
      return ineligible('missing_level', sumStars(byLevel), totalScore, `Missing ${levelId}.`)
    }
    if (row.verifiedStars < 1) {
      return ineligible(
        'zero_star_level',
        sumStars(byLevel),
        totalScore,
        `Each rooftop must earn at least 1 star (${levelId}).`,
      )
    }
  }

  const totalStars = sumStars(byLevel)
  const tier = pickTierForStars(totalStars)
  if (!tier) {
    return ineligible(
      'below_minimum_stars',
      totalStars,
      totalScore,
      `Total stars ${totalStars} is below the A$50 OFF minimum (${MIN_REWARD_STARS}).`,
    )
  }

  return {
    eligible: true,
    tierId: tier.id,
    amountCents: tier.amountCents,
    currency: REWARD_CURRENCY,
    displayLabel: tier.displayLabel,
    totalStars,
    totalScore,
    reason: `Qualifying run total ${totalStars}/${MAX_CAMPAIGN_STARS} stars → ${tier.displayLabel}.`,
  }
}

function sumStars(byLevel: Map<string, VerifiedCampaignLevelResult>): number {
  let total = 0
  for (const row of byLevel.values()) total += row.verifiedStars
  return total
}

function ineligible(
  code: Extract<CampaignRewardDecision, { eligible: false }>['code'],
  totalStars: number,
  totalScore: number,
  reason: string,
): CampaignRewardDecision {
  return {
    eligible: false,
    tierId: null,
    amountCents: 0,
    currency: REWARD_CURRENCY,
    displayLabel: null,
    totalStars,
    totalScore,
    reason,
    code,
  }
}
