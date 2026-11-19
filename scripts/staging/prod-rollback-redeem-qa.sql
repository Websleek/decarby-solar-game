-- SAFETY-REVIEWED — DO NOT RUN without explicit written approval for production execution.
-- Target: production project lrohmaodpqbmvgxsspql ONLY as one session: BEGIN … ROLLBACK.
--
-- Purpose: exercise staff_lookup / staff_redeem against isolated campaign
--          staff-redeem-test-v1 inside one transaction. No durable rows remain.
--
-- Guarantees intended by this script:
--   * No COMMIT
--   * Ends with ROLLBACK
--   * Does not UPDATE/DELETE event-three-rooftop-v1 issuance config
--   * Does not touch existing customer DEMO voucher rows
--   * Redeem RPC has no email/HTTP side effects
--
-- Limitations:
--   * Concurrent two-session race is NOT covered
--   * Deployed /code/ UI cannot see uncommitted rows
--
-- Execution: paste the ENTIRE file into Supabase SQL Editor (one Run) or psql as one script.
-- Do NOT use tools that auto-commit each statement separately.

begin;

-- Isolated issuance config only (rolled back)
insert into public.promotional_issuance_config (
  campaign_id, mode, claims_enabled, real_redeemable, terms_version, voucher_ttl_days
) values (
  'staff-redeem-test-v1', 'approved_live', true, true, 'promo-terms-v1', null
)
on conflict (campaign_id) do update set
  mode = excluded.mode,
  claims_enabled = excluded.claims_enabled,
  real_redeemable = excluded.real_redeemable,
  voucher_ttl_days = excluded.voucher_ttl_days,
  updated_at = now();

do $$
declare
  v_user_id uuid := gen_random_uuid();
  v_player_id uuid;
  v_run_id uuid;
  v_decision_id uuid;
  v_claim_id uuid;
  v_voucher_id uuid;
  v_demo_run_id uuid;
  v_demo_decision_id uuid;
  v_demo_claim_id uuid;
  v_code text := 'DSR-QA50-ROLL-BACK1';
  v_demo_code text := 'DEMO-QA50-ROLL-BACK1';
  v_lookup jsonb;
  v_first jsonb;
  v_second jsonb;
  v_demo_reject jsonb;
  v_redeemed_at timestamptz;
  v_redeemed_at_after timestamptz;
  v_event_count int;
  v_event_cfg_mode text;
  v_event_cfg_rr boolean;
