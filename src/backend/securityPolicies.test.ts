import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationPath = resolve(
  process.cwd(),
  'supabase/migrations/20260320000000_phase3a_foundation.sql',
)

describe('database security policies (migration contract)', () => {
  const sql = readFileSync(migrationPath, 'utf8')

  it('enables RLS on competitive tables', () => {
    expect(sql).toContain('alter table public.player_profiles enable row level security')
    expect(sql).toContain('alter table public.game_level_versions enable row level security')
    expect(sql).toContain('alter table public.game_score_submissions enable row level security')
    expect(sql).toContain('alter table public.verified_game_records enable row level security')
  })

  it('prevents clients from writing verified records', () => {
    expect(sql).toContain(
      'revoke insert, update, delete on public.verified_game_records from anon, authenticated',
    )
    expect(sql).not.toMatch(
      /create policy .*verified.*\n[\s\S]*for insert/i,
    )
  })

  it('forces claimed submissions to stay pending for clients', () => {
    expect(sql).toContain('enforce_score_submission_pending')
    expect(sql).toContain("new.verification_status := 'pending'")
    expect(sql).toContain('Clients cannot update score submissions')
  })

  it('exposes only public nickname fields via a view', () => {
    expect(sql).toContain('create view public.public_player_profiles')
    const viewMatch = sql.match(
      /create view public\.public_player_profiles[\s\S]*?where moderation_status = 'active';/i,
    )
    expect(viewMatch?.[0]).toBeTruthy()
    expect(viewMatch?.[0]).toContain('public_nickname')
    expect(viewMatch?.[0]).not.toContain('user_id')
  })

  it('requires unique nicknames and owner-only profile edits', () => {
    expect(sql).toContain('player_profiles_nickname_normalized_uidx')
    expect(sql).toContain('profiles_update_own_nickname')
    expect(sql).toContain('moderation_status can only be changed by moderators')
  })
})
