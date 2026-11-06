-- Phase 3A follow-up: tighten table privileges left by default grants.
-- RLS already blocks most unauthorized DML, but TRUNCATE bypasses RLS in Postgres.
-- Keep least-privilege grants aligned with Phase 3A policies.

begin;

-- Level versions: public read of active rows only (RLS); no client writes/truncates.
revoke all on table public.game_level_versions from anon, authenticated;
grant select on table public.game_level_versions to anon, authenticated;

-- Verified records: public read only; never client-writable.
revoke all on table public.verified_game_records from anon, authenticated;
grant select on table public.verified_game_records to anon, authenticated;

-- Score submissions: authenticated insert/select only (pending enforced by trigger + RLS).
revoke all on table public.game_score_submissions from anon, authenticated;
grant select, insert on table public.game_score_submissions to authenticated;

-- Profiles: authenticated owner CRUD path only (RLS + triggers constrain columns).
revoke all on table public.player_profiles from anon, authenticated;
grant select, insert, update on table public.player_profiles to authenticated;

-- Public nickname view: select only; never writable.
revoke all on table public.public_player_profiles from anon, authenticated;
grant select on table public.public_player_profiles to anon, authenticated;

commit;
