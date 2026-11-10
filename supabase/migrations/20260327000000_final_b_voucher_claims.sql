-- Final Implementation B — voucher claims, unique email, issuance + email jobs.
-- Depends on Final A: promotional_campaign_runs, promotional_campaign_reward_decisions,
-- player_profiles. Does NOT require Phase 4C.2 or 4C.3 tables/RPCs.
-- Does NOT enable 4C reward_campaigns.claims_enabled or issue redeemable live discounts.
-- Default seed: demo mode for classic-five-rooftop-v1 (non-redeemable codes only).
-- Document before apply. Do not auto-deploy from the agent.

begin;

-- ---------------------------------------------------------------------------
-- Issuance configuration (demo vs approved_live)
-- ---------------------------------------------------------------------------
create table if not exists public.promotional_issuance_config (
  campaign_id text primary key,
  mode text not null default 'demo',
  claims_enabled boolean not null default false,
  real_redeemable boolean not null default false,
  terms_version text not null default 'promo-terms-v1',
  voucher_ttl_days integer not null default 90,
  updated_at timestamptz not null default now(),
  constraint promotional_issuance_config_mode_check check (
    mode in ('demo', 'approved_live')
  ),
  constraint promotional_issuance_config_ttl_check check (
    voucher_ttl_days between 1 and 3650
  ),
  constraint promotional_issuance_config_live_gate check (
    real_redeemable = false
    or (mode = 'approved_live' and claims_enabled = true)
  )
);

create trigger promotional_issuance_config_set_updated_at
before update on public.promotional_issuance_config
for each row execute function public.set_updated_at();

insert into public.promotional_issuance_config (
  campaign_id,
  mode,
  claims_enabled,
  real_redeemable,
  terms_version,
  voucher_ttl_days
) values (
  'classic-five-rooftop-v1',
  'demo',
  true,
  false,
  'promo-terms-v1',
  90
)
on conflict (campaign_id) do nothing;

-- ---------------------------------------------------------------------------
-- Contact claims (one normalized email per campaign)
-- ---------------------------------------------------------------------------
create table if not exists public.promotional_voucher_claims (
  id uuid primary key default gen_random_uuid(),
  campaign_id text not null,
  run_id uuid not null references public.promotional_campaign_runs (id) on delete restrict,
  decision_id uuid not null references public.promotional_campaign_reward_decisions (id) on delete restrict,
  player_id uuid not null references public.player_profiles (id) on delete cascade,
  email_raw text not null,
  email_normalized text not null,
  full_name text not null,
  phone text not null,
  terms_version text not null,
  terms_accepted_at timestamptz not null default now(),
  adult_self_attested boolean not null,
  adult_attestation_method text not null default 'self_attestation_unverified',
  marketing_opt_in boolean not null default false,
  reward_tier_id text not null,
  amount_cents integer not null,
  currency text not null default 'AUD',
  status text not null default 'pending',
  issuance_mode text not null default 'demo',
  redeemable boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint promotional_voucher_claims_email_raw_len check (
    char_length(email_raw) between 3 and 320
  ),
  constraint promotional_voucher_claims_email_norm_len check (
    char_length(email_normalized) between 3 and 320
  ),
  constraint promotional_voucher_claims_name_len check (
    char_length(full_name) between 1 and 120
  ),
  constraint promotional_voucher_claims_phone_len check (
    char_length(phone) between 8 and 32
  ),
  constraint promotional_voucher_claims_currency_aud check (currency = 'AUD'),
  constraint promotional_voucher_claims_amount_check check (
    amount_cents > 0 and amount_cents <= 100000000
  ),
  constraint promotional_voucher_claims_adult_method_check check (
    adult_attestation_method = 'self_attestation_unverified'
  ),
  constraint promotional_voucher_claims_status_check check (
    status in (
      'pending',
      'issued',
      'email_queued',
      'email_sent',
      'email_failed',
      'redeemed',
      'expired',
      'void'
    )
  ),
  constraint promotional_voucher_claims_mode_check check (
    issuance_mode in ('demo', 'approved_live')
  ),
  constraint promotional_voucher_claims_demo_not_redeemable check (
    redeemable = false or issuance_mode = 'approved_live'
  ),
  constraint promotional_voucher_claims_run_uidx unique (run_id),
  constraint promotional_voucher_claims_email_campaign_uidx unique (campaign_id, email_normalized)
);

