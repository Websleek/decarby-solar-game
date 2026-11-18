-- Staff voucher verification / redemption (lookup + atomic redeem).
-- Does NOT enable real_redeemable or change issuance mode.
-- RPCs are service_role-only; staff password sessions live on the same-origin API.

-- ---------------------------------------------------------------------------
-- redeemed_at on promotional vouchers
-- ---------------------------------------------------------------------------
alter table public.promotional_vouchers
  add column if not exists redeemed_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'promotional_vouchers_redeemed_at_consistency'
  ) then
    alter table public.promotional_vouchers
      add constraint promotional_vouchers_redeemed_at_consistency
      check (
        (status = 'redeemed' and redeemed_at is not null)
        or (status <> 'redeemed' and redeemed_at is null)
      );
  end if;
end $$;

comment on column public.promotional_vouchers.redeemed_at is
  'Set once when staff redeems a live voucher; immutable thereafter.';

-- ---------------------------------------------------------------------------
-- Immutable redemption audit events (no player PII)
-- ---------------------------------------------------------------------------
create table if not exists public.promotional_voucher_redemption_events (
  id uuid primary key default gen_random_uuid(),
  voucher_id uuid not null references public.promotional_vouchers (id) on delete restrict,
  event_type text not null,
  actor_kind text not null default 'staff_password',
  actor_session_jti text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint promotional_voucher_redemption_events_type_check check (
    event_type in ('redeemed', 'redeem_rejected')
  ),
  constraint promotional_voucher_redemption_events_actor_check check (
    actor_kind in ('staff_password')
  )
);

create index if not exists promotional_voucher_redemption_events_voucher_idx
  on public.promotional_voucher_redemption_events (voucher_id, created_at desc);

alter table public.promotional_voucher_redemption_events enable row level security;

revoke all on table public.promotional_voucher_redemption_events from public, anon, authenticated;
grant select, insert on table public.promotional_voucher_redemption_events to service_role;

-- Block updates/deletes on audit rows.
create or replace function public.prevent_promotional_voucher_redemption_event_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'promotional_voucher_redemption_events are immutable';
end;
$$;

drop trigger if exists promotional_voucher_redemption_events_no_update
  on public.promotional_voucher_redemption_events;
create trigger promotional_voucher_redemption_events_no_update
before update or delete on public.promotional_voucher_redemption_events
for each row execute function public.prevent_promotional_voucher_redemption_event_mutation();

-- ---------------------------------------------------------------------------
-- Login rate-limit buckets (shared staff password brute-force protection)
-- ---------------------------------------------------------------------------
create table if not exists public.staff_password_attempt_buckets (
  bucket_key text primary key,
  window_started_at timestamptz not null default now(),
  attempt_count integer not null default 0,
  locked_until timestamptz,
  updated_at timestamptz not null default now(),
  constraint staff_password_attempt_buckets_count_check check (
    attempt_count >= 0 and attempt_count <= 100000
  )
);

alter table public.staff_password_attempt_buckets enable row level security;

revoke all on table public.staff_password_attempt_buckets from public, anon, authenticated;
grant select, insert, update, delete on table public.staff_password_attempt_buckets to service_role;

-- ---------------------------------------------------------------------------
-- Sanitized voucher view helper (no player PII)
-- ---------------------------------------------------------------------------
create or replace function public.staff_voucher_public_view(v public.promotional_vouchers)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'code', v.code,
    'exists', true,
    'amountCents', v.amount_cents,
    'currency', v.currency,
    'campaignId', v.campaign_id,
    'rewardTierId', v.reward_tier_id,
    'issuedAt', v.issued_at,
    'expiresAt', v.expires_at,
    'status', v.status,
    'demo', v.demo,
    'redeemable', v.redeemable,
    'redeemedAt', v.redeemed_at
  );
$$;

revoke all on function public.staff_voucher_public_view(public.promotional_vouchers) from public, anon, authenticated;
grant execute on function public.staff_voucher_public_view(public.promotional_vouchers) to service_role;

