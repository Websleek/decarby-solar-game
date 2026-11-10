import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { syncPlayerAchievements } from '../../../shared/achievements/award'
import { CAMPAIGN_LEVEL_IDS } from '../../../shared/achievements/registry'

const ambiguityFixPath = resolve(
  process.cwd(),
  'supabase/migrations/20260323140000_phase4_award_rpc_ambiguity_fix.sql',
)
const foundationPath = resolve(
  process.cwd(),
  'supabase/migrations/20260323000000_phase4_achievements.sql',
)
const retrievalFixPath = resolve(
  process.cwd(),
  'supabase/migrations/20260323120000_phase4_achievement_retrieval_fix.sql',
)

function extractFunctionBody(sql: string): string {
  const match = sql.match(
    /create or replace function public\.award_player_achievement[\s\S]*?\$\$([\s\S]*?)\$\$;/i,
  )
  expect(match?.[1]).toBeTruthy()
  return match![1]!
}

describe('award_player_achievement SQL ambiguity regression (42702)', () => {
  const fixSql = readFileSync(ambiguityFixPath, 'utf8')
  const foundationSql = readFileSync(foundationPath, 'utf8')
  const retrievalSql = readFileSync(retrievalFixPath, 'utf8')
  const fixBody = extractFunctionBody(fixSql)

  it('documents the exact ambiguous ON CONFLICT statement that caused 42702', () => {
    // Historical bodies (for diagnosis): unqualified conflict target collides with
    // RETURNS TABLE (achievement_id ...).
    expect(foundationSql).toContain('on conflict (player_id, achievement_id) do nothing')
    expect(retrievalSql).toContain('on conflict (player_id, achievement_id) do nothing')
    expect(fixSql).toContain('ON CONFLICT (player_id, achievement_id) DO NOTHING')
    expect(fixSql).toContain('42702')
  })

  it('replaces ambiguous conflict target with the named unique constraint', () => {
    expect(fixBody.toLowerCase()).toContain(
      'on conflict on constraint player_achievements_player_achievement_uidx',
    )
    expect(fixBody.toLowerCase()).not.toContain('on conflict (player_id, achievement_id)')
  })

  it('keeps SECURITY DEFINER, fixed search_path, and service_role-only execute', () => {
    expect(fixSql).toContain('security definer')
    expect(fixSql).toContain('set search_path = public')
    expect(fixSql).toContain(
      'revoke all on function public.award_player_achievement(uuid, text, uuid, uuid, jsonb)\n  from public, anon, authenticated',
    )
    expect(fixSql).toContain(
      'grant execute on function public.award_player_achievement(uuid, text, uuid, uuid, jsonb)\n  to service_role',
    )
    expect(fixSql).not.toMatch(
      /grant execute on function public\.award_player_achievement\([^)]+\)\s+to anon/i,
    )
    expect(fixSql).not.toMatch(
      /grant execute on function public\.award_player_achievement\([^)]+\)\s+to authenticated/i,
    )
  })

  it('rejects invalid achievement IDs in SQL before insert', () => {
    expect(fixBody).toContain('raise exception \'invalid_achievement_id\'')
    expect(fixBody).toContain('char_length(p_achievement_id) < 3')
    expect(fixBody).toContain('char_length(p_achievement_id) > 64')
  })

  it('qualifies table columns and avoids assigning through shadowed output names mid-query', () => {
    expect(fixBody).toContain('returning pa.achievement_id, pa.earned_at')
    expect(fixBody).toContain('select pa.achievement_id, pa.earned_at')
    expect(fixBody).toContain('and pa.achievement_id = p_achievement_id')
    // No bare output-variable assignment pattern from the previous fix.
    expect(fixBody).not.toMatch(/^\s*achievement_id\s*:=/m)
    expect(fixBody).not.toMatch(/^\s*earned_at\s*:=/m)
  })

  it('preserves player+achievement uniqueness via the named constraint from foundation', () => {
    expect(foundationSql).toContain('constraint player_achievements_player_achievement_uidx')
    expect(foundationSql).toContain('unique (player_id, achievement_id)')
  })
})

describe('award persistence semantics (client-side regression doubles)', () => {
  it('first award inserts; duplicate returns existing without a second insert', async () => {
    const store = new Map<string, { playerId: string; achievementId: string; earnedAt: string }>()

    const awardOnce = async (playerId: string) =>
      syncPlayerAchievements({
        snapshot: {
          classicRecords: [
            {
              levelId: 'sunny-house',
              verifiedStars: 2,
              verifiedInvalidPlacements: 0,
              hasSuccessfulPlacement: true,
            },
          ],
          timeAttackRecords: [],
          leaderboardStandings: [],
        },
        award: async ({ achievementId }) => {
          const key = `${playerId}:${achievementId}`
          const existing = store.get(key)
          if (existing) {
            return { ok: true, inserted: false, earnedAt: existing.earnedAt }
          }
          const earnedAt = '2026-11-10T01:00:00.000Z'
          store.set(key, { playerId, achievementId, earnedAt })
          return { ok: true, inserted: true, earnedAt }
        },
      })

    const first = await awardOnce('player-a')
    expect(first.some((row) => row.achievementId === 'first_spark' && row.inserted)).toBe(true)
    expect(first.some((row) => row.achievementId === 'solar_starter' && row.inserted)).toBe(true)
    expect(store.size).toBe(first.length)

    const second = await awardOnce('player-a')
    expect(second.every((row) => row.inserted === false)).toBe(true)
    expect(store.size).toBe(first.length)
  })

  it('keeps awards independent per player', async () => {
    const store = new Map<string, string>()
    const run = (playerId: string) =>
      syncPlayerAchievements({
        snapshot: {
          classicRecords: [
            {
              levelId: 'sunny-house',
              verifiedStars: 1,
              verifiedInvalidPlacements: null,
              hasSuccessfulPlacement: true,
            },
          ],
          timeAttackRecords: [],
          leaderboardStandings: [],
        },
        award: async ({ achievementId }) => {
          const key = `${playerId}:${achievementId}`
          if (store.has(key)) {
            return { ok: true, inserted: false, earnedAt: store.get(key)! }
          }
          const earnedAt = `2026-11-10T02:00:00.000Z:${playerId}`
          store.set(key, earnedAt)
          return { ok: true, inserted: true, earnedAt }
        },
      })

    const a = await run('player-a')
    const b = await run('player-b')
    expect(a.every((row) => row.inserted)).toBe(true)
    expect(b.every((row) => row.inserted)).toBe(true)
    expect(store.has('player-a:solar_starter')).toBe(true)
    expect(store.has('player-b:solar_starter')).toBe(true)
    expect(store.get('player-a:solar_starter')).not.toBe(store.get('player-b:solar_starter'))
  })

  it('does not fabricate unlocks when the award sink fails (e.g. former 42702)', async () => {
    const awards = await syncPlayerAchievements({
      snapshot: {
        classicRecords: CAMPAIGN_LEVEL_IDS.map((levelId) => ({
          levelId,
          verifiedStars: 3,
          verifiedInvalidPlacements: 0,
          hasSuccessfulPlacement: true,
        })),
        timeAttackRecords: [{ levelId: 'sunny-house' }],
        leaderboardStandings: [{ board: 'overall', rank: 1 }],
      },
      award: async () => ({
        ok: false,
        error: 'rpc_error',
      }),
    })
    expect(awards).toEqual([])
  })
})
