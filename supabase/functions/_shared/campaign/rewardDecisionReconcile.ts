/**
 * Pure helpers for detecting stale/ineligible reward decisions that should be
 * recalculated from verified campaign level rows (event 3-rooftop rules).
 */

import {
  evaluateCampaignReward,
  type CampaignRewardDecision,
  type VerifiedCampaignLevelResult,
} from './rewardTiers.ts'

export type PersistedRewardDecisionRow = Readonly<{
  eligible: boolean
  tier_id: string | null
  amount_cents: number
  total_stars: number
  total_score: number
  voucher_issued?: boolean
  decision?: unknown
}>

export type VerifiedLevelRow = Readonly<{
  status: string
  level_id: string
  verified_stars: number | null
  verified_score: number | null
  verified_record_id: string | null
  level_version: number | null
}>

export function verifiedFactsFromLevelRows(
  rows: readonly VerifiedLevelRow[],
): VerifiedCampaignLevelResult[] {
  return rows
    .filter((row) => row.status === 'verified')
    .map((row) => ({
      levelId: row.level_id as VerifiedCampaignLevelResult['levelId'],
      verifiedStars: Number(row.verified_stars ?? 0),
      verifiedScore: Number(row.verified_score ?? 0),
      verifiedRecordId: String(row.verified_record_id ?? ''),
      levelVersion: Number(row.level_version ?? 1),
    }))
}

export function isCorrectableRewardDecision(
  existing: PersistedRewardDecisionRow | null | undefined,
  claimExists: boolean,
): boolean {
  if (claimExists) return false
  if (!existing) return true
  if (existing.voucher_issued === true) return false
  // Eligible matching decisions stay immutable.
  if (existing.eligible === true && Number(existing.amount_cents) > 0 && existing.tier_id) {
    return false
  }
  return true
}

/**
 * Whether a persisted decision disagrees with a freshly evaluated eligible result.
 * Used to repair stale incomplete/below-minimum/zero-star decisions.
 */
export function needsRewardDecisionReconcile(
  existing: PersistedRewardDecisionRow | null | undefined,
  fresh: CampaignRewardDecision,
  claimExists: boolean,
): boolean {
  if (!isCorrectableRewardDecision(existing, claimExists)) return false
  if (!fresh.eligible) return false
  if (!existing) return true
  if (existing.eligible !== true) return true
  if (Number(existing.amount_cents) !== fresh.amountCents) return true
  if (existing.tier_id !== fresh.tierId) return true
  if (Number(existing.total_stars) !== fresh.totalStars) return true
  return false
}

export function evaluateVerifiedLevelRows(
  rows: readonly VerifiedLevelRow[],
): CampaignRewardDecision {
  return evaluateCampaignReward(verifiedFactsFromLevelRows(rows))
}