-- ---------------------------------------------------------------------------
-- Lookup by normalized code
-- ---------------------------------------------------------------------------
create or replace function public.staff_lookup_promotional_voucher(
  p_code_normalized text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_voucher public.promotional_vouchers%rowtype;
  v_status text;
begin
  if coalesce(p_code_normalized, '') = '' then
    return jsonb_build_object(
      'ok', false,
      'code', 'invalid_code',
      'message', 'Enter a valid voucher code.'
    );
  end if;

  select * into v_voucher
  from public.promotional_vouchers
  where code = p_code_normalized;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'code', 'not_found',
      'message', 'No voucher matches that code.',
      'exists', false
    );
  end if;

  v_status := v_voucher.status;
  if v_status = 'issued' and v_voucher.expires_at <= now() then
    v_status := 'expired';
  end if;

  return jsonb_build_object(
    'ok', true,
    'exists', true,
    'displayStatus', v_status,
    'voucher', public.staff_voucher_public_view(v_voucher)
  );
end;
$$;

revoke all on function public.staff_lookup_promotional_voucher(text) from public, anon, authenticated;
grant execute on function public.staff_lookup_promotional_voucher(text) to service_role;

-- ---------------------------------------------------------------------------
-- Atomic redeem (FOR UPDATE + status gate + issuance config check)
-- ---------------------------------------------------------------------------
create or replace function public.staff_redeem_promotional_voucher(
  p_code_normalized text,
  p_actor_session_jti text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_voucher public.promotional_vouchers%rowtype;
  v_config public.promotional_issuance_config%rowtype;
  v_now timestamptz := now();
  v_updated public.promotional_vouchers%rowtype;
begin
  if coalesce(p_code_normalized, '') = '' then
    return jsonb_build_object(
      'ok', false,
      'code', 'invalid_code',
      'message', 'Enter a valid voucher code.'
    );
  end if;

  select * into v_voucher
  from public.promotional_vouchers
  where code = p_code_normalized
  for update;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'code', 'not_found',
      'message', 'No voucher matches that code.',
      'exists', false
    );
  end if;

  if v_voucher.status = 'redeemed' then
    insert into public.promotional_voucher_redemption_events (
      voucher_id, event_type, actor_kind, actor_session_jti, payload
    ) values (
      v_voucher.id,
      'redeem_rejected',
      'staff_password',
      nullif(p_actor_session_jti, ''),
      jsonb_build_object('reason', 'already_redeemed', 'redeemedAt', v_voucher.redeemed_at)
    );

    return jsonb_build_object(
      'ok', false,
      'code', 'already_redeemed',
      'message', 'This voucher has already been redeemed.',
      'displayStatus', 'redeemed',
      'voucher', public.staff_voucher_public_view(v_voucher)
    );
  end if;

  if v_voucher.status = 'void' then
    insert into public.promotional_voucher_redemption_events (
      voucher_id, event_type, actor_kind, actor_session_jti, payload
    ) values (
      v_voucher.id,
      'redeem_rejected',
      'staff_password',
      nullif(p_actor_session_jti, ''),
      jsonb_build_object('reason', 'void')
    );

    return jsonb_build_object(
      'ok', false,
      'code', 'void',
      'message', 'This voucher has been cancelled.',
      'displayStatus', 'void',
      'voucher', public.staff_voucher_public_view(v_voucher)
    );
  end if;

  if v_voucher.status = 'expired' or v_voucher.expires_at <= v_now then
    if v_voucher.status = 'issued' then
      update public.promotional_vouchers
      set status = 'expired'
      where id = v_voucher.id and status = 'issued'
      returning * into v_voucher;
    end if;

    insert into public.promotional_voucher_redemption_events (
      voucher_id, event_type, actor_kind, actor_session_jti, payload
    ) values (
      v_voucher.id,
      'redeem_rejected',
      'staff_password',
      nullif(p_actor_session_jti, ''),
      jsonb_build_object('reason', 'expired')
    );

    return jsonb_build_object(
      'ok', false,
      'code', 'expired',
      'message', 'This voucher has expired.',
      'displayStatus', 'expired',
      'voucher', public.staff_voucher_public_view(v_voucher)
    );
  end if;

  -- Persist flags + campaign issuance config (never trust DEMO- prefix alone).
  if v_voucher.demo is true or v_voucher.redeemable is not true then
    insert into public.promotional_voucher_redemption_events (
      voucher_id, event_type, actor_kind, actor_session_jti, payload
    ) values (
      v_voucher.id,
      'redeem_rejected',
      'staff_password',
      nullif(p_actor_session_jti, ''),
      jsonb_build_object(
        'reason', 'not_redeemable',
        'demo', v_voucher.demo,
        'redeemable', v_voucher.redeemable
      )
    );

    return jsonb_build_object(
      'ok', false,
      'code', 'not_redeemable',
      'message', 'This voucher is not redeemable (demo or non-live issuance).',
      'displayStatus', v_voucher.status,
      'voucher', public.staff_voucher_public_view(v_voucher)
    );
  end if;

  select * into v_config
  from public.promotional_issuance_config
  where campaign_id = v_voucher.campaign_id;

  if v_config is null
     or v_config.mode is distinct from 'approved_live'
     or v_config.claims_enabled is not true
     or v_config.real_redeemable is not true then
    insert into public.promotional_voucher_redemption_events (
      voucher_id, event_type, actor_kind, actor_session_jti, payload
    ) values (
      v_voucher.id,
      'redeem_rejected',
      'staff_password',
      nullif(p_actor_session_jti, ''),
      jsonb_build_object(
        'reason', 'issuance_not_live',
        'mode', coalesce(v_config.mode, 'missing'),
        'realRedeemable', coalesce(v_config.real_redeemable, false)
      )
    );

    return jsonb_build_object(
      'ok', false,
      'code', 'issuance_not_live',
      'message', 'Campaign issuance is not approved for live redemption.',
      'displayStatus', v_voucher.status,
      'voucher', public.staff_voucher_public_view(v_voucher)
    );
  end if;

  update public.promotional_vouchers
  set
    status = 'redeemed',
    redeemed_at = v_now
  where id = v_voucher.id
    and status = 'issued'
  returning * into v_updated;

  if not found then
    select * into v_voucher
    from public.promotional_vouchers
    where code = p_code_normalized;

    return jsonb_build_object(
      'ok', false,
      'code', 'already_redeemed',
      'message', 'This voucher has already been redeemed.',
      'displayStatus', coalesce(v_voucher.status, 'redeemed'),
      'voucher', case
        when v_voucher.id is null then null
        else public.staff_voucher_public_view(v_voucher)
      end
    );
  end if;

  update public.promotional_voucher_claims
  set status = 'redeemed'
  where id = v_updated.claim_id
    and status is distinct from 'redeemed';

  insert into public.promotional_voucher_redemption_events (
    voucher_id, event_type, actor_kind, actor_session_jti, payload
  ) values (
    v_updated.id,
    'redeemed',
    'staff_password',
    nullif(p_actor_session_jti, ''),
    jsonb_build_object(
      'redeemedAt', v_updated.redeemed_at,
      'amountCents', v_updated.amount_cents,
      'campaignId', v_updated.campaign_id
    )
  );

  return jsonb_build_object(
    'ok', true,
    'code', 'redeemed',
    'message', 'Voucher redeemed successfully.',
    'displayStatus', 'redeemed',
    'voucher', public.staff_voucher_public_view(v_updated)
  );
end;
$$;

revoke all on function public.staff_redeem_promotional_voucher(text, text) from public, anon, authenticated;
grant execute on function public.staff_redeem_promotional_voucher(text, text) to service_role;

comment on function public.staff_lookup_promotional_voucher(text) is
  'Staff voucher lookup returning sanitized fields only. service_role only.';
comment on function public.staff_redeem_promotional_voucher(text, text) is
  'Atomic staff redemption with row lock, live-issuance gates, and audit. service_role only.';
