-- Phase 3B — server-issued game attempts for verified competitive submissions.
-- Clients cannot insert/update/delete attempts; only service-role Edge Functions can.
-- Document before apply. Do not auto-deploy from the agent.

begin;

create type public.attempt_status as enum (
  'open',
  'submitted',
  'verified',
  'rejected',
  'expired',
  'abandoned'
);

create table public.game_attempts (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.player_profiles (id) on delete cascade,
  level_id text not null,
  level_version_id uuid not null references public.game_level_versions (id),
  game_mode public.game_mode not null,
  status public.attempt_status not null default 'open',
  configuration_hash text not null,
  inventory_piece_ids jsonb not null,
  server_started_at timestamptz not null default now(),
  expires_at timestamptz not null,
  submitted_at timestamptz,
  finalized_at timestamptz,
  client_nonce text,
  claimed_score integer check (claimed_score is null or claimed_score >= 0),
  claimed_duration_ms integer check (claimed_duration_ms is null or claimed_duration_ms >= 0),
  claimed_coverage_percent integer check (
    claimed_coverage_percent is null
    or (claimed_coverage_percent >= 0 and claimed_coverage_percent <= 100)
  ),
  actions jsonb,
  action_count integer not null default 0 check (action_count >= 0),
  verified_score integer check (verified_score is null or verified_score >= 0),
  verified_stars smallint check (verified_stars is null or verified_stars between 0 and 3),
  verified_coverage_percent integer check (
    verified_coverage_percent is null
    or (verified_coverage_percent >= 0 and verified_coverage_percent <= 100)
  ),
  verified_duration_ms integer check (verified_duration_ms is null or verified_duration_ms >= 0),
  rejection_code text,
  score_submission_id uuid references public.game_score_submissions (id),
  verified_record_id uuid references public.verified_game_records (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint game_attempts_expires_after_start check (expires_at > server_started_at),
  constraint game_attempts_inventory_is_array check (jsonb_typeof(inventory_piece_ids) = 'array')
);

create unique index game_attempts_player_nonce_uidx
  on public.game_attempts (player_id, client_nonce)
  where client_nonce is not null;

create index game_attempts_player_status_idx
  on public.game_attempts (player_id, status, server_started_at desc);

create index game_attempts_open_expiry_idx
  on public.game_attempts (expires_at)
  where status = 'open';

create trigger game_attempts_set_updated_at
before update on public.game_attempts
for each row execute function public.set_updated_at();

alter table public.game_attempts enable row level security;

-- Players may read their own attempts (status / verified outcome). No client writes.
create policy "attempts_select_own"
  on public.game_attempts
  for select
  to authenticated
  using (
    player_id in (
      select id from public.player_profiles where user_id = auth.uid()
    )
  );

revoke all on table public.game_attempts from anon, authenticated;
grant select on table public.game_attempts to authenticated;

-- Optional helper: expire stale open attempts (callable by service role / cron later).
create or replace function public.expire_stale_game_attempts()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  affected integer;
begin
  update public.game_attempts
  set status = 'expired',
      finalized_at = now(),
      rejection_code = coalesce(rejection_code, 'expired')
  where status = 'open'
    and expires_at < now();
  get diagnostics affected = row_count;
  return affected;
end;
$$;

revoke all on function public.expire_stale_game_attempts() from public;
grant execute on function public.expire_stale_game_attempts() to service_role;

commit;
