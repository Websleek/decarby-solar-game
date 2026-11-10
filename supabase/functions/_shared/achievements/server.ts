import {
  newlyInsertedAwards,
  syncPlayerAchievements,
  type AwardRow,
} from './award.ts'
import { CAMPAIGN_LEVEL_IDS } from './registry.ts'
import type { VerifiedAchievementId } from './registry.ts'
import type {
  LeaderboardStandingFact,
  VerifiedClassicFact,
  VerifiedTimeAttackFact,
} from './evaluate.ts'
import { countInvalidPlaceActions, hasSuccessfulPlaceAction } from './evaluate.ts'

type AdminClient = {
  from: (table: string) => any
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>
}

export type PersistedAchievementRow = Readonly<{
  achievement_id: string
  earned_at: string
  source_attempt_id: string | null
  source_record_id: string | null
}>

export async function loadPlayerAchievementSnapshot(
  admin: AdminClient,
  playerId: string,
  publicNickname: string | null,
): Promise<{
  classicRecords: VerifiedClassicFact[]
  timeAttackRecords: VerifiedTimeAttackFact[]
  leaderboardStandings: LeaderboardStandingFact[]
}> {
  const { data: records, error } = await admin
    .from('verified_game_records')
    .select(
      'level_id, game_mode, verified_stars, verified_invalid_placements, verified_score, level_version_id',
    )
    .eq('player_id', playerId)

  if (error) {
    console.error('load verified records for achievements failed', error)
  }

  const rows = Array.isArray(records) ? records : []
  const classicRecords: VerifiedClassicFact[] = []
  const timeAttackRecords: VerifiedTimeAttackFact[] = []

  for (const row of rows) {
    const typed = row as {
      level_id: string
      game_mode: string
      verified_stars: number | null
      verified_invalid_placements: number | null
    }
    if (typed.game_mode === 'classic') {
      classicRecords.push({
        levelId: typed.level_id,
        verifiedStars: typed.verified_stars,
        verifiedInvalidPlacements: typed.verified_invalid_placements,
        hasSuccessfulPlacement: true,
      })
    } else if (typed.game_mode === 'timeAttack') {
      timeAttackRecords.push({ levelId: typed.level_id })
    }
  }

  const leaderboardStandings: LeaderboardStandingFact[] = []
  if (publicNickname) {
    const { data: overall } = await admin.rpc('leaderboard_overall', {
      p_limit: 10,
      p_offset: 0,
    })
    const overallRows = Array.isArray(overall) ? overall : []
    for (const row of overallRows) {
      const typed = row as { rank?: number; public_nickname?: string }
      if (typed.public_nickname === publicNickname && typeof typed.rank === 'number') {
        leaderboardStandings.push({ board: 'overall', rank: typed.rank })
      }
    }

    for (const levelId of CAMPAIGN_LEVEL_IDS) {
      const { data: speed } = await admin.rpc('leaderboard_speed', {
        p_level_id: levelId,
        p_limit: 10,
        p_offset: 0,
      })
      const speedRows = Array.isArray(speed) ? speed : []
      for (const row of speedRows) {
        const typed = row as { rank?: number; public_nickname?: string }
        if (typed.public_nickname === publicNickname && typeof typed.rank === 'number') {
          leaderboardStandings.push({ board: 'speed', rank: typed.rank })
        }
      }
    }
  }

  return { classicRecords, timeAttackRecords, leaderboardStandings }
}

function parseAwardRpcRow(data: unknown): { inserted: boolean; earnedAt: string } | null {
  const row = Array.isArray(data) ? data[0] : data
  if (!row || typeof row !== 'object') return null
  const typed = row as { achievement_id?: unknown; earned_at?: unknown; inserted?: unknown }
  if (typeof typed.achievement_id !== 'string' || typeof typed.earned_at !== 'string') {
    return null
  }
  return {
    inserted: Boolean(typed.inserted),
    earnedAt: typed.earned_at,
  }
}

export type AwardFailure = Readonly<{
  achievementId: VerifiedAchievementId
  error: string
  code?: string
  message?: string
}>

export async function awardAchievementsForPlayer(
  admin: AdminClient,
  input: {
    playerId: string
    publicNickname: string | null
    sourceAttemptId?: string | null
    sourceRecordId?: string | null
  },
): Promise<{
  awards: AwardRow[]
  newlyEarned: VerifiedAchievementId[]
  failures: AwardFailure[]
}> {
  const snapshot = await loadPlayerAchievementSnapshot(
    admin,
    input.playerId,
    input.publicNickname,
  )
  const failures: AwardFailure[] = []

  const awards = await syncPlayerAchievements({
    snapshot,
    sourceAttemptId: input.sourceAttemptId ?? null,
    sourceRecordId: input.sourceRecordId ?? null,
    award: async ({ achievementId, sourceAttemptId, sourceRecordId, audit }) => {
      const { data, error } = await admin.rpc('award_player_achievement', {
        p_player_id: input.playerId,
        p_achievement_id: achievementId,
        p_source_attempt_id: sourceAttemptId,
        p_source_record_id: sourceRecordId,
        p_audit: audit,
      })
      if (error) {
        const errObj = error as { code?: string; message?: string }
        console.error('award_player_achievement failed', {
          achievementId,
          playerId: input.playerId,
          code: errObj.code,
          message: errObj.message,
          error,
        })
        failures.push({
          achievementId,
          error: 'rpc_error',
          code: errObj.code,
          message: errObj.message,
        })
        return { ok: false as const, error: 'rpc_error' }
      }
      const parsed = parseAwardRpcRow(data)
      if (!parsed) {
        console.error('award_player_achievement returned no persisted row', {
          achievementId,
          playerId: input.playerId,
          data,
        })
        failures.push({
          achievementId,
          error: 'not_persisted',
          message: 'RPC returned no persisted award row',
        })
        return { ok: false as const, error: 'not_persisted' }
      }
      return { ok: true as const, inserted: parsed.inserted, earnedAt: parsed.earnedAt }
    },
  })

  if (failures.length > 0) {
    console.error('achievement award failures', {
      playerId: input.playerId,
      failureCount: failures.length,
      failures,
    })
  }

  return { awards, newlyEarned: newlyInsertedAwards(awards), failures }
}

/** Load persisted awards for the authenticated caller (same auth.uid() as awarding profile). */
export async function listPersistedAchievementsForUser(
  userClient: AdminClient,
): Promise<{ rows: PersistedAchievementRow[]; error: string | null }> {
  const { data, error } = await userClient.rpc('list_my_achievements')
  if (error) {
    console.error('list_my_achievements failed', error)
    return { rows: [], error: 'list_failed' }
  }
  if (!Array.isArray(data)) return { rows: [], error: null }
  return {
    rows: data.map((row) => {
      const typed = row as PersistedAchievementRow
      return {
        achievement_id: String(typed.achievement_id),
        earned_at: String(typed.earned_at),
        source_attempt_id: typed.source_attempt_id ?? null,
        source_record_id: typed.source_record_id ?? null,
      }
    }),
    error: null,
  }
}

export function invalidPlacementCountForSubmit(
  actions: readonly { kind: string }[],
  trackInvalidPlacements: boolean,
): number | null {
  if (!trackInvalidPlacements) return null
  return countInvalidPlaceActions(actions)
}

export function placementSuccessForSubmit(actions: readonly { kind: string }[]): boolean {
  return hasSuccessfulPlaceAction(actions)
}