create index if not exists promotional_voucher_claims_player_idx
  on public.promotional_voucher_claims (player_id, created_at desc);

create trigger promotional_voucher_claims_set_updated_at
before update on public.promotional_voucher_claims
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Issued vouchers (codes never generated by the browser)
-- ---------------------------------------------------------------------------
create table if not exists public.promotional_vouchers (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references public.promotional_voucher_claims (id) on delete restrict,
  campaign_id text not null,
  run_id uuid not null references public.promotional_campaign_runs (id) on delete restrict,
  player_id uuid not null references public.player_profiles (id) on delete cascade,
  code text not null,
  reward_tier_id text not null,
  amount_cents integer not null,
  currency text not null default 'AUD',
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  status text not null default 'issued',
  demo boolean not null default true,
  redeemable boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint promotional_vouchers_code_len check (
    char_length(code) between 12 and 64
  ),
  constraint promotional_vouchers_currency_aud check (currency = 'AUD'),
  constraint promotional_vouchers_amount_check check (
    amount_cents > 0 and amount_cents <= 100000000
  ),
  constraint promotional_vouchers_status_check check (
    status in ('issued', 'redeemed', 'expired', 'void')
  ),
  constraint promotional_vouchers_demo_not_redeemable check (
    redeemable = false or demo = false
  ),
  constraint promotional_vouchers_claim_uidx unique (claim_id),
  constraint promotional_vouchers_run_uidx unique (run_id),
  constraint promotional_vouchers_code_uidx unique (code)
);

create index if not exists promotional_vouchers_player_idx
  on public.promotional_vouchers (player_id, issued_at desc);

create trigger promotional_vouchers_set_updated_at
before update on public.promotional_vouchers
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Email delivery jobs (retry without re-issuing vouchers)
-- ---------------------------------------------------------------------------
create table if not exists public.promotional_voucher_email_jobs (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references public.promotional_voucher_claims (id) on delete restrict,
  voucher_id uuid not null references public.promotional_vouchers (id) on delete restrict,
  to_email_normalized text not null,
  status text not null default 'queued',
  provider text not null default 'resend',
  provider_message_id text,
  attempt_count integer not null default 0,
  last_error text,
  last_attempt_at timestamptz,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint promotional_voucher_email_jobs_status_check check (
    status in ('queued', 'sent', 'failed')
  ),
  constraint promotional_voucher_email_jobs_attempts_check check (
    attempt_count >= 0 and attempt_count <= 100
  ),
  constraint promotional_voucher_email_jobs_claim_uidx unique (claim_id)
);

create index if not exists promotional_voucher_email_jobs_status_idx
  on public.promotional_voucher_email_jobs (status, updated_at);

create trigger promotional_voucher_email_jobs_set_updated_at
before update on public.promotional_voucher_email_jobs
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS — contact / codes never public
-- ---------------------------------------------------------------------------
alter table public.promotional_issuance_config enable row level security;
alter table public.promotional_voucher_claims enable row level security;
alter table public.promotional_vouchers enable row level security;
alter table public.promotional_voucher_email_jobs enable row level security;

-- Authenticated players may read issuance mode flags only (no secrets).
drop policy if exists promotional_issuance_config_select_auth
  on public.promotional_issuance_config;
create policy promotional_issuance_config_select_auth
  on public.promotional_issuance_config
  for select
  to authenticated
  using (true);

-- Own claims: limited columns via grants; still no anon access to PII tables.
drop policy if exists promotional_voucher_claims_select_own
  on public.promotional_voucher_claims;
create policy promotional_voucher_claims_select_own
  on public.promotional_voucher_claims
  for select
  to authenticated
  using (
    player_id in (
      select id from public.player_profiles where user_id = auth.uid()
    )
  );

drop policy if exists promotional_vouchers_select_own
  on public.promotional_vouchers;
create policy promotional_vouchers_select_own
  on public.promotional_vouchers
  for select
  to authenticated
  using (
    player_id in (
      select id from public.player_profiles where user_id = auth.uid()
    )
  );

-- Email jobs: no direct authenticated select (service role / edge only).
drop policy if exists promotional_voucher_email_jobs_no_direct
  on public.promotional_voucher_email_jobs;

