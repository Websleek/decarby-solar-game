/** Pure ranking helpers mirroring Phase 3C SQL board rules (for unit tests). */

export type ClassicVerifiedRow = Readonly<{
  playerId: string
  publicNickname: string
  levelId: string
  verifiedScore: number
  verifiedDurationMs: number
  verifiedAt: string
  version: number
  activeVersion: number
  moderationStatus: 'active' | 'flagged' | 'restricted'
}>

export type TimeAttackVerifiedRow = ClassicVerifiedRow

export type RankedScoreEntry = Readonly<{
  rank: number
  publicNickname: string
  totalScore: number
  levelsCompleted: number
  totalDurationMs?: number
}>

export type RankedRooftopEntry = Readonly<{
  rank: number
  publicNickname: string
  verifiedScore: number
  verifiedDurationMs: number
}>

export type RankedSpeedEntry = Readonly<{
  rank: number
  publicNickname: string
  verifiedDurationMs: number
  verifiedScore: number
}>

export const LEADERBOARD_LEVEL_IDS = [
  'sunny-house',
  'chimney-challenge',
  'tricky-rooftop',
  'solar-puzzle-master',
  'decarby-solar-champion',
] as const

function isEligibleClassic(row: ClassicVerifiedRow): boolean {
  return row.moderationStatus === 'active' && row.version === row.activeVersion
}

/**
 * Overall Champions: require verified Classic on every required rooftop.
 * Deduplicates replayed levels by keeping the highest score per player/level.
 */
export function rankOverallChampions(
  rows: readonly ClassicVerifiedRow[],
  requiredLevels: readonly string[] = LEADERBOARD_LEVEL_IDS,
  limit = 20,
): RankedScoreEntry[] {
  const eligible = rows.filter(isEligibleClassic)
  const byPlayer = new Map<
    string,
    { nickname: string; scores: Map<string, ClassicVerifiedRow>; duration: number }
  >()

  for (const row of eligible) {
    const existing = byPlayer.get(row.playerId)
    const scores = new Map(existing?.scores ?? [])
    let duration = existing?.duration ?? 0
    const prev = scores.get(row.levelId)
    if (!prev || row.verifiedScore > prev.verifiedScore) {
      if (prev) duration -= prev.verifiedDurationMs
      scores.set(row.levelId, row)
      duration += row.verifiedDurationMs
    }
    byPlayer.set(row.playerId, {
      nickname: row.publicNickname,
      scores,
      duration,
    })
  }

  const required = [...requiredLevels]
  return [...byPlayer.values()]
    .filter((player) => required.every((id) => player.scores.has(id)))
    .map((player) => ({
      publicNickname: player.nickname,
      totalScore: [...player.scores.values()].reduce((sum, row) => sum + row.verifiedScore, 0),
      levelsCompleted: player.scores.size,
      totalDurationMs: player.duration,
    }))
    .sort(
      (a, b) =>
        b.totalScore - a.totalScore ||
        (a.totalDurationMs ?? 0) - (b.totalDurationMs ?? 0) ||
        a.publicNickname.localeCompare(b.publicNickname),
    )
    .slice(0, Math.min(Math.max(limit, 1), 50))
    .map((entry, index) => ({ rank: index + 1, ...entry }))
}

/** Weekly Leaders: sum eligible Classic scores verified inside [weekStart, weekEnd). */
export function rankWeeklyLeaders(
  rows: readonly ClassicVerifiedRow[],
  weekStartIso: string,
  weekEndIso: string,
  limit = 20,
): RankedScoreEntry[] {
  const start = Date.parse(weekStartIso)
  const end = Date.parse(weekEndIso)
  const eligible = rows.filter((row) => {
    if (!isEligibleClassic(row)) return false
    const at = Date.parse(row.verifiedAt)
    return at >= start && at < end
  })

  const byPlayer = new Map<string, { nickname: string; score: number; levels: number }>()
  for (const row of eligible) {
    const prev = byPlayer.get(row.playerId)
    if (!prev) {
      byPlayer.set(row.playerId, {
        nickname: row.publicNickname,
        score: row.verifiedScore,
        levels: 1,
      })
    } else {
      byPlayer.set(row.playerId, {
        nickname: row.publicNickname,
        score: prev.score + row.verifiedScore,
        levels: prev.levels + 1,
      })
    }
  }

  return [...byPlayer.values()]
    .map((player) => ({
      publicNickname: player.nickname,
      totalScore: player.score,
      levelsCompleted: player.levels,
    }))
    .sort(
      (a, b) =>
        b.totalScore - a.totalScore ||
        b.levelsCompleted - a.levelsCompleted ||
        a.publicNickname.localeCompare(b.publicNickname),
    )
    .slice(0, Math.min(Math.max(limit, 1), 50))
    .map((entry, index) => ({ rank: index + 1, ...entry }))
}

export function rankRooftop(
  rows: readonly ClassicVerifiedRow[],
  levelId: string,
  limit = 20,
): RankedRooftopEntry[] {
  return rows
    .filter((row) => isEligibleClassic(row) && row.levelId === levelId)
    .sort(
      (a, b) =>
        b.verifiedScore - a.verifiedScore ||
        a.verifiedDurationMs - b.verifiedDurationMs ||
        Date.parse(a.verifiedAt) - Date.parse(b.verifiedAt) ||
        a.publicNickname.localeCompare(b.publicNickname),
    )
    .slice(0, Math.min(Math.max(limit, 1), 50))
    .map((row, index) => ({
      rank: index + 1,
      publicNickname: row.publicNickname,
      verifiedScore: row.verifiedScore,
      verifiedDurationMs: row.verifiedDurationMs,
    }))
}

/** Speed Champions: shortest server-observed duration on active Time Attack records. */
export function rankSpeedChampions(
  rows: readonly TimeAttackVerifiedRow[],
  levelId: string,
  limit = 20,
): RankedSpeedEntry[] {
  return rows
    .filter(
      (row) =>
        row.moderationStatus === 'active' &&
        row.version === row.activeVersion &&
        row.levelId === levelId,
    )
    .sort(
      (a, b) =>
        a.verifiedDurationMs - b.verifiedDurationMs ||
        b.verifiedScore - a.verifiedScore ||
        Date.parse(a.verifiedAt) - Date.parse(b.verifiedAt) ||
        a.publicNickname.localeCompare(b.publicNickname),
    )
    .slice(0, Math.min(Math.max(limit, 1), 50))
    .map((row, index) => ({
      rank: index + 1,
      publicNickname: row.publicNickname,
      verifiedDurationMs: row.verifiedDurationMs,
      verifiedScore: row.verifiedScore,
    }))
}

export function findViewerRank(
  entries: readonly { rank: number; publicNickname: string }[],
  myNickname: string | null | undefined,
): number | null {
  if (!myNickname) return null
  const hit = entries.find((entry) => entry.publicNickname === myNickname)
  return hit?.rank ?? null
}

export function paginateRanks<T extends { rank: number }>(
  entries: readonly T[],
  limit: number,
  offset: number,
): T[] {
  const safeOffset = Math.max(offset, 0)
  const safeLimit = Math.min(Math.max(limit, 1), 50)
  return entries.filter((entry) => entry.rank > safeOffset).slice(0, safeLimit)
}
