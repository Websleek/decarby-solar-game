-- Phase 4C.1 — promotional rewards rules + database architecture (foundation only).
-- No public claim endpoint. No redeemable codes/payments. Demo rows are inactive.
-- Document before apply. Do not auto-deploy from the agent.

begin;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
do $$ begin
  create type public.reward_campaign_lifecycle as enum (
    'draft',
    'scheduled',
    'active',
    'paused',
    'expired',
    'archived'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.reward_publishing_status as enum (
    'draft',
    'published',
    'archived'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.reward_type as enum (
    'consultation_benefit',
    'fixed_discount',
    'percentage_discount',
    'voucher',
    'special_offer'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.reward_claim_status as enum (
    'pending',
    'approved',
    'rejected',
    'redeemed',
    'expired',
    'cancelled'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.reward_audit_event_type as enum (
    'eligibility_checked',
    'claim_requested',
    'claim_approved',
    'claim_rejected',
    'claim_redeemed',
    'claim_expired',
    'campaign_updated'
  );
exception when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- reward_campaigns
-- ---------------------------------------------------------------------------
create table if not exists public.reward_campaigns (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  title text not null,
  description text not null default '',
  lifecycle_status public.reward_campaign_lifecycle not null default 'draft',
  starts_at timestamptz,
  ends_at timestamptz,
  public_catalog boolean not null default false,
  default_one_claim_per_player_reward boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reward_campaigns_slug_length check (char_length(slug) between 3 and 64),
  constraint reward_campaigns_title_length check (char_length(title) between 3 and 120),
  constraint reward_campaigns_window_check check (
    ends_at is null or starts_at is null or ends_at >= starts_at
  ),
  constraint reward_campaigns_slug_uidx unique (slug)
);

create index if not exists reward_campaigns_lifecycle_idx
  on public.reward_campaigns (lifecycle_status, public_catalog);

create trigger reward_campaigns_set_updated_at
before update on public.reward_campaigns
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- reward_definitions
-- ---------------------------------------------------------------------------
create table if not exists public.reward_definitions (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.reward_campaigns (id) on delete cascade,
  slug text not null,
  title text not null,
  short_description text not null default '',
  reward_type public.reward_type not null,
  illustrative_amount_cents integer,
  currency text not null default 'AUD',
  percentage_basis_points integer,
  eligibility jsonb not null,
  publishing_status public.reward_publishing_status not null default 'draft',
  public_catalog boolean not null default false,
  claims_enabled boolean not null default false,
  display_order integer not null default 100,
  per_player_limit integer not null default 1,
  capacity_limit integer,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reward_definitions_slug_length check (char_length(slug) between 3 and 64),
  constraint reward_definitions_title_length check (char_length(title) between 3 and 120),
  constraint reward_definitions_currency_aud check (currency = 'AUD'),
  constraint reward_definitions_amount_cents_check check (
    illustrative_amount_cents is null
    or (
      illustrative_amount_cents >= 0
      and illustrative_amount_cents <= 100000000
    )
  ),
  constraint reward_definitions_percentage_check check (
    (
      reward_type = 'percentage_discount'
      and percentage_basis_points is not null
      and percentage_basis_points between 1 and 10000
    )
    or (
      reward_type <> 'percentage_discount'
      and percentage_basis_points is null
    )
  ),
  constraint reward_definitions_per_player_limit_check check (per_player_limit >= 1),
  constraint reward_definitions_capacity_limit_check check (
    capacity_limit is null or capacity_limit >= 1
  ),
  constraint reward_definitions_eligibility_object check (
    jsonb_typeof(eligibility) = 'object'
    and eligibility ? 'kind'
    and char_length(eligibility ->> 'kind') between 2 and 64
  ),
  constraint reward_definitions_campaign_slug_uidx unique (campaign_id, slug)
);

create index if not exists reward_definitions_campaign_status_idx
  on public.reward_definitions (campaign_id, publishing_status, public_catalog, claims_enabled);

create index if not exists reward_definitions_display_order_idx
  on public.reward_definitions (campaign_id, display_order asc);

create trigger reward_definitions_set_updated_at
before update on public.reward_definitions
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- player_reward_claims (foundation only — no public claim RPC in 4C.1)
-- Default campaign policy: one claim per player per reward.
-- Future controlled multi-claim policies must add explicit unique indexes.
-- ---------------------------------------------------------------------------
create table if not exists public.player_reward_claims (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.player_profiles (id) on delete cascade,
  reward_id uuid not null references public.reward_definitions (id) on delete restrict,
  campaign_id uuid not null references public.reward_campaigns (id) on delete restrict,
  status public.reward_claim_status not null default 'pending',
  claim_policy text not null default 'one_per_player_reward',
  eligibility_snapshot jsonb not null default '{}'::jsonb,
  redemption_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  decided_at timestamptz,
  redeemed_at timestamptz,
  expires_at timestamptz,
  constraint player_reward_claims_policy_check check (
    claim_policy in ('one_per_player_reward', 'campaign_controlled')
  ),
  constraint player_reward_claims_redemption_check check (
    (status <> 'redeemed' and redeemed_at is null)
    or (status = 'redeemed' and redeemed_at is not null)
  ),
  -- Default idempotent uniqueness for one-claim campaigns.
  constraint player_reward_claims_player_reward_uidx unique (player_id, reward_id)
);

create index if not exists player_reward_claims_player_status_idx
  on public.player_reward_claims (player_id, status, created_at desc);

create index if not exists player_reward_claims_reward_status_idx
  on public.player_reward_claims (reward_id, status);

create index if not exists player_reward_claims_campaign_status_idx
  on public.player_reward_claims (campaign_id, status);

create trigger player_reward_claims_set_updated_at
before update on public.player_reward_claims
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- reward_audit_events (immutable append-only foundation)
-- Do not store secrets, raw tokens, or unnecessary PII in payload.
-- ---------------------------------------------------------------------------
create table if not exists public.reward_audit_events (
  id uuid primary key default gen_random_uuid(),
  event_type public.reward_audit_event_type not null,
  campaign_id uuid references public.reward_campaigns (id) on delete set null,
  reward_id uuid references public.reward_definitions (id) on delete set null,
  claim_id uuid references public.player_reward_claims (id) on delete set null,
  player_id uuid references public.player_profiles (id) on delete set null,
  actor_role text not null default 'system',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint reward_audit_events_actor_role_check check (
    actor_role in ('system', 'service_role', 'player', 'admin')
  ),
  constraint reward_audit_events_payload_object check (jsonb_typeof(payload) = 'object')
);

create index if not exists reward_audit_events_type_created_idx
  on public.reward_audit_events (event_type, created_at desc);

create index if not exists reward_audit_events_player_created_idx
  on public.reward_audit_events (player_id, created_at desc);

create index if not exists reward_audit_events_reward_created_idx
  on public.reward_audit_events (reward_id, created_at desc);

create or replace function public.reward_audit_events_deny_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'reward_audit_events are immutable';
end;
$$;

drop trigger if exists reward_audit_events_no_update on public.reward_audit_events;
create trigger reward_audit_events_no_update
before update on public.reward_audit_events
for each row execute function public.reward_audit_events_deny_mutation();

drop trigger if exists reward_audit_events_no_delete on public.reward_audit_events;
create trigger reward_audit_events_no_delete
before delete on public.reward_audit_events
for each row execute function public.reward_audit_events_deny_mutation();

revoke all on function public.reward_audit_events_deny_mutation() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.reward_campaigns enable row level security;
alter table public.reward_definitions enable row level security;
alter table public.player_reward_claims enable row level security;
alter table public.reward_audit_events enable row level security;

-- Guests/authenticated may read only deliberately public, published, active
-- non-sensitive campaign/reward catalog rows (enabled in later phases).
drop policy if exists reward_campaigns_select_public_active on public.reward_campaigns;
create policy reward_campaigns_select_public_active
  on public.reward_campaigns
  for select
  to anon, authenticated
  using (
    public_catalog = true
    and lifecycle_status = 'active'
    and (starts_at is null or starts_at <= now())
    and (ends_at is null or ends_at >= now())
  );

drop policy if exists reward_definitions_select_public_published on public.reward_definitions;
create policy reward_definitions_select_public_published
  on public.reward_definitions
  for select
  to anon, authenticated
  using (
    public_catalog = true
    and publishing_status = 'published'
    and exists (
      select 1
      from public.reward_campaigns c
      where c.id = reward_definitions.campaign_id
        and c.public_catalog = true
        and c.lifecycle_status = 'active'
        and (c.starts_at is null or c.starts_at <= now())
        and (c.ends_at is null or c.ends_at >= now())
    )
  );

-- Player-specific claim reads: authenticated owner only.
drop policy if exists player_reward_claims_select_own on public.player_reward_claims;
create policy player_reward_claims_select_own
  on public.player_reward_claims
  for select
  to authenticated
  using (
    player_id in (
      select id from public.player_profiles where user_id = auth.uid()
    )
  );

-- No client policies for insert/update/delete on any reward table.
-- No client select on audit events.

-- ---------------------------------------------------------------------------
-- Grants (least privilege). Service role bypasses RLS for trusted writers.
-- ---------------------------------------------------------------------------
revoke all on table public.reward_campaigns from public, anon, authenticated;
revoke all on table public.reward_definitions from public, anon, authenticated;
revoke all on table public.player_reward_claims from public, anon, authenticated;
revoke all on table public.reward_audit_events from public, anon, authenticated;

grant select on table public.reward_campaigns to anon, authenticated, service_role;
grant select on table public.reward_definitions to anon, authenticated, service_role;
grant select on table public.player_reward_claims to authenticated, service_role;
grant select on table public.reward_audit_events to service_role;

-- Trusted server mutations (Edge / service_role). Clients must not write.
grant insert, update, delete on table public.reward_campaigns to service_role;
grant insert, update, delete on table public.reward_definitions to service_role;
grant insert, update, delete on table public.player_reward_claims to service_role;
grant insert on table public.reward_audit_events to service_role;
-- No update/delete grant on audit events for anyone except via superuser/migration.

-- ---------------------------------------------------------------------------
-- Inactive demo seed (development placeholders — not live offers)
-- ---------------------------------------------------------------------------
insert into public.reward_campaigns (
  id,
  slug,
  title,
  description,
  lifecycle_status,
  starts_at,
  ends_at,
  public_catalog,
  default_one_claim_per_player_reward,
  metadata
)
values (
  '00000000-0000-4000-8000-0000000004c1',
  'phase4c1-dev-placeholders',
  'Phase 4C.1 Development Placeholders',
  'Inactive example promotional rewards for architecture and eligibility tests. Not live offers.',
  'draft',
  null,
  null,
  false,
  true,
  jsonb_build_object(
    'phase', '4C.1',
    'redeemable', false,
    'approvedCustomerOffer', false
  )
)
on conflict (id) do nothing;

insert into public.reward_definitions (
  id,
  campaign_id,
  slug,
  title,
  short_description,
  reward_type,
  illustrative_amount_cents,
  currency,
  percentage_basis_points,
  eligibility,
  publishing_status,
  public_catalog,
  claims_enabled,
  display_order,
  per_player_limit,
  capacity_limit,
  metadata
)
values
  (
    '00000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-0000000004c1',
    'solar-starter-consultation',
    'Solar Starter consultation benefit',
    'Example consultation benefit tied to the verified Solar Starter achievement. Development placeholder only.',
    'consultation_benefit',
    null,
    'AUD',
    null,
    jsonb_build_object('kind', 'achievement', 'achievementId', 'solar_starter'),
    'draft',
    false,
    false,
    10,
    1,
    null,
    jsonb_build_object('illustrative', true, 'redeemable', false, 'approvedCustomerOffer', false)
  ),
  (
    '00000000-0000-4000-8000-000000000102',
    '00000000-0000-4000-8000-0000000004c1',
    'star-collector-example-100',
    'Star Collector example A$100 discount',
    'Illustrative fixed discount example requiring verified Classic stars. Not redeemable.',
    'fixed_discount',
    10000,
    'AUD',
    null,
    jsonb_build_object('kind', 'verified_stars_at_least', 'minStars', 10),
    'draft',
    false,
    false,
    20,
    1,
    null,
    jsonb_build_object('illustrative', true, 'redeemable', false, 'approvedCustomerOffer', false)
  ),
  (
    '00000000-0000-4000-8000-000000000103',
    '00000000-0000-4000-8000-0000000004c1',
    'solar-champion-example-250',
    'Solar Champion example A$250 discount',
    'Illustrative fixed discount requiring verified champion achievement and rooftop completions. Not redeemable.',
    'fixed_discount',
    25000,
    'AUD',
    null,
    jsonb_build_object(
      'kind', 'all',
      'rules', jsonb_build_array(
        jsonb_build_object('kind', 'achievement', 'achievementId', 'solar_champion'),
        jsonb_build_object('kind', 'verified_rooftops_at_least', 'minRooftops', 5)
      )
    ),
    'draft',
    false,
    false,
    30,
    1,
    null,
    jsonb_build_object('illustrative', true, 'redeemable', false, 'approvedCustomerOffer', false)
  ),
  (
    '00000000-0000-4000-8000-000000000104',
    '00000000-0000-4000-8000-0000000004c1',
    'solar-legend-example-500',
    'Solar Legend example A$500 discount',
    'Illustrative top-tier placeholder. Requires verified max stars or a finalised leaderboard standing. Not redeemable.',
    'fixed_discount',
    50000,
    'AUD',
    null,
    jsonb_build_object(
      'kind', 'any',
      'rules', jsonb_build_array(
        jsonb_build_object('kind', 'verified_stars_at_least', 'minStars', 15),
        jsonb_build_object(
          'kind', 'leaderboard_rank_at_most',
          'board', 'overall',
          'maxRank', 10,
          'requiresFinalisedSnapshot', true
        )
      )
    ),
    'draft',
    false,
    false,
    40,
    1,
    100,
    jsonb_build_object('illustrative', true, 'redeemable', false, 'approvedCustomerOffer', false)
  )
on conflict (id) do nothing;

comment on table public.reward_campaigns is
  'Phase 4C.1 promotional campaigns. Clients cannot mutate. Demo campaign is draft/inactive.';
comment on table public.reward_definitions is
  'Phase 4C.1 reward definitions. illustrative_amount_cents is never redeemable in 4C.1.';
comment on table public.player_reward_claims is
  'Future claim inventory. No public claim endpoint in 4C.1. Unique (player_id, reward_id) default policy.';
comment on table public.reward_audit_events is
  'Immutable audit foundation. Claim-event persistence lands when claims are enabled.';

commit;
