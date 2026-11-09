import {
  CAMPAIGN_LEVEL_IDS,
  type VerifiedAchievementId,
} from './registry.ts'

/** Minimal verified classic snapshot used for achievement evaluation. */
export type VerifiedClassicFact = Readonly<{
  levelId: string
  verifiedStars: number | null
  /** Null means invalid-placement telemetry was not recorded for this run. */
  verifiedInvalidPlacements: number | null
  hasSuccessfulPlacement: boolean
}>

export type VerifiedTimeAttackFact = Readonly<{
  levelId: string
}>

export type LeaderboardStandingFact = Readonly<{
  board: 'overall' | 'speed'
  rank: number
}>

export type AchievementEvaluationInput = Readonly<{
  classicRecords: readonly VerifiedClassicFact[]
  timeAttackRecords: readonly VerifiedTimeAttackFact[]
  leaderboardStandings: readonly LeaderboardStandingFact[]
  /** Already earned IDs (evaluation still returns them as eligible for idempotent upsert). */
  alreadyEarned?: readonly string[]
}>

export type AchievementEvaluationResult = Readonly<{
  eligible: readonly VerifiedAchievementId[]
  reasons: Readonly<Partial<Record<VerifiedAchievementId, string>>>
}>

function bestStarsByLevel(
  records: readonly VerifiedClassicFact[],
): Map<string, number> {
  const map = new Map<string, number>()
  for (const row of records) {
    if (row.verifiedStars === null) continue
    const prev = map.get(row.levelId) ?? 0
    if (row.verifiedStars > prev) map.set(row.levelId, row.verifiedStars)
  }
  return map
}

/** Local guest preview facts — never treated as verified awards. */
export type LocalPreviewProgress = Readonly<{
  completedLevels: readonly string[]
  bestStars: Readonly<Record<string, 0 | 1 | 2 | 3>>
  timeAttackBestMs: Readonly<Record<string, number>>
  perfectRoofLevels: readonly string[]
  /** True after at least one successful local panel placement this install. */
  hasLocalPlacement?: boolean
}>

export function evaluateVerifiedAchievements(
  input: AchievementEvaluationInput,
): AchievementEvaluationResult {
  const eligible = new Set<VerifiedAchievementId>()
  const reasons: Partial<Record<VerifiedAchievementId, string>> = {}

  const classic = input.classicRecords
  const stars = bestStarsByLevel(classic)
  const completedClassic = new Set(classic.map((row) => row.levelId))

  if (classic.some((row) => row.hasSuccessfulPlacement)) {
    eligible.add('first_spark')
    reasons.first_spark = 'Verified attempt included a successful panel placement.'
  }

  if (completedClassic.has('sunny-house')) {
    eligible.add('solar_starter')
    reasons.solar_starter = 'Verified Classic completion of sunny-house.'
  }

  const perfectFit = classic.some(
    (row) =>
      row.verifiedInvalidPlacements !== null &&
      row.verifiedInvalidPlacements === 0 &&
      completedClassic.has(row.levelId),
  )
  if (perfectFit) {
    eligible.add('perfect_fit')
    reasons.perfect_fit = 'Verified Classic completion with zero recorded invalid placements.'
  }

  if (input.timeAttackRecords.length > 0) {
    eligible.add('speed_builder')
    reasons.speed_builder = 'At least one verified Time Attack record exists.'
  }

  let starSum = 0
  for (const levelId of CAMPAIGN_LEVEL_IDS) {
    starSum += stars.get(levelId) ?? 0
  }
  if (starSum >= 10) {
    eligible.add('star_collector')
    reasons.star_collector = `Best verified stars across campaign levels sum to ${starSum}.`
  }

  const allFive = CAMPAIGN_LEVEL_IDS.every((id) => completedClassic.has(id))
  if (allFive) {
    eligible.add('solar_champion')
    reasons.solar_champion = 'Verified Classic completions on all five campaign levels.'
  }

  const threeStarAll = CAMPAIGN_LEVEL_IDS.every((id) => (stars.get(id) ?? 0) >= 3)
  if (threeStarAll) {
    eligible.add('three_star_master')
    reasons.three_star_master = 'Best verified Classic stars are 3 on every campaign level.'
  }

  const legend = input.leaderboardStandings.some((row) => row.rank >= 1 && row.rank <= 10)
  if (legend) {
    eligible.add('solar_legend')
    reasons.solar_legend = 'Top-ten standing on a qualifying leaderboard at evaluation time.'
  }

  return {
    eligible: [...eligible],
    reasons,
  }
}

/**
 * Guest/local preview unlocks for Reward Centre. These are NOT persisted as
 * verified online achievements and must be labelled as device progress.
 */
export function evaluateLocalPreviewAchievements(
  progress: LocalPreviewProgress,
): readonly VerifiedAchievementId[] {
  const unlocked: VerifiedAchievementId[] = []
  if (progress.hasLocalPlacement) unlocked.push('first_spark')
  if (progress.completedLevels.includes('sunny-house')) unlocked.push('solar_starter')
  if (progress.perfectRoofLevels.length > 0) unlocked.push('perfect_fit')
  if (Object.keys(progress.timeAttackBestMs).length > 0) unlocked.push('speed_builder')

  let starSum = 0
  for (const levelId of CAMPAIGN_LEVEL_IDS) {
    starSum += progress.bestStars[levelId] ?? 0
  }
  if (starSum >= 10) unlocked.push('star_collector')

  if (CAMPAIGN_LEVEL_IDS.every((id) => progress.completedLevels.includes(id))) {
    unlocked.push('solar_champion')
  }
  if (CAMPAIGN_LEVEL_IDS.every((id) => (progress.bestStars[id] ?? 0) >= 3)) {
    unlocked.push('three_star_master')
  }
  // solar_legend has no trustworthy local preview.
  return unlocked
}

export function countInvalidPlaceActions(
  actions: readonly { kind: string }[],
): number {
  return actions.reduce((sum, action) => (action.kind === 'invalid_place' ? sum + 1 : sum), 0)
}

export function hasSuccessfulPlaceAction(
  actions: readonly { kind: string }[],
): boolean {
  return actions.some((action) => action.kind === 'place')
}
