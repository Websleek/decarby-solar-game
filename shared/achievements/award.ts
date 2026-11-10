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

export type AwardSinkResult =
  | Readonly<{ ok: true; inserted: boolean; earnedAt: string }>
  | Readonly<{ ok: false; error: string }>

export type AwardSink = (input: {
  achievementId: VerifiedAchievementId
  sourceAttemptId: string | null
  sourceRecordId: string | null
  audit: Record<string, unknown>
}) => Promise<AwardSinkResult>

export type PlayerVerifiedSnapshot = Readonly<{
  classicRecords: readonly VerifiedClassicFact[]
  timeAttackRecords: readonly VerifiedTimeAttackFact[]
  leaderboardStandings: readonly LeaderboardStandingFact[]
}>

/**
 * Idempotently award every currently eligible achievement for a player.
 * Only returns rows that were confirmed persisted by the award sink.
 * Eligibility alone never appears as an unlock.
 */
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
    if (!result.ok) continue
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

/** Build unlock catalog entries only from persisted award rows. */
export function catalogUnlocksFromPersisted(
  earned: readonly { achievementId: string; earnedAt: string }[],
  catalogIds: readonly string[],
): ReadonlyMap<string, string> {
  const map = new Map<string, string>()
  for (const row of earned) {
    if (!catalogIds.includes(row.achievementId)) continue
    if (!row.earnedAt) continue
    map.set(row.achievementId, row.earnedAt)
  }
  return map
}
