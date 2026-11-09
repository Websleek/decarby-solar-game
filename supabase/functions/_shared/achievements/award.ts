import {
  countInvalidPlaceActions,
  evaluateVerifiedAchievements,
  hasSuccessfulPlaceAction,
  type AchievementEvaluationInput,
  type LeaderboardStandingFact,
  type VerifiedClassicFact,
  type VerifiedTimeAttackFact,
} from './evaluate.ts'
import type { VerifiedAchievementId } from './registry.ts'

export type AwardRow = Readonly<{
  achievementId: VerifiedAchievementId
  inserted: boolean
  earnedAt: string
  reason?: string
}>

export type AwardSink = (input: {
  achievementId: VerifiedAchievementId
  sourceAttemptId: string | null
  sourceRecordId: string | null
  audit: Record<string, unknown>
}) => Promise<{ inserted: boolean; earnedAt: string }>

export type PlayerVerifiedSnapshot = Readonly<{
  classicRecords: readonly VerifiedClassicFact[]
  timeAttackRecords: readonly VerifiedTimeAttackFact[]
  leaderboardStandings: readonly LeaderboardStandingFact[]
}>

/** Idempotently award every currently eligible achievement for a player. */
export async function syncPlayerAchievements(options: {
  snapshot: PlayerVerifiedSnapshot
  sourceAttemptId?: string | null
  sourceRecordId?: string | null
  award: AwardSink
}): Promise<readonly AwardRow[]> {
  const evaluation = evaluateVerifiedAchievements({
    classicRecords: options.snapshot.classicRecords,
    timeAttackRecords: options.snapshot.timeAttackRecords,
    leaderboardStandings: options.snapshot.leaderboardStandings,
  } satisfies AchievementEvaluationInput)

  const awarded: AwardRow[] = []
  for (const achievementId of evaluation.eligible) {
    const result = await options.award({
      achievementId,
      sourceAttemptId: options.sourceAttemptId ?? null,
      sourceRecordId: options.sourceRecordId ?? null,
      audit: {
        reason: evaluation.reasons[achievementId] ?? null,
        evaluatedAt: new Date().toISOString(),
      },
    })
    awarded.push({
      achievementId,
      inserted: result.inserted,
      earnedAt: result.earnedAt,
      reason: evaluation.reasons[achievementId],
    })
  }
  return awarded
}

export function classicFactFromAttempt(input: {
  levelId: string
  gameMode: 'classic' | 'timeAttack'
  verifiedStars: number
  verifiedCoveragePercent: number
  actions: readonly { kind: string }[]
  /** When true, invalid placement telemetry is trustworthy for this attempt. */
  trackInvalidPlacements: boolean
}): VerifiedClassicFact | null {
  if (input.gameMode !== 'classic') return null
  return {
    levelId: input.levelId,
    verifiedStars: input.verifiedStars,
    verifiedInvalidPlacements: input.trackInvalidPlacements
      ? countInvalidPlaceActions(input.actions)
      : null,
    hasSuccessfulPlacement: hasSuccessfulPlaceAction(input.actions),
  }
}

export function newlyInsertedAwards(rows: readonly AwardRow[]): readonly VerifiedAchievementId[] {
  return rows.filter((row) => row.inserted).map((row) => row.achievementId)
}
