import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationPath = resolve(
  process.cwd(),
  'supabase/migrations/20260323000000_phase4_achievements.sql',
)

describe('phase 4 achievement security contract', () => {
  const sql = readFileSync(migrationPath, 'utf8')

  it('creates player_achievements with unique player/achievement constraint and RLS', () => {
    expect(sql).toContain('create table if not exists public.player_achievements')
    expect(sql).toContain('unique (player_id, achievement_id)')
    expect(sql).toContain('alter table public.player_achievements enable row level security')
    expect(sql).toContain('player_achievements_select_own')
    expect(sql).toContain(
      'revoke all on table public.player_achievements from public, anon, authenticated',
    )
    expect(sql).toContain('grant select on table public.player_achievements to authenticated')
  })

  it('keeps award writes service_role-only', () => {
    expect(sql).toContain('award_player_achievement')
    expect(sql).toContain(
      'grant execute on function public.award_player_achievement(uuid, text, uuid, uuid, jsonb)\n  to service_role',
    )
    expect(sql).not.toContain(
      'grant execute on function public.award_player_achievement(uuid, text, uuid, uuid, jsonb) to anon',
    )
  })

  it('adds verified star/invalid telemetry columns without fabricating historic values', () => {
    expect(sql).toContain('verified_invalid_placements')
    expect(sql).toContain('NULL means telemetry was not recorded')
  })
})

describe('phase 4 achievement retrieval fix contract', () => {
  const fixSql = readFileSync(
    resolve(process.cwd(), 'supabase/migrations/20260323120000_phase4_achievement_retrieval_fix.sql'),
    'utf8',
  )

  it('restores service_role SELECT after PUBLIC revoke and keeps award execute service_role-only', () => {
    expect(fixSql).toContain('grant select on table public.player_achievements to service_role')
    expect(fixSql).toContain(
      'grant execute on function public.award_player_achievement(uuid, text, uuid, uuid, jsonb)\n  to service_role',
    )
    expect(fixSql).not.toContain(
      'grant execute on function public.award_player_achievement(uuid, text, uuid, uuid, jsonb) to anon',
    )
    expect(fixSql).toContain('no persisted row; caller must not invent an unlock')
  })
})
