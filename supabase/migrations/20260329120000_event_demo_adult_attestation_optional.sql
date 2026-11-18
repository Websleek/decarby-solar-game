-- Event mode: demo claims may omit the separate adult checkbox.
-- Stores adult_self_attested honestly (false when not collected).
-- approved_live issuance still requires adult_self_attested = true.
-- LEGAL FLAG: Do not enable real_redeemable / approved_live until Decarby confirms
-- an age-eligibility collection method that replaces the removed event UI checkbox.

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

  -- Demo/event: adult checkbox removed from UI; store honest false.
  -- approved_live still requires explicit adult attestation before redeemable issuance.
  if v_config.mode = 'approved_live' and coalesce(p_adult_self_attested, false) is not true then
    return jsonb_build_object('ok', false, 'code', 'adult_attestation_required', 'message', 'Adult self-attestation is required for approved live issuance.');
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
