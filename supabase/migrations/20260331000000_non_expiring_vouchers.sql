-- Phase B: explicit non-expiring voucher support for approved-live issuance.
-- expires_at NULL = no expiry. voucher_ttl_days NULL = issue with no expiry.
-- Does NOT flip mode/real_redeemable and does NOT rewrite existing expires_at values.
-- Launch (separate approval): SET voucher_ttl_days = NULL for event-three-rooftop-v1
-- when enabling approved_live + real_redeemable.

-- ---------------------------------------------------------------------------
-- Schema: allow NULL expiry / NULL TTL
-- ---------------------------------------------------------------------------
alter table public.promotional_vouchers
  alter column expires_at drop not null;

comment on column public.promotional_vouchers.expires_at is
  'When set, voucher expires at this instant. NULL means no expiry (non-expiring voucher).';

alter table public.promotional_issuance_config
  drop constraint if exists promotional_issuance_config_ttl_check;

alter table public.promotional_issuance_config
  alter column voucher_ttl_days drop not null;

alter table public.promotional_issuance_config
  alter column voucher_ttl_days drop default;

alter table public.promotional_issuance_config
  alter column voucher_ttl_days set default 90;

alter table public.promotional_issuance_config
  add constraint promotional_issuance_config_ttl_check check (
    voucher_ttl_days is null
    or voucher_ttl_days between 1 and 3650
  );

comment on column public.promotional_issuance_config.voucher_ttl_days is
  'Days until expiry for newly issued vouchers. NULL = issue non-expiring vouchers (expires_at NULL). Existing rows are never rewritten by this setting.';

-- ---------------------------------------------------------------------------
-- Issue RPC: NULL TTL → NULL expires_at; preserve adult gate for approved_live
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

  -- approved_live requires explicit adult attestation (collected in claim UI).
  if v_config.mode = 'approved_live' and coalesce(p_adult_self_attested, false) is not true then
    return jsonb_build_object('ok', false, 'code', 'adult_attestation_required', 'message', 'Adult self-attestation is required for approved live issuance.');
  end if;

  if p_terms_version is distinct from v_config.terms_version then
    return jsonb_build_object('ok', false, 'code', 'terms_version_mismatch', 'message', 'Promotional terms version mismatch.');
  end if;

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
    return jsonb_build_object(
      'ok', false,
      'code', 'email_already_used',
      'message', 'This email has already been used for this promotion.'
    );
  end if;

  v_redeemable := (v_config.mode = 'approved_live' and v_config.real_redeemable is true);
  -- NULL voucher_ttl_days => non-expiring (expires_at NULL). Never invent a future date.
  if v_config.voucher_ttl_days is null then
    v_expires_at := null;
  else
    v_expires_at := now() + make_interval(days => v_config.voucher_ttl_days);
  end if;

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
      coalesce(nullif(trim(coalesce(p_phone, '')), ''), ''),
      v_config.terms_version,
      coalesce(p_adult_self_attested, false),
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

-- ---------------------------------------------------------------------------
-- Staff view + lookup/redeem: NULL expires_at never fails expiry checks
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
  if v_status = 'issued'
     and v_voucher.expires_at is not null
     and v_voucher.expires_at <= now() then
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

  if v_voucher.status = 'expired'
     or (
       v_voucher.expires_at is not null
       and v_voucher.expires_at <= v_now
     ) then
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