revoke all on table public.promotional_issuance_config from public, anon, authenticated;
revoke all on table public.promotional_voucher_claims from public, anon, authenticated;
revoke all on table public.promotional_vouchers from public, anon, authenticated;
revoke all on table public.promotional_voucher_email_jobs from public, anon, authenticated;

grant select on table public.promotional_issuance_config to authenticated, service_role;
grant select on table public.promotional_voucher_claims to authenticated, service_role;
grant select on table public.promotional_vouchers to authenticated, service_role;

grant insert, update, delete on table public.promotional_issuance_config to service_role;
grant insert, update, delete on table public.promotional_voucher_claims to service_role;
grant insert, update, delete on table public.promotional_vouchers to service_role;
grant all on table public.promotional_voucher_email_jobs to service_role;

-- ---------------------------------------------------------------------------
-- Atomic issuance RPC (service_role only)
-- Amount always taken from promotional_campaign_reward_decisions — never client.
-- ---------------------------------------------------------------------------
create or replace function public.issue_campaign_voucher_claim(
  p_player_id uuid,
  p_run_id uuid,
  p_email_raw text,
  p_email_normalized text,
  p_full_name text,
  p_phone text,
  p_terms_version text,
  p_adult_self_attested boolean,
  p_marketing_opt_in boolean,
  p_voucher_code text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_config public.promotional_issuance_config%rowtype;
  v_run public.promotional_campaign_runs%rowtype;
  v_decision public.promotional_campaign_reward_decisions%rowtype;
  v_claim public.promotional_voucher_claims%rowtype;
  v_voucher public.promotional_vouchers%rowtype;
  v_job public.promotional_voucher_email_jobs%rowtype;
  v_existing_email public.promotional_voucher_claims%rowtype;
  v_expires_at timestamptz;
  v_redeemable boolean;
begin
  if p_player_id is null or p_run_id is null then
    return jsonb_build_object('ok', false, 'code', 'invalid_request', 'message', 'Missing player or run.');
  end if;
  if p_adult_self_attested is not true then
    return jsonb_build_object('ok', false, 'code', 'adult_attestation_required', 'message', 'Adult self-attestation is required.');
  end if;
  if coalesce(p_terms_version, '') = '' then
    return jsonb_build_object('ok', false, 'code', 'terms_required', 'message', 'Promotional terms acceptance is required.');
  end if;
  if coalesce(p_voucher_code, '') = '' or char_length(p_voucher_code) < 12 then
    return jsonb_build_object('ok', false, 'code', 'invalid_voucher_code', 'message', 'Server voucher code required.');
  end if;

  select * into v_run
  from public.promotional_campaign_runs
  where id = p_run_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'run_not_found', 'message', 'Campaign run not found.');
  end if;

  if v_run.player_id is distinct from p_player_id then
    return jsonb_build_object('ok', false, 'code', 'forbidden', 'message', 'Campaign run does not belong to this player.');
  end if;

  select * into v_config
  from public.promotional_issuance_config
  where campaign_id = v_run.campaign_id;

  if not found or v_config.claims_enabled is not true then
    return jsonb_build_object('ok', false, 'code', 'claims_disabled', 'message', 'Voucher claims are not enabled for this campaign.');
  end if;

  if p_terms_version is distinct from v_config.terms_version then
    return jsonb_build_object('ok', false, 'code', 'terms_version_mismatch', 'message', 'Promotional terms version mismatch.');
  end if;

  -- Idempotent: existing claim for this run by this player.
  select * into v_claim
  from public.promotional_voucher_claims
  where run_id = p_run_id;

  if found then
    if v_claim.player_id is distinct from p_player_id then
      return jsonb_build_object('ok', false, 'code', 'forbidden', 'message', 'Campaign run does not belong to this player.');
    end if;
    select * into v_voucher from public.promotional_vouchers where claim_id = v_claim.id;
    select * into v_job from public.promotional_voucher_email_jobs where claim_id = v_claim.id;
      return jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'claimId', v_claim.id,
      'voucherId', v_voucher.id,
      'emailJobId', v_job.id,
      'code', v_voucher.code,
      'amountCents', v_claim.amount_cents,
      'tierId', v_claim.reward_tier_id,
      'expiresAt', v_voucher.expires_at,
      'demo', v_voucher.demo,
      'redeemable', v_voucher.redeemable,
      'issuanceMode', v_claim.issuance_mode,
      'claimStatus', v_claim.status,
      'emailStatus', v_job.status,
      'emailNormalized', v_claim.email_normalized,
      'fullName', v_claim.full_name
    );
  end if;

  select * into v_decision
  from public.promotional_campaign_reward_decisions
  where run_id = p_run_id
  for share;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'unverified_result', 'message', 'Campaign reward has not been server-verified.');
  end if;

  if v_decision.player_id is distinct from p_player_id then
    return jsonb_build_object('ok', false, 'code', 'forbidden', 'message', 'Campaign run does not belong to this player.');
  end if;

  if v_decision.eligible is not true
     or coalesce(v_decision.amount_cents, 0) <= 0
     or v_decision.tier_id is null then
    return jsonb_build_object('ok', false, 'code', 'not_eligible', 'message', 'This campaign run is not eligible for a voucher.');
  end if;

  -- Unique email per campaign (race-safe via unique constraint).
  select * into v_existing_email
  from public.promotional_voucher_claims
  where campaign_id = v_run.campaign_id
    and email_normalized = lower(trim(p_email_normalized))
  for update;

  if found then
    if v_existing_email.player_id = p_player_id and v_existing_email.run_id = p_run_id then
      select * into v_voucher from public.promotional_vouchers where claim_id = v_existing_email.id;
      select * into v_job from public.promotional_voucher_email_jobs where claim_id = v_existing_email.id;
      return jsonb_build_object(
        'ok', true,
        'idempotent', true,
        'claimId', v_existing_email.id,
        'voucherId', v_voucher.id,
        'emailJobId', v_job.id,
        'code', v_voucher.code,
        'amountCents', v_existing_email.amount_cents,
        'tierId', v_existing_email.reward_tier_id,
        'expiresAt', v_voucher.expires_at,
        'demo', v_voucher.demo,
        'redeemable', v_voucher.redeemable,
        'issuanceMode', v_existing_email.issuance_mode,
        'claimStatus', v_existing_email.status,
        'emailStatus', v_job.status,
        'emailNormalized', v_existing_email.email_normalized,
        'fullName', v_existing_email.full_name
      );
    end if;
    -- Do not reveal whether the address belongs to another player beyond the product message.
    return jsonb_build_object(
      'ok', false,
      'code', 'email_already_used',
      'message', 'This email has already been used for this promotion.'
    );
  end if;

  v_redeemable := (v_config.mode = 'approved_live' and v_config.real_redeemable is true);
  v_expires_at := now() + make_interval(days => v_config.voucher_ttl_days);

  begin
    insert into public.promotional_voucher_claims (
      campaign_id,
      run_id,
      decision_id,
      player_id,
      email_raw,
      email_normalized,
      full_name,
      phone,
      terms_version,
      adult_self_attested,
      marketing_opt_in,
      reward_tier_id,
      amount_cents,
      currency,
      status,
      issuance_mode,
      redeemable
    ) values (
      v_run.campaign_id,
      p_run_id,
      v_decision.id,
      p_player_id,
      trim(p_email_raw),
      lower(trim(p_email_normalized)),
      trim(p_full_name),
      trim(p_phone),
      v_config.terms_version,
      true,
      coalesce(p_marketing_opt_in, false),
      v_decision.tier_id,
      v_decision.amount_cents,
      'AUD',
      'issued',
      v_config.mode,
      v_redeemable
    )
    returning * into v_claim;
  exception
    when unique_violation then
      select * into v_claim
      from public.promotional_voucher_claims
      where run_id = p_run_id;
      if found and v_claim.player_id = p_player_id then
        select * into v_voucher from public.promotional_vouchers where claim_id = v_claim.id;
        select * into v_job from public.promotional_voucher_email_jobs where claim_id = v_claim.id;
        return jsonb_build_object(
          'ok', true,
          'idempotent', true,
          'claimId', v_claim.id,
          'voucherId', v_voucher.id,
          'emailJobId', v_job.id,
          'code', v_voucher.code,
          'amountCents', v_claim.amount_cents,
          'tierId', v_claim.reward_tier_id,
          'expiresAt', v_voucher.expires_at,
          'demo', v_voucher.demo,
          'redeemable', v_voucher.redeemable,
          'issuanceMode', v_claim.issuance_mode,
          'claimStatus', v_claim.status,
          'emailStatus', v_job.status,
          'emailNormalized', v_claim.email_normalized,
          'fullName', v_claim.full_name
        );
      end if;
      return jsonb_build_object(
        'ok', false,
        'code', 'email_already_used',
        'message', 'This email has already been used for this promotion.'
      );
  end;

  begin
    insert into public.promotional_vouchers (
      claim_id,
      campaign_id,
      run_id,
      player_id,
      code,
      reward_tier_id,
      amount_cents,
      currency,
      expires_at,
      status,
      demo,
      redeemable
    ) values (
      v_claim.id,
      v_run.campaign_id,
      p_run_id,
      p_player_id,
      p_voucher_code,
      v_decision.tier_id,
      v_decision.amount_cents,
      'AUD',
      v_expires_at,
      'issued',
      (v_config.mode = 'demo'),
      v_redeemable
    )
    returning * into v_voucher;
  exception
    when unique_violation then
      -- Extremely unlikely code collision: roll back claim via exception.
      raise exception 'voucher_code_collision';
  end;

  insert into public.promotional_voucher_email_jobs (
    claim_id,
    voucher_id,
    to_email_normalized,
    status,
    provider
  ) values (
    v_claim.id,
    v_voucher.id,
    v_claim.email_normalized,
    'queued',
    'resend'
  )
  returning * into v_job;

  update public.promotional_voucher_claims
  set status = 'email_queued'
  where id = v_claim.id
  returning * into v_claim;

  return jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'claimId', v_claim.id,
    'voucherId', v_voucher.id,
    'emailJobId', v_job.id,
    'code', v_voucher.code,
    'amountCents', v_claim.amount_cents,
    'tierId', v_claim.reward_tier_id,
    'expiresAt', v_voucher.expires_at,
    'demo', v_voucher.demo,
    'redeemable', v_voucher.redeemable,
    'issuanceMode', v_claim.issuance_mode,
    'claimStatus', v_claim.status,
    'emailStatus', v_job.status,
    'emailNormalized', v_claim.email_normalized,
    'fullName', v_claim.full_name
  );