begin
  -- Synthetic auth user + profile (rolled back). Requires pgcrypto (crypt/gen_salt).
  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) values (
    v_user_id,
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'staff-redeem-qa-rollback@example.invalid',
    crypt(gen_random_uuid()::text, gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"purpose":"staff-redeem-qa-rollback"}'::jsonb,
    now(),
    now()
  );

  insert into public.player_profiles (user_id, public_nickname)
  values (v_user_id, 'QaRoll50')
  returning id into v_player_id;

  -- Live redeemable fixture under staff-redeem-test-v1 only
  insert into public.promotional_campaign_runs (
    player_id, campaign_id, campaign_version, status,
    reward_tier_id, reward_amount_cents, reward_currency, reward_eligible,
    total_stars, total_score, decision, completed_at
  ) values (
    v_player_id, 'staff-redeem-test-v1', 1, 'reward_calculated',
    'tier_50', 5000, 'AUD', true,
    5, 5000, '{"eligible":true,"tierId":"tier_50"}'::jsonb, now()
  ) returning id into v_run_id;

  insert into public.promotional_campaign_reward_decisions (
    run_id, player_id, eligible, tier_id, amount_cents, currency,
    total_stars, total_score, decision, voucher_issued
  ) values (
    v_run_id, v_player_id, true, 'tier_50', 5000, 'AUD',
    5, 5000, '{"eligible":true}'::jsonb, false
  ) returning id into v_decision_id;

  insert into public.promotional_voucher_claims (
    campaign_id, run_id, decision_id, player_id,
    email_raw, email_normalized, full_name, phone,
    terms_version, adult_self_attested, marketing_opt_in,
    reward_tier_id, amount_cents, currency, status, issuance_mode, redeemable
  ) values (
    'staff-redeem-test-v1', v_run_id, v_decision_id, v_player_id,
    'staff-redeem-qa-rollback@example.invalid',
    'staff-redeem-qa-rollback@example.invalid',
    'QA Rollback', '+61000000999',
    'promo-terms-v1', true, false,
    'tier_50', 5000, 'AUD', 'issued', 'approved_live', true
  ) returning id into v_claim_id;

  insert into public.promotional_vouchers (
    claim_id, campaign_id, run_id, player_id, code,
    reward_tier_id, amount_cents, currency, issued_at, expires_at,
    status, demo, redeemable
  ) values (
    v_claim_id, 'staff-redeem-test-v1', v_run_id, v_player_id, v_code,
    'tier_50', 5000, 'AUD', now(), null,
    'issued', false, true
  ) returning id into v_voucher_id;

  -- 1) Lookup
  v_lookup := public.staff_lookup_promotional_voucher(v_code);
  if coalesce(v_lookup->>'ok', '') <> 'true' then
    raise exception 'LOOKUP_FAIL %', v_lookup;
  end if;

  -- 2) First redeem succeeds
  v_first := public.staff_redeem_promotional_voucher(v_code, 'qa-rollback-jti-1');
  if coalesce(v_first->>'ok', '') <> 'true' then
    raise exception 'FIRST_REDEEM_FAIL %', v_first;
  end if;

  select redeemed_at into v_redeemed_at
  from public.promotional_vouchers where id = v_voucher_id;
  if v_redeemed_at is null then
    raise exception 'MISSING_REDEEMED_AT';
  end if;

  select count(*) into v_event_count
  from public.promotional_voucher_redemption_events
  where voucher_id = v_voucher_id and event_type = 'redeemed';
  if v_event_count <> 1 then
    raise exception 'AUDIT_COUNT %', v_event_count;
  end if;

  -- 3) Second redeem rejected; redeemed_at immutable
  v_second := public.staff_redeem_promotional_voucher(v_code, 'qa-rollback-jti-2');
  if coalesce(v_second->>'code', '') <> 'already_redeemed' then
    raise exception 'SECOND_REDEEM_UNEXPECTED %', v_second;
  end if;

  select redeemed_at into v_redeemed_at_after
  from public.promotional_vouchers where id = v_voucher_id;
  if v_redeemed_at_after is distinct from v_redeemed_at then
    raise exception 'REDEEMED_AT_CHANGED';
  end if;

  -- 4) Synthetic DEMO voucher (isolated campaign only) must remain non-redeemable.
  -- Never SELECT … FOR UPDATE real customer DEMO rows.
  insert into public.promotional_campaign_runs (
    player_id, campaign_id, campaign_version, status,
    reward_tier_id, reward_amount_cents, reward_currency, reward_eligible,
    total_stars, total_score, decision, completed_at
  ) values (
    v_player_id, 'staff-redeem-test-v1', 1, 'reward_calculated',
    'tier_50', 5000, 'AUD', true,
    5, 5000, '{"eligible":true,"demo":true}'::jsonb, now()
  ) returning id into v_demo_run_id;

  insert into public.promotional_campaign_reward_decisions (
    run_id, player_id, eligible, tier_id, amount_cents, currency,
    total_stars, total_score, decision, voucher_issued
  ) values (
    v_demo_run_id, v_player_id, true, 'tier_50', 5000, 'AUD',
    5, 5000, '{"eligible":true,"demo":true}'::jsonb, false
  ) returning id into v_demo_decision_id;

  insert into public.promotional_voucher_claims (
    campaign_id, run_id, decision_id, player_id,
    email_raw, email_normalized, full_name, phone,
    terms_version, adult_self_attested, marketing_opt_in,
    reward_tier_id, amount_cents, currency, status, issuance_mode, redeemable
  ) values (
    'staff-redeem-test-v1', v_demo_run_id, v_demo_decision_id, v_player_id,
    'staff-redeem-qa-demo@example.invalid',
    'staff-redeem-qa-demo@example.invalid',
    'QA Demo', '+61000000998',
    'promo-terms-v1', true, false,
    'tier_50', 5000, 'AUD', 'issued', 'demo', false
  ) returning id into v_demo_claim_id;

  insert into public.promotional_vouchers (
    claim_id, campaign_id, run_id, player_id, code,
    reward_tier_id, amount_cents, currency, issued_at, expires_at,
    status, demo, redeemable
  ) values (
    v_demo_claim_id, 'staff-redeem-test-v1', v_demo_run_id, v_player_id, v_demo_code,
    'tier_50', 5000, 'AUD', now(), now() + interval '30 days',
    'issued', true, false
  );

  v_demo_reject := public.staff_redeem_promotional_voucher(v_demo_code, 'qa-demo-check');
  if coalesce(v_demo_reject->>'ok', '') = 'true' then
    raise exception 'DEMO_BECAME_REDEEMABLE %', v_demo_reject;
  end if;
  if coalesce(v_demo_reject->>'code', '') not in ('not_redeemable', 'issuance_not_live') then
    raise exception 'DEMO_REJECT_UNEXPECTED %', v_demo_reject;
  end if;

  -- 5) Public event campaign unchanged (read-only assert inside TX)
  select mode, real_redeemable into v_event_cfg_mode, v_event_cfg_rr
  from public.promotional_issuance_config
  where campaign_id = 'event-three-rooftop-v1';
  if v_event_cfg_mode is distinct from 'demo' or v_event_cfg_rr is distinct from false then
    raise exception 'EVENT_CAMPAIGN_CHANGED mode=% rr=%', v_event_cfg_mode, v_event_cfg_rr;
  end if;

  raise notice 'QA_ROLLBACK_CHECKS_PASSED synthetic_code=%', v_code;
end $$;

-- Always discard. Exception in DO aborts the TX; ROLLBACK still clears it.
rollback;
