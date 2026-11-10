-- Phase 4C.2 — secure promotional reward claim workflow (service_role only).
-- No public/anonymous claim RPC. No voucher codes. No live campaign activation.
-- Demo rewards remain claims_enabled=false. Document before apply.

begin;

-- Note: cancellation audits reuse claim_rejected with payload.action = 'cancelled'
-- to avoid same-transaction enum ADD VALUE limitations. Claim status 'cancelled' remains valid.

-- ---------------------------------------------------------------------------
-- Claim status transition helper (shared by RPCs)
-- ---------------------------------------------------------------------------
create or replace function public.reward_claim_transition_allowed(
  p_from public.reward_claim_status,
  p_to public.reward_claim_status
)
returns boolean
language sql
immutable
as $$
  select case
    when p_from = p_to then false
    when p_from = 'pending' and p_to in ('approved', 'rejected', 'cancelled', 'expired') then true
    when p_from = 'approved' and p_to in ('redeemed', 'cancelled', 'expired') then true
    else false
  end;
$$;

revoke all on function public.reward_claim_transition_allowed(
  public.reward_claim_status,
  public.reward_claim_status
) from public, anon, authenticated;
grant execute on function public.reward_claim_transition_allowed(
  public.reward_claim_status,
  public.reward_claim_status
) to service_role;