end;
$$;

revoke all on function public.issue_campaign_voucher_claim(
  uuid, uuid, text, text, text, text, text, boolean, boolean, text
) from public, anon, authenticated;

grant execute on function public.issue_campaign_voucher_claim(
  uuid, uuid, text, text, text, text, text, boolean, boolean, text
) to service_role;

create or replace function public.mark_voucher_email_job_result(
  p_job_id uuid,
  p_success boolean,
  p_provider_message_id text default null,
  p_error text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.promotional_voucher_email_jobs%rowtype;
begin
  select * into v_job
  from public.promotional_voucher_email_jobs
  where id = p_job_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;

  if v_job.status = 'sent' and p_success is true then
    return jsonb_build_object('ok', true, 'idempotent', true, 'status', 'sent');
  end if;

  update public.promotional_voucher_email_jobs
  set
    attempt_count = attempt_count + 1,
    last_attempt_at = now(),
    provider_message_id = case
      when p_success then coalesce(p_provider_message_id, provider_message_id)
      else provider_message_id
    end,
    last_error = case when p_success then null else left(coalesce(p_error, 'delivery_failed'), 500) end,
    status = case when p_success then 'sent' else 'failed' end,
    accepted_at = case when p_success then now() else accepted_at end
  where id = p_job_id
  returning * into v_job;

  update public.promotional_voucher_claims
  set status = case when p_success then 'email_sent' else 'email_failed' end
  where id = v_job.claim_id;

  return jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'status', v_job.status,
    'attemptCount', v_job.attempt_count
  );
end;
$$;

revoke all on function public.mark_voucher_email_job_result(uuid, boolean, text, text)
  from public, anon, authenticated;
grant execute on function public.mark_voucher_email_job_result(uuid, boolean, text, text)
  to service_role;

comment on table public.promotional_issuance_config is
  'Final B demo vs approved_live issuance gates. Does not activate 4C reward campaigns.';
comment on table public.promotional_voucher_claims is
  'One promotional voucher claim per normalized email per campaign. PII — not public.';
comment on table public.promotional_vouchers is
  'Server-issued voucher codes. Demo codes are non-redeemable by default.';
comment on table public.promotional_voucher_email_jobs is
  'Transactional email delivery jobs. Retry delivery without re-issuing vouchers.';
comment on function public.issue_campaign_voucher_claim is
  'Atomic service-role voucher claim. Reward amount from server decision only.';

commit;
