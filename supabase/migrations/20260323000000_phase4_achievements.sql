-- Phase 4A — verified achievements persistence + star telemetry on records.
-- Clients cannot award achievements. Service-role Edge Functions upsert awards.
-- Document before apply. Do not auto-deploy from the agent.

begin;

-- ---------------------------------------------------------------------------
-- Enrich verified records with stars / coverage / invalid-placement telemetry.
-- verified_invalid_placements NULL = unknown (pre-telemetry historic rows).
-- ---------------------------------------------------------------------------
alter table public.verified_game_records
  add column if not exists verified_stars smallint
    check (verified_stars is null or verified_stars between 0 and 3),
  add column if not exists verified_coverage_percent integer
    check (
      verified_coverage_percent is null
      or (verified_coverage_percent >= 0 and verified_coverage_percent <= 100)
    ),
  add column if not exists verified_invalid_placements integer
    check (
      verified_invalid_placements is null
      or verified_invalid_placements >= 0
    );

comment on column public.verified_game_records.verified_invalid_placements is
  'Count of invalid_place actions in the verifying attempt. NULL means telemetry was not recorded (historic).';

-- ---------------------------------------------------------------------------
-- player_achievements
-- ---------------------------------------------------------------------------
create table if not exists public.player_achievements (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.player_profiles (id) on delete cascade,
  achievement_id text not null,
  earned_at timestamptz not null default now(),
  source_attempt_id uuid references public.game_attempts (id) on delete set null,
  source_record_id uuid references public.verified_game_records (id) on delete set null,
  audit jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint player_achievements_achievement_id_check
    check (char_length(achievement_id) between 3 and 64),
  constraint player_achievements_player_achievement_uidx
    unique (player_id, achievement_id)
);

create index if not exists player_achievements_player_earned_idx
  on public.player_achievements (player_id, earned_at desc);

alter table public.player_achievements enable row level security;

create policy "player_achievements_select_own"
  on public.player_achievements
  for select
  to authenticated
  using (
    player_id in (
      select id from public.player_profiles where user_id = auth.uid()
    )
  );

revoke all on table public.player_achievements from public, anon, authenticated;
grant select on table public.player_achievements to authenticated;
-- No insert/update/delete for anon/authenticated — service role only.

-- ---------------------------------------------------------------------------
-- Idempotent award helper (service_role only)
-- ---------------------------------------------------------------------------
create or replace function public.award_player_achievement(
  p_player_id uuid,
  p_achievement_id text,
  p_source_attempt_id uuid default null,
  p_source_record_id uuid default null,
  p_audit jsonb default '{}'::jsonb
)
returns table (
  achievement_id text,
  earned_at timestamptz,
  inserted boolean
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  insert into public.player_achievements as pa (
    player_id,
    achievement_id,
    source_attempt_id,
    source_record_id,
    audit
  )
  values (
    p_player_id,
    p_achievement_id,
    p_source_attempt_id,
    p_source_record_id,
    coalesce(p_audit, '{}'::jsonb)
  )
  on conflict (player_id, achievement_id) do nothing
  returning pa.achievement_id, pa.earned_at, true;

  if not found then
    return query
    select pa.achievement_id, pa.earned_at, false
    from public.player_achievements pa
    where pa.player_id = p_player_id
      and pa.achievement_id = p_achievement_id;
  end if;
end;
$$;

revoke all on function public.award_player_achievement(uuid, text, uuid, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.award_player_achievement(uuid, text, uuid, uuid, jsonb)
  to service_role;

-- Read own awards (authenticated). Never exposes other players.
create or replace function public.list_my_achievements()
returns table (
  achievement_id text,
  earned_at timestamptz,
  source_attempt_id uuid,
  source_record_id uuid
)
language sql
stable
security definer
set search_path = public
as $$
  select
    pa.achievement_id,
    pa.earned_at,
    pa.source_attempt_id,
    pa.source_record_id
  from public.player_achievements pa
  join public.player_profiles p on p.id = pa.player_id
  where p.user_id = auth.uid()
    and p.moderation_status = 'active'
  order by pa.earned_at asc;
$$;

revoke all on function public.list_my_achievements() from public, anon;
grant execute on function public.list_my_achievements() to authenticated, service_role;

commit;
