-- Final Implementation A — promotional campaign runs + reward decisions.
-- Independent of undeployed 4C.2/4C.3. Requires player_profiles + game_attempts + verified_game_records.
-- Does not issue vouchers, enable claims_enabled, or collect contact details.
-- Document before apply. Do not auto-deploy from the agent.

begin;

create table if not exists public.promotional_campaign_runs (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.player_profiles (id) on delete cascade,
  campaign_id text not null,
  campaign_version integer not null check (campaign_version > 0),
  status text not null default 'in_progress',
  reward_tier_id text,
  reward_amount_cents integer,
  reward_currency text not null default 'AUD',
  reward_eligible boolean,
  reward_reason text,
  total_stars integer,
  total_score integer,
  decision jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint promotional_campaign_runs_campaign_id_len check (
    char_length(campaign_id) between 3 and 64
  ),
  constraint promotional_campaign_runs_status_check check (
    status in (
      'in_progress',
      'awaiting_verification',
      'completed',
      'reward_calculated',
      'abandoned',
      'ineligible'
    )
  ),
  constraint promotional_campaign_runs_currency_aud check (reward_currency = 'AUD'),
  constraint promotional_campaign_runs_amount_check check (
    reward_amount_cents is null
    or (reward_amount_cents >= 0 and reward_amount_cents <= 100000000)
  )
);

create index if not exists promotional_campaign_runs_player_created_idx
  on public.promotional_campaign_runs (player_id, created_at desc);

create index if not exists promotional_campaign_runs_status_idx
  on public.promotional_campaign_runs (status, created_at desc);

create trigger promotional_campaign_runs_set_updated_at
before update on public.promotional_campaign_runs
for each row execute function public.set_updated_at();

create table if not exists public.promotional_campaign_run_levels (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.promotional_campaign_runs (id) on delete cascade,
  level_id text not null,
  level_version integer,
  status text not null default 'pending',
  verified_stars smallint,
  verified_score integer,
  verified_attempt_id uuid references public.game_attempts (id) on delete set null,
  verified_record_id uuid references public.verified_game_records (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint promotional_campaign_run_levels_status_check check (
    status in ('pending', 'local_complete', 'verified', 'rejected', 'offline')
  ),
  constraint promotional_campaign_run_levels_stars_check check (
    verified_stars is null or verified_stars between 0 and 3
  ),
  constraint promotional_campaign_run_levels_run_level_uidx unique (run_id, level_id)
);

create index if not exists promotional_campaign_run_levels_record_idx
  on public.promotional_campaign_run_levels (verified_record_id);

create trigger promotional_campaign_run_levels_set_updated_at
before update on public.promotional_campaign_run_levels
for each row execute function public.set_updated_at();

-- Associate competitive attempts with an explicit campaign run (nullable for standalone play).
alter table public.game_attempts
  add column if not exists campaign_run_id uuid
    references public.promotional_campaign_runs (id) on delete set null;

create index if not exists game_attempts_campaign_run_idx
  on public.game_attempts (campaign_run_id)
  where campaign_run_id is not null;

-- Immutable-ish reward decision rows (one decision per run).
create table if not exists public.promotional_campaign_reward_decisions (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.promotional_campaign_runs (id) on delete cascade,
  player_id uuid not null references public.player_profiles (id) on delete cascade,
  eligible boolean not null,
  tier_id text,
  amount_cents integer not null default 0,
  currency text not null default 'AUD',
  total_stars integer not null,
  total_score integer not null,
  decision jsonb not null,
  voucher_issued boolean not null default false,
  created_at timestamptz not null default now(),
  constraint promotional_campaign_reward_decisions_run_uidx unique (run_id),
  constraint promotional_campaign_reward_decisions_currency_aud check (currency = 'AUD'),
  constraint promotional_campaign_reward_decisions_no_voucher check (voucher_issued = false),
  constraint promotional_campaign_reward_decisions_amount_check check (
    amount_cents >= 0 and amount_cents <= 100000000
  )
);

alter table public.promotional_campaign_runs enable row level security;
alter table public.promotional_campaign_run_levels enable row level security;
alter table public.promotional_campaign_reward_decisions enable row level security;

drop policy if exists promotional_campaign_runs_select_own on public.promotional_campaign_runs;
create policy promotional_campaign_runs_select_own
  on public.promotional_campaign_runs
  for select
  to authenticated
  using (
    player_id in (
      select id from public.player_profiles where user_id = auth.uid()
    )
  );

drop policy if exists promotional_campaign_run_levels_select_own on public.promotional_campaign_run_levels;
create policy promotional_campaign_run_levels_select_own
  on public.promotional_campaign_run_levels
  for select
  to authenticated
  using (
    run_id in (
      select r.id
      from public.promotional_campaign_runs r
      join public.player_profiles p on p.id = r.player_id
      where p.user_id = auth.uid()
    )
  );

drop policy if exists promotional_campaign_reward_decisions_select_own
  on public.promotional_campaign_reward_decisions;
create policy promotional_campaign_reward_decisions_select_own
  on public.promotional_campaign_reward_decisions
  for select
  to authenticated
  using (
    player_id in (
      select id from public.player_profiles where user_id = auth.uid()
    )
  );

revoke all on table public.promotional_campaign_runs from public, anon, authenticated;
revoke all on table public.promotional_campaign_run_levels from public, anon, authenticated;
revoke all on table public.promotional_campaign_reward_decisions from public, anon, authenticated;

grant select on table public.promotional_campaign_runs to authenticated, service_role;
grant select on table public.promotional_campaign_run_levels to authenticated, service_role;
grant select on table public.promotional_campaign_reward_decisions to authenticated, service_role;

grant insert, update, delete on table public.promotional_campaign_runs to service_role;
grant insert, update, delete on table public.promotional_campaign_run_levels to service_role;
grant insert on table public.promotional_campaign_reward_decisions to service_role;

-- Deny mutation of persisted reward decisions (idempotent insert-only).
create or replace function public.promotional_reward_decisions_deny_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'promotional_campaign_reward_decisions are immutable';
end;
$$;

drop trigger if exists promotional_reward_decisions_no_update
  on public.promotional_campaign_reward_decisions;
create trigger promotional_reward_decisions_no_update
before update or delete on public.promotional_campaign_reward_decisions
for each row execute function public.promotional_reward_decisions_deny_mutation();

revoke all on function public.promotional_reward_decisions_deny_mutation()
  from public, anon, authenticated;

comment on table public.promotional_campaign_runs is
  'Final A qualifying promotional Classic campaign runs. Not voucher issuance.';
comment on table public.promotional_campaign_reward_decisions is
  'Idempotent reward tier decisions. voucher_issued must remain false in Final A.';

commit;
