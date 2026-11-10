-- Phase 4C.3 — secure claim management & operational readiness.
-- Depends on Phase 4C.1 tables and Phase 4C.2 claim RPCs.
-- Does not enable public claims, vouchers, or live campaigns.
-- Document before apply. Do not auto-deploy from the agent.

begin;

-- ---------------------------------------------------------------------------
-- Staff operators (server-controlled; never trust client role labels)
-- ---------------------------------------------------------------------------
create table if not exists public.staff_operators (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint staff_operators_role_check check (
    role in ('claims_reviewer', 'claims_admin')
  )
);

create index if not exists staff_operators_active_idx
  on public.staff_operators (active, role);

create trigger staff_operators_set_updated_at
before update on public.staff_operators
for each row execute function public.set_updated_at();

alter table public.staff_operators enable row level security;

-- Operators may read their own row (UI gate). No client inserts/updates.
drop policy if exists staff_operators_select_self on public.staff_operators;
create policy staff_operators_select_self
  on public.staff_operators
  for select
  to authenticated
  using (user_id = auth.uid() and active = true);

revoke all on table public.staff_operators from public, anon, authenticated;
grant select on table public.staff_operators to authenticated, service_role;
grant insert, update, delete on table public.staff_operators to service_role;

create or replace function public.is_active_staff_operator()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.staff_operators s
    where s.user_id = auth.uid()
      and s.active = true
  );
$$;

revoke all on function public.is_active_staff_operator() from public, anon;
grant execute on function public.is_active_staff_operator() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Durable promotional consent (minimal; no DOB / ID documents)
-- ---------------------------------------------------------------------------
create table if not exists public.player_promotional_consents (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.player_profiles (id) on delete cascade,
  adult_self_attested boolean not null,
  adult_attestation_method text not null default 'self_attestation_unverified',
  terms_accepted boolean not null,
  terms_version text not null,
  marketing_opt_in boolean not null default false,
  recorded_at timestamptz not null default now(),
  revoked_at timestamptz,
  audit_ref jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint player_promotional_consents_method_check check (
    adult_attestation_method = 'self_attestation_unverified'
  ),
  constraint player_promotional_consents_terms_version_len check (
    char_length(terms_version) between 3 and 64
  ),
  constraint player_promotional_consents_flags_check check (
    adult_self_attested = true and terms_accepted = true
  )
);

-- One active consent row per player (revoked rows may coexist historically).
create unique index if not exists player_promotional_consents_one_active_uidx
  on public.player_promotional_consents (player_id)
  where revoked_at is null;

create index if not exists player_promotional_consents_player_recorded_idx
  on public.player_promotional_consents (player_id, recorded_at desc);

alter table public.player_promotional_consents enable row level security;

drop policy if exists player_promotional_consents_select_own on public.player_promotional_consents;
create policy player_promotional_consents_select_own
  on public.player_promotional_consents
  for select
  to authenticated
  using (
    player_id in (
      select id from public.player_profiles where user_id = auth.uid()
    )
  );

revoke all on table public.player_promotional_consents from public, anon, authenticated;
grant select on table public.player_promotional_consents to authenticated, service_role;
grant insert, update on table public.player_promotional_consents to service_role;

comment on table public.player_promotional_consents is
  'Minimal promotional consent. adult_self_attested is attestation only — not verified age proof. Retention configurable via ops process.';