-- ---------------------------------------------------------------------------
-- Atomic claim request (service_role only).
-- Caller must already resolve player ownership and evaluate eligibility from
-- server-authoritative records. This RPC still fail-closes on campaign/reward
-- gates, adult/consent flags, capacity, and uniqueness.
-- Does NOT issue vouchers, codes, or mark claims redeemed.
-- ---------------------------------------------------------------------------
create or replace function public.request_player_reward_claim(
  p_player_id uuid,
  p_reward_id uuid,
  p_adult_confirmed boolean,
  p_consent_granted boolean,
  p_eligibility_snapshot jsonb default '{}'::jsonb,
  p_actor_role text default 'service_role'
)
returns table (
  claim_id uuid,
  claim_status public.reward_claim_status,
  inserted boolean,
  rejection_code text,
  rejection_reason text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campaign public.reward_campaigns%rowtype;
  v_reward public.reward_definitions%rowtype;
  v_existing public.player_reward_claims%rowtype;
  v_claim public.player_reward_claims%rowtype;
  v_player_moderation public.moderation_status;
  v_policy text;
  v_consuming_player integer;
  v_consuming_reward integer;
  v_snapshot jsonb;
begin
  if p_player_id is null or p_reward_id is null then
    return query select null::uuid, null::public.reward_claim_status, false,
      'missing_profile'::text, 'player_id and reward_id are required'::text;
    return;
  end if;

  if coalesce(p_actor_role, '') not in ('system', 'service_role', 'admin') then
    return query select null::uuid, null::public.reward_claim_status, false,
      'unauthorized'::text, 'Claim mutations require a trusted actor role'::text;
    return;
  end if;

  select moderation_status into v_player_moderation
  from public.player_profiles
  where id = p_player_id;

  if not found then
    return query select null::uuid, null::public.reward_claim_status, false,
      'missing_profile'::text, 'Player profile not found'::text;
    return;
  end if;

  if v_player_moderation is distinct from 'active' then
    return query select null::uuid, null::public.reward_claim_status, false,
      'moderation_blocked'::text, 'Player profile is not active'::text;
    return;
  end if;

  if p_adult_confirmed is distinct from true then
    return query select null::uuid, null::public.reward_claim_status, false,
      'adult_verification_required'::text,
      'Adult verification is required before promotional claims can proceed'::text;
    return;
  end if;

  if p_consent_granted is distinct from true then
    return query select null::uuid, null::public.reward_claim_status, false,
      'consent_required'::text,
      'Promotional claim consent is required before a claim can be recorded'::text;
    return;
  end if;

  select * into v_reward
  from public.reward_definitions
  where id = p_reward_id
  for update;

  if not found then
    return query select null::uuid, null::public.reward_claim_status, false,
      'unauthorized'::text, 'Reward definition not found'::text;
    return;
  end if;

  select * into v_campaign
  from public.reward_campaigns
  where id = v_reward.campaign_id
  for update;

  if not found then
    return query select null::uuid, null::public.reward_claim_status, false,
      'campaign_inactive'::text, 'Campaign not found'::text;
    return;
  end if;

  if v_reward.claims_enabled is distinct from true then
    return query select null::uuid, null::public.reward_claim_status, false,
      'claims_disabled'::text, 'Reward claims are not enabled for this definition'::text;
    return;
  end if;

  if v_reward.publishing_status is distinct from 'published' then
    return query select null::uuid, null::public.reward_claim_status, false,
      'reward_unpublished'::text, 'Reward is not published'::text;
    return;
  end if;

  if v_campaign.lifecycle_status is distinct from 'active' then
    if v_campaign.lifecycle_status in ('expired', 'archived') then
      return query select null::uuid, null::public.reward_claim_status, false,
        'campaign_expired'::text, 'Campaign is expired or archived'::text;
      return;
    end if;
    return query select null::uuid, null::public.reward_claim_status, false,
      'campaign_inactive'::text,
      'Campaign is not active'::text;
    return;
  end if;

  if v_campaign.starts_at is not null and v_campaign.starts_at > now() then
    return query select null::uuid, null::public.reward_claim_status, false,
      'campaign_inactive'::text, 'Campaign has not started yet'::text;
    return;
  end if;

  if v_campaign.ends_at is not null and v_campaign.ends_at < now() then
    return query select null::uuid, null::public.reward_claim_status, false,
      'campaign_expired'::text, 'Campaign end date has passed'::text;
    return;
  end if;

  -- Idempotent duplicate: return existing claim without creating inventory again.
  select * into v_existing
  from public.player_reward_claims
  where player_id = p_player_id
    and reward_id = p_reward_id;

  if found then
    insert into public.reward_audit_events (
      event_type, campaign_id, reward_id, claim_id, player_id, actor_role, payload
    ) values (
      'eligibility_checked',
      v_campaign.id,
      v_reward.id,
      v_existing.id,
      p_player_id,
      p_actor_role,
      jsonb_build_object('duplicate', true, 'existingStatus', v_existing.status)
    );

    return query select v_existing.id, v_existing.status, false, null::text, null::text;
    return;
  end if;

  select count(*)::integer into v_consuming_player
  from public.player_reward_claims
  where player_id = p_player_id
    and reward_id = p_reward_id
    and status in ('pending', 'approved', 'redeemed');

  if v_consuming_player >= v_reward.per_player_limit then
    return query select null::uuid, null::public.reward_claim_status, false,
      'per_player_limit'::text, 'Per-player claim limit reached'::text;
    return;
  end if;

  if v_reward.capacity_limit is not null then
    select count(*)::integer into v_consuming_reward
    from public.player_reward_claims
    where reward_id = p_reward_id
      and status in ('pending', 'approved', 'redeemed');

    if v_consuming_reward >= v_reward.capacity_limit then
      return query select null::uuid, null::public.reward_claim_status, false,
        'capacity_exhausted'::text, 'Reward capacity exhausted'::text;
      return;
    end if;
  end if;

  v_policy := case
    when v_campaign.default_one_claim_per_player_reward then 'one_per_player_reward'
    else 'campaign_controlled'
  end;

  v_snapshot := coalesce(p_eligibility_snapshot, '{}'::jsonb)
    || jsonb_build_object(
      'adultConfirmed', true,
      'consentGranted', true,
      'voucherIssued', false,
      'redeemable', false
    );

  begin
    insert into public.player_reward_claims (
      player_id,
      reward_id,
      campaign_id,
      status,
      claim_policy,
      eligibility_snapshot,
      redemption_metadata
    ) values (
      p_player_id,
      p_reward_id,
      v_campaign.id,
      'pending',
      v_policy,
      v_snapshot,
      jsonb_build_object(
        'voucherIssued', false,
        'redeemable', false,
        'monetaryValueIssued', false
      )
    )
    returning * into v_claim;
  exception when unique_violation then
    select * into v_existing
    from public.player_reward_claims
    where player_id = p_player_id
      and reward_id = p_reward_id;

    if found then
      return query select v_existing.id, v_existing.status, false, null::text, null::text;
      return;
    end if;
    raise;
  end;

  insert into public.reward_audit_events (
    event_type, campaign_id, reward_id, claim_id, player_id, actor_role, payload
  ) values
    (
      'eligibility_checked',
      v_campaign.id,
      v_reward.id,
      v_claim.id,
      p_player_id,
      p_actor_role,
      jsonb_build_object('eligible', true, 'source', 'service_role_precheck')
    ),
    (
      'claim_requested',
      v_campaign.id,
      v_reward.id,
      v_claim.id,
      p_player_id,
      p_actor_role,
      jsonb_build_object(
        'status', 'pending',
        'duplicate', false,
        'voucherIssued', false
      )
    );

  return query select v_claim.id, v_claim.status, true, null::text, null::text;
end;
$$;

revoke all on function public.request_player_reward_claim(
  uuid, uuid, boolean, boolean, jsonb, text
) from public, anon, authenticated;
grant execute on function public.request_player_reward_claim(
  uuid, uuid, boolean, boolean, jsonb, text
) to service_role;

-- ---------------------------------------------------------------------------
-- Controlled status transition (service_role only). Never issues voucher codes.
-- ---------------------------------------------------------------------------
create or replace function public.transition_player_reward_claim(
  p_claim_id uuid,
  p_to_status public.reward_claim_status,
  p_reason text default null,
  p_actor_role text default 'service_role'
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
  v_claim public.player_reward_claims%rowtype;
  v_from public.reward_claim_status;
  v_event public.reward_audit_event_type;
begin
  if coalesce(p_actor_role, '') not in ('system', 'service_role', 'admin') then
    return query select null::uuid, null::public.reward_claim_status, null::public.reward_claim_status,
      false, 'unauthorized'::text, 'Claim mutations require a trusted actor role'::text;
    return;
  end if;

  select * into v_claim
  from public.player_reward_claims
  where id = p_claim_id
  for update;

  if not found then
    return query select null::uuid, null::public.reward_claim_status, null::public.reward_claim_status,
      false, 'unauthorized'::text, 'Claim not found'::text;
    return;
  end if;

  v_from := v_claim.status;

  if not public.reward_claim_transition_allowed(v_from, p_to_status) then
    return query select v_claim.id, v_from, p_to_status, false,
      'invalid_transition'::text,
      format('Invalid claim transition: %s -> %s', v_from, p_to_status)::text;
    return;
  end if;

  update public.player_reward_claims
  set
    status = p_to_status,
    decided_at = case
      when p_to_status in ('approved', 'rejected', 'cancelled') then now()
      else decided_at
    end,
    redeemed_at = case
      when p_to_status = 'redeemed' then now()
      else redeemed_at
    end,
    expires_at = case
      when p_to_status = 'expired' then now()
      else expires_at
    end,
    redemption_metadata = redemption_metadata
      || jsonb_build_object(
        'voucherIssued', false,
        'redeemable', false,
        'lastTransitionReason', nullif(p_reason, '')
      )
  where id = v_claim.id
  returning * into v_claim;

  v_event := case p_to_status
    when 'approved' then 'claim_approved'::public.reward_audit_event_type
    when 'rejected' then 'claim_rejected'::public.reward_audit_event_type
    when 'redeemed' then 'claim_redeemed'::public.reward_audit_event_type
    when 'expired' then 'claim_expired'::public.reward_audit_event_type
    when 'cancelled' then 'claim_rejected'::public.reward_audit_event_type
    else 'claim_requested'::public.reward_audit_event_type
  end;

  insert into public.reward_audit_events (
    event_type, campaign_id, reward_id, claim_id, player_id, actor_role, payload
  ) values (
    v_event,
    v_claim.campaign_id,
    v_claim.reward_id,
    v_claim.id,
    v_claim.player_id,
    p_actor_role,
    jsonb_build_object(
      'from', v_from,
      'to', p_to_status,
      'reason', nullif(p_reason, ''),
      'voucherIssued', false,
      'action', case when p_to_status = 'cancelled' then 'cancelled' else p_to_status::text end
    )
  );

  return query select v_claim.id, v_from, p_to_status, true, null::text, null::text;
end;
$$;

revoke all on function public.transition_player_reward_claim(
  uuid, public.reward_claim_status, text, text
) from public, anon, authenticated;
grant execute on function public.transition_player_reward_claim(
  uuid, public.reward_claim_status, text, text
) to service_role;

comment on function public.request_player_reward_claim(uuid, uuid, boolean, boolean, jsonb, text) is
  'Phase 4C.2 service_role-only claim request. No public execute. No voucher issuance.';
comment on function public.transition_player_reward_claim(uuid, public.reward_claim_status, text, text) is
  'Phase 4C.2 service_role-only claim transitions with explicit allow-list.';

commit;
