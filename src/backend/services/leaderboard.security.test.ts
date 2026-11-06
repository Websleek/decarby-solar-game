import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BackendError } from '../errors'
import { resetSupabaseClientForTests } from '../supabaseClient'
import { competitiveLeaderboardService } from './leaderboard'

const foundationPath = resolve(
  process.cwd(),
  'supabase/migrations/20260322000000_phase3c_leaderboards.sql',
)
const hardeningPath = resolve(
  process.cwd(),
  'supabase/migrations/20260322120000_phase3c_leaderboard_rpc_hardening.sql',
)

describe('phase 3C leaderboard security contract', () => {
  const sql = readFileSync(foundationPath, 'utf8')
  const hardening = readFileSync(hardeningPath, 'utf8')

  it('uses security definer read models and never returns auth ids', () => {
    expect(sql).toContain('security definer')
    expect(sql).toContain('set search_path = public')
    expect(sql).toContain('leaderboard_overall')
    expect(sql).toContain('leaderboard_weekly')
    expect(sql).toContain('leaderboard_rooftop')
    expect(sql).toContain('leaderboard_speed')
    expect(sql).toContain("p.moderation_status = 'active'")
    expect(sql).toContain('lv.active = true')
    expect(sql).toContain("where v.game_mode = 'classic'")
    expect(sql).toContain("where v.game_mode = 'timeAttack'")
    for (const name of [
      'leaderboard_overall',
      'leaderboard_weekly',
      'leaderboard_rooftop',
      'leaderboard_speed',
    ]) {
      const match = sql.match(
        new RegExp(
          `create or replace function public\\.${name}[\\s\\S]*?returns table \\(([\\s\\S]*?)\\)\\s*language`,
          'i',
        ),
      )
      expect(match?.[1]).toBeTruthy()
      expect(match?.[1]).toContain('public_nickname')
      expect(match?.[1]).not.toContain('user_id')
      expect(match?.[1]).not.toContain('player_id')
    }
    expect(sql).toContain('revoke all on function public._leaderboard_eligible_classic()')
  })

  it('documents active-version leaderboard policy and keeps historical rows stored', () => {
    expect(sql).toContain('Version policy:')
    expect(sql).toContain('Historical verified rows for inactive versions remain stored')
  })

  it('caps pagination limits in SQL', () => {
    expect(sql).toContain('limit least(greatest(coalesce(p_limit, 20), 1), 50)')
  })

  it('hardens board RPCs to service_role so Edge rate limits cannot be bypassed', () => {
    expect(hardening).toContain(
      'revoke all on function public.leaderboard_overall(integer, integer) from public, anon, authenticated',
    )
    expect(hardening).toContain(
      'grant execute on function public.leaderboard_overall(integer, integer) to service_role',
    )
    expect(hardening).toContain(
      'grant execute on function public.leaderboard_my_nickname() to authenticated, service_role',
    )
    expect(hardening).not.toContain(
      'grant execute on function public.leaderboard_overall(integer, integer) to anon',
    )
  })
})

describe('leaderboard client offline / unauthorized paths', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    resetSupabaseClientForTests()
  })

  it('blocks offline access without inventing rankings', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '')
    resetSupabaseClientForTests()

    await expect(competitiveLeaderboardService.getOverall()).rejects.toMatchObject({
      code: 'not_configured',
    })
    await expect(
      competitiveLeaderboardService.getTop({ levelId: 'sunny-house', gameMode: 'classic' }),
    ).rejects.toBeInstanceOf(BackendError)
  })

  it('rejects unknown rooftops and non-classic getTop shortcuts before network calls', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-anon-key')
    resetSupabaseClientForTests()

    await expect(competitiveLeaderboardService.getRooftop('not-a-roof')).rejects.toMatchObject({
      code: 'validation',
    })
    await expect(
      competitiveLeaderboardService.getTop({ levelId: 'sunny-house', gameMode: 'timeAttack' }),
    ).rejects.toMatchObject({ code: 'unsupported' })
  })
})