-- Record / rotate consent for the authenticated player (no client table writes).
create or replace function public.record_my_promotional_consent(
  p_adult_self_attested boolean,
  p_terms_accepted boolean,
  p_terms_version text,
  p_marketing_opt_in boolean default false
)
returns table (
  consent_id uuid,
  terms_version text,
  recorded_at timestamptz,
  marketing_opt_in boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player_id uuid;
  v_id uuid;
  v_recorded timestamptz;
  v_marketing boolean;
begin
  select id into v_player_id
  from public.player_profiles
  where user_id = auth.uid()
    and moderation_status = 'active';

  if v_player_id is null then
    raise exception 'profile_required' using errcode = '42501';
  end if;

  if p_adult_self_attested is distinct from true then
    raise exception 'adult_attestation_required' using errcode = '22023';
  end if;

  if p_terms_accepted is distinct from true then
    raise exception 'terms_required' using errcode = '22023';
  end if;

  if p_terms_version is null
     or p_terms_version <> btrim(p_terms_version)
     or char_length(p_terms_version) < 3
     or char_length(p_terms_version) > 64 then
    raise exception 'terms_version_invalid' using errcode = '22023';
  end if;

  update public.player_promotional_consents
  set revoked_at = now()
  where player_id = v_player_id
    and revoked_at is null;

  insert into public.player_promotional_consents (
    player_id,
    adult_self_attested,
    adult_attestation_method,
    terms_accepted,
    terms_version,
    marketing_opt_in,
    audit_ref
  ) values (
    v_player_id,
    true,
    'self_attestation_unverified',
    true,
    p_terms_version,
    coalesce(p_marketing_opt_in, false),
    jsonb_build_object(
      'source', 'record_my_promotional_consent',
      'ageProof', 'none',
      'note', 'Self-attestation only; not independently verified age proof'
    )
  )
  returning id, recorded_at, marketing_opt_in
  into v_id, v_recorded, v_marketing;

  return query select v_id, p_terms_version, v_recorded, v_marketing;
end;
$$;

revoke all on function public.record_my_promotional_consent(boolean, boolean, text, boolean)
  from public, anon;
grant execute on function public.record_my_promotional_consent(boolean, boolean, text, boolean)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Finalised leaderboard snapshots (immutable promotional eligibility source)
-- ---------------------------------------------------------------------------
create table if not exists public.leaderboard_snapshots (
  id uuid primary key default gen_random_uuid(),
  board text not null,
  level_id text,
  period_label text not null,
  period_start timestamptz,
  period_end timestamptz,
  finalised_at timestamptz not null default now(),
  source_fingerprint text not null,
  verification_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint leaderboard_snapshots_board_check check (board in ('overall', 'speed')),
  constraint leaderboard_snapshots_period_len check (char_length(period_label) between 3 and 64),
  constraint leaderboard_snapshots_fingerprint_len check (char_length(source_fingerprint) between 8 and 128),
  constraint leaderboard_snapshots_speed_level_check check (
    (board = 'overall' and level_id is null)
    or (board = 'speed' and level_id is not null)
  )
);

create unique index if not exists leaderboard_snapshots_idempotent_uidx
  on public.leaderboard_snapshots (
    board,
    coalesce(level_id, ''),
    period_label,
    source_fingerprint
  );

create index if not exists leaderboard_snapshots_board_finalised_idx
  on public.leaderboard_snapshots (board, finalised_at desc);

create table if not exists public.leaderboard_snapshot_entries (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null references public.leaderboard_snapshots (id) on delete cascade,
  rank integer not null check (rank >= 1),
  player_id uuid not null references public.player_profiles (id) on delete restrict,
  public_nickname text not null,
  score_metric integer not null check (score_metric >= 0),
  duration_metric_ms integer check (duration_metric_ms is null or duration_metric_ms >= 0),
  created_at timestamptz not null default now(),
  constraint leaderboard_snapshot_entries_rank_uidx unique (snapshot_id, rank),
  constraint leaderboard_snapshot_entries_player_uidx unique (snapshot_id, player_id)
);

create index if not exists leaderboard_snapshot_entries_player_idx
  on public.leaderboard_snapshot_entries (player_id, snapshot_id);

alter table public.leaderboard_snapshots enable row level security;
alter table public.leaderboard_snapshot_entries enable row level security;

-- Public may read finalised snapshot metadata/entries (nicknames only) — never mutate.
drop policy if exists leaderboard_snapshots_select_finalised on public.leaderboard_snapshots;
create policy leaderboard_snapshots_select_finalised
  on public.leaderboard_snapshots
  for select
  to anon, authenticated
  using (finalised_at is not null);

drop policy if exists leaderboard_snapshot_entries_select_finalised on public.leaderboard_snapshot_entries;
create policy leaderboard_snapshot_entries_select_finalised
  on public.leaderboard_snapshot_entries
  for select
  to anon, authenticated
  using (
    exists (
      select 1 from public.leaderboard_snapshots s
      where s.id = leaderboard_snapshot_entries.snapshot_id
        and s.finalised_at is not null
    )
  );

revoke all on table public.leaderboard_snapshots from public, anon, authenticated;
revoke all on table public.leaderboard_snapshot_entries from public, anon, authenticated;
grant select on table public.leaderboard_snapshots to anon, authenticated, service_role;
grant select on table public.leaderboard_snapshot_entries to anon, authenticated, service_role;
-- Insert-only for service_role; update/delete blocked by immutability triggers.
grant insert on table public.leaderboard_snapshots to service_role;
grant insert on table public.leaderboard_snapshot_entries to service_role;

-- Deny mutation of finalised snapshots (immutability).
create or replace function public.leaderboard_snapshots_deny_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'leaderboard_snapshots are immutable once finalised';
end;
$$;

drop trigger if exists leaderboard_snapshots_no_update on public.leaderboard_snapshots;
create trigger leaderboard_snapshots_no_update
before update or delete on public.leaderboard_snapshots
for each row execute function public.leaderboard_snapshots_deny_mutation();

drop trigger if exists leaderboard_snapshot_entries_no_update on public.leaderboard_snapshot_entries;
create trigger leaderboard_snapshot_entries_no_update
before update or delete on public.leaderboard_snapshot_entries
for each row execute function public.leaderboard_snapshots_deny_mutation();

revoke all on function public.leaderboard_snapshots_deny_mutation() from public, anon, authenticated;

-- Service-role finalisation from current verified rankings (idempotent).
create or replace function public.finalise_leaderboard_snapshot(
  p_board text,
  p_period_label text,
  p_source_fingerprint text,
  p_level_id text default null,
  p_period_start timestamptz default null,
  p_period_end timestamptz default null,
  p_limit integer default 100
)
returns table (
  snapshot_id uuid,
  inserted boolean,
  entry_count integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing_id uuid;
  v_snapshot_id uuid;
  v_limit integer;
  v_count integer := 0;
begin
  if p_board not in ('overall', 'speed') then
    raise exception 'unsupported_board' using errcode = '22023';
  end if;
  if p_board = 'speed' and (p_level_id is null or char_length(p_level_id) < 3) then
    raise exception 'level_id_required' using errcode = '22023';
  end if;
  if p_board = 'overall' then
    p_level_id := null;
  end if;
  if p_period_label is null or char_length(btrim(p_period_label)) < 3 then
    raise exception 'invalid_period' using errcode = '22023';
  end if;
  if p_source_fingerprint is null or char_length(p_source_fingerprint) < 8 then
    raise exception 'invalid_fingerprint' using errcode = '22023';
  end if;

  v_limit := greatest(1, least(coalesce(p_limit, 100), 200));

  select s.id into v_existing_id
  from public.leaderboard_snapshots s
  where s.board = p_board
    and coalesce(s.level_id, '') = coalesce(p_level_id, '')
    and s.period_label = p_period_label
    and s.source_fingerprint = p_source_fingerprint;

  if v_existing_id is not null then
    select count(*)::integer into v_count
    from public.leaderboard_snapshot_entries e
    where e.snapshot_id = v_existing_id;
    return query select v_existing_id, false, v_count;
    return;
  end if;

  insert into public.leaderboard_snapshots (
    board,
    level_id,
    period_label,
    period_start,
    period_end,
    source_fingerprint,
    verification_metadata
  ) values (
    p_board,
    p_level_id,
    p_period_label,
    p_period_start,
    p_period_end,
    p_source_fingerprint,
    jsonb_build_object(
      'generator', 'finalise_leaderboard_snapshot',
      'finalised', true,
      'limit', v_limit
    )
  )
  returning id into v_snapshot_id;

  if p_board = 'overall' then
    insert into public.leaderboard_snapshot_entries (
      snapshot_id, rank, player_id, public_nickname, score_metric, duration_metric_ms
    )
    select
      v_snapshot_id,
      r.rank,
      p.id,
      r.public_nickname,
      r.total_score,
      r.total_duration_ms
    from public.leaderboard_overall(v_limit, 0) r
    join public.player_profiles p
      on p.public_nickname = r.public_nickname
     and p.moderation_status = 'active';
  else
    insert into public.leaderboard_snapshot_entries (
      snapshot_id, rank, player_id, public_nickname, score_metric, duration_metric_ms
    )
    select
      v_snapshot_id,
      r.rank,
      p.id,
      r.public_nickname,
      r.verified_score,
      r.verified_duration_ms
    from public.leaderboard_speed(p_level_id, v_limit, 0) r
    join public.player_profiles p
      on p.public_nickname = r.public_nickname
     and p.moderation_status = 'active';
  end if;

  select count(*)::integer into v_count
  from public.leaderboard_snapshot_entries e
  where e.snapshot_id = v_snapshot_id;

  return query select v_snapshot_id, true, v_count;
exception when unique_violation then
  select s.id into v_existing_id
  from public.leaderboard_snapshots s
  where s.board = p_board
    and coalesce(s.level_id, '') = coalesce(p_level_id, '')
    and s.period_label = p_period_label
    and s.source_fingerprint = p_source_fingerprint;
  select count(*)::integer into v_count
  from public.leaderboard_snapshot_entries e
  where e.snapshot_id = v_existing_id;
  return query select v_existing_id, false, coalesce(v_count, 0);
end;
$$;

revoke all on function public.finalise_leaderboard_snapshot(
  text, text, text, text, timestamptz, timestamptz, integer
) from public, anon, authenticated;
grant execute on function public.finalise_leaderboard_snapshot(
  text, text, text, text, timestamptz, timestamptz, integer
) to service_role;

-- ---------------------------------------------------------------------------
-- Player claim history (owner read; public-facing fields only)
-- ---------------------------------------------------------------------------
create or replace function public.list_my_reward_claims()
returns table (
  claim_id uuid,
  reward_id uuid,
  reward_slug text,
  reward_title text,
  campaign_id uuid,
  status public.reward_claim_status,
  created_at timestamptz,
  updated_at timestamptz,
  decided_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.id,
    c.reward_id,
    d.slug,
    d.title,
    c.campaign_id,
    c.status,
    c.created_at,
    c.updated_at,
    c.decided_at
  from public.player_reward_claims c
  join public.reward_definitions d on d.id = c.reward_id
  join public.player_profiles p on p.id = c.player_id
  where p.user_id = auth.uid()
    and p.moderation_status = 'active'
  order by c.created_at desc;
$$;

revoke all on function public.list_my_reward_claims() from public, anon;
grant execute on function public.list_my_reward_claims() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Operator claim review helpers (auth.uid must be active staff_operator)
-- ---------------------------------------------------------------------------
create or replace function public.operator_list_pending_claims(p_limit integer default 50)
returns table (
  claim_id uuid,
  player_id uuid,
  public_nickname text,
  reward_id uuid,
  reward_slug text,
  reward_title text,
  campaign_id uuid,
  status public.reward_claim_status,
  created_at timestamptz,
  eligibility_snapshot jsonb
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_limit integer;
begin
  if not public.is_active_staff_operator() then
    raise exception 'operator_required' using errcode = '42501';
  end if;
  v_limit := greatest(1, least(coalesce(p_limit, 50), 100));

  return query
  select
    c.id,
    c.player_id,
    p.public_nickname,
    c.reward_id,
    d.slug,
    d.title,
    c.campaign_id,
    c.status,
    c.created_at,
    c.eligibility_snapshot
  from public.player_reward_claims c
  join public.player_profiles p on p.id = c.player_id
  join public.reward_definitions d on d.id = c.reward_id
  where c.status = 'pending'
  order by c.created_at asc
  limit v_limit;
end;
$$;

revoke all on function public.operator_list_pending_claims(integer) from public, anon;
grant execute on function public.operator_list_pending_claims(integer)
  to authenticated, service_role;

create or replace function public.operator_get_claim_detail(p_claim_id uuid)
returns table (
  claim_id uuid,
  player_id uuid,
  public_nickname text,
  reward_id uuid,
  reward_slug text,
  reward_title text,
  campaign_id uuid,
  status public.reward_claim_status,
  claim_policy text,
  eligibility_snapshot jsonb,
  created_at timestamptz,
  updated_at timestamptz,
  decided_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_active_staff_operator() then
    raise exception 'operator_required' using errcode = '42501';
  end if;

  return query
  select
    c.id,
    c.player_id,
    p.public_nickname,
    c.reward_id,
    d.slug,
    d.title,
    c.campaign_id,
    c.status,
    c.claim_policy,
    c.eligibility_snapshot,
    c.created_at,
    c.updated_at,
    c.decided_at
  from public.player_reward_claims c
  join public.player_profiles p on p.id = c.player_id
  join public.reward_definitions d on d.id = c.reward_id
  where c.id = p_claim_id;
end;
$$;

revoke all on function public.operator_get_claim_detail(uuid) from public, anon;
grant execute on function public.operator_get_claim_detail(uuid)
  to authenticated, service_role;

create or replace function public.operator_list_claim_audits(p_claim_id uuid)
returns table (
  audit_id uuid,
  event_type public.reward_audit_event_type,
  actor_role text,
  payload jsonb,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_active_staff_operator() then
    raise exception 'operator_required' using errcode = '42501';
  end if;

  return query
  select a.id, a.event_type, a.actor_role, a.payload, a.created_at
  from public.reward_audit_events a
  where a.claim_id = p_claim_id
  order by a.created_at asc;
end;
$$;

revoke all on function public.operator_list_claim_audits(uuid) from public, anon;
grant execute on function public.operator_list_claim_audits(uuid)
  to authenticated, service_role;

-- Approve/reject only (never redeemed). Uses 4C.2 transition RPC under the hood.
create or replace function public.operator_review_claim(
  p_claim_id uuid,
  p_decision text,
  p_reason text default null
)
returns table (
  claim_id uuid,
  from_status public.reward_claim_status,
  to_status public.reward_claim_status,
  ok boolean,
  rejection_code text,
  rejection_reason text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_to public.reward_claim_status;
  v_row record;
begin
  if not public.is_active_staff_operator() then
    return query select null::uuid, null::public.reward_claim_status, null::public.reward_claim_status,
      false, 'operator_required'::text, 'Active staff operator role required'::text;
    return;
  end if;

  if p_decision = 'approve' then
    v_to := 'approved';
  elsif p_decision = 'reject' then
    v_to := 'rejected';
  else
    return query select null::uuid, null::public.reward_claim_status, null::public.reward_claim_status,
      false, 'invalid_decision'::text, 'decision must be approve or reject'::text;
    return;
  end if;

  -- Never treat approval as voucher issuance / redemption.
  select * into v_row
  from public.transition_player_reward_claim(
    p_claim_id,
    v_to,
    coalesce(nullif(p_reason, ''), format('operator_%s', p_decision)),
    'service_role'
  );

  return query select
    v_row.claim_id,
    v_row.from_status,
    v_row.to_status,
    v_row.ok,
    v_row.rejection_code,
    v_row.rejection_reason;
end;
$$;

revoke all on function public.operator_review_claim(uuid, text, text) from public, anon;
grant execute on function public.operator_review_claim(uuid, text, text)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Future voucher intent stub (never issued in 4C.3)
-- ---------------------------------------------------------------------------
create table if not exists public.reward_voucher_intents (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references public.player_reward_claims (id) on delete cascade,
  reward_id uuid not null references public.reward_definitions (id) on delete restrict,
  player_id uuid not null references public.player_profiles (id) on delete cascade,
  lifecycle_status text not null default 'reserved',
  code_issued boolean not null default false,
  expires_at timestamptz,
  monetary_value_cents integer,
  currency text not null default 'AUD',
  created_at timestamptz not null default now(),
  constraint reward_voucher_intents_status_check check (lifecycle_status = 'reserved'),
  constraint reward_voucher_intents_no_code_check check (code_issued = false),
  constraint reward_voucher_intents_currency_check check (currency = 'AUD'),
  constraint reward_voucher_intents_claim_uidx unique (claim_id)
);

alter table public.reward_voucher_intents enable row level security;
-- No client policies — service_role only when issuance is later enabled.
revoke all on table public.reward_voucher_intents from public, anon, authenticated;
grant select, insert, update, delete on table public.reward_voucher_intents to service_role;

comment on table public.reward_voucher_intents is
  'Phase 4C.3 stub only. code_issued must remain false; no redemption path.';

-- Ensure 4C.2 claim mutation RPCs remain service_role-only (no public escalation).
revoke all on function public.request_player_reward_claim(uuid, uuid, boolean, boolean, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.request_player_reward_claim(uuid, uuid, boolean, boolean, jsonb, text)
  to service_role;

revoke all on function public.transition_player_reward_claim(uuid, public.reward_claim_status, text, text)
  from public, anon, authenticated;
grant execute on function public.transition_player_reward_claim(uuid, public.reward_claim_status, text, text)
  to service_role;

commit;
