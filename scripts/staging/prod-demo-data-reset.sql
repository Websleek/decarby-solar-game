-- SAFETY: MANUAL PRE-LAUNCH DEMO DATA RESET — DO NOT RUN without explicit written approval.
-- Target campaign only: event-three-rooftop-v1 DEMO / non-redeemable rows.
-- Purpose: free unique emails so participants can claim genuine live vouchers after launch.
--
-- Does NOT:
--   * TRUNCATE / CASCADE wipe tables
--   * Flip mode / real_redeemable
--   * Touch classic-five-rooftop-v1 or staff-redeem-test-v1
--   * Delete redeemable / approved_live vouchers
--   * Auto-commit (operator must review dry-run counts first)
--
-- Retention: promotional_voucher_redemption_events are not expected for demo rows;
-- if any exist, abort and escalate (immutable audit).
--
-- Required sequence:
--   1) Backup / snapshot production DB (Supabase dashboard or pg_dump).
--   2) Run SECTION A (inventory) read-only — capture counts.
--   3) Run SECTION B (dry-run preview) — review row samples (no PII in logs if possible).
--   4) Explicit approval.
--   5) Run SECTION C deletes inside ONE transaction; COMMIT only after row counts match.
--   6) Run SECTION D verification.

-- =============================================================================
-- SECTION A — Inventory (read-only)
-- =============================================================================

-- A1. Issuance config (must still be demo / not redeemable before reset)
select campaign_id, mode, claims_enabled, real_redeemable, voucher_ttl_days, terms_version
from public.promotional_issuance_config
where campaign_id = 'event-three-rooftop-v1';

-- A2. Scoped demo claim / voucher / email-job counts
select
  (select count(*) from public.promotional_voucher_claims
    where campaign_id = 'event-three-rooftop-v1'
      and (issuance_mode = 'demo' or redeemable is not true)) as demo_claims,
  (select count(*) from public.promotional_vouchers
    where campaign_id = 'event-three-rooftop-v1'
      and (demo is true or redeemable is not true)) as demo_vouchers,
  (select count(*) from public.promotional_voucher_email_jobs j
    join public.promotional_voucher_claims c on c.id = j.claim_id
    where c.campaign_id = 'event-three-rooftop-v1'
      and (c.issuance_mode = 'demo' or c.redeemable is not true)) as demo_email_jobs,
  (select count(*) from public.promotional_vouchers
    where campaign_id = 'event-three-rooftop-v1'
      and redeemable is true) as live_redeemable_vouchers_must_be_zero,
  (select count(*) from public.promotional_voucher_redemption_events e
    join public.promotional_vouchers v on v.id = e.voucher_id
    where v.campaign_id = 'event-three-rooftop-v1') as redemption_events;

-- A3. Related campaign runs / decisions for demo claims only
select count(distinct r.id) as runs_linked_to_demo_claims
from public.promotional_campaign_runs r
join public.promotional_voucher_claims c on c.run_id = r.id
where c.campaign_id = 'event-three-rooftop-v1'
  and (c.issuance_mode = 'demo' or c.redeemable is not true);

-- A4. Consent rows for players who only appear via these demo claims (optional cleanup)
select count(*) as consents_for_demo_claim_players
from public.player_promotional_consents cons
where cons.player_id in (
  select distinct player_id from public.promotional_voucher_claims
  where campaign_id = 'event-three-rooftop-v1'
    and (issuance_mode = 'demo' or redeemable is not true)
);

-- =============================================================================
-- SECTION B — Safety gates (abort if any fail)
-- =============================================================================
-- Expect: live_redeemable_vouchers_must_be_zero = 0
-- Expect: redemption_events = 0 (or review manually)
-- Expect: event campaign still mode=demo, real_redeemable=false

-- =============================================================================
-- SECTION C — Controlled delete (REQUIRES APPROVAL — keep commented until then)
-- Delete order respects FKs: email_jobs → vouchers → claims.
-- Campaign runs / decisions / profiles / auth.users are LEFT IN PLACE by default
-- (they do not block unique email reuse). Uncomment optional sections only if needed.
-- =============================================================================

/*
begin;

-- Abort if any redeemable event vouchers exist
do $$
begin
  if exists (
    select 1 from public.promotional_vouchers
    where campaign_id = 'event-three-rooftop-v1' and redeemable is true
  ) then
    raise exception 'ABORT: redeemable event vouchers present — refuse demo reset';
  end if;
  if exists (
    select 1
    from public.promotional_voucher_redemption_events e
    join public.promotional_vouchers v on v.id = e.voucher_id
    where v.campaign_id = 'event-three-rooftop-v1'
  ) then
    raise exception 'ABORT: redemption audit events exist for event campaign — escalate retention review';
  end if;
end $$;

-- C1. Email jobs for demo event claims
delete from public.promotional_voucher_email_jobs j
where j.claim_id in (
  select id from public.promotional_voucher_claims
  where campaign_id = 'event-three-rooftop-v1'
    and (issuance_mode = 'demo' or redeemable is not true)
);

-- C2. Demo / non-redeemable vouchers
delete from public.promotional_vouchers v
where v.campaign_id = 'event-three-rooftop-v1'
  and (v.demo is true or v.redeemable is not true);

-- C3. Demo / non-redeemable claims (frees unique email constraint)
delete from public.promotional_voucher_claims c
where c.campaign_id = 'event-three-rooftop-v1'
  and (c.issuance_mode = 'demo' or c.redeemable is not true);

-- Optional C4: revoke active consents for those players (does not delete history if you prefer soft revoke)
-- update public.player_promotional_consents
-- set revoked_at = coalesce(revoked_at, now())
-- where revoked_at is null
--   and player_id in (...);

-- Do NOT delete promotional_campaign_reward_decisions (immutable).
-- Do NOT delete unrelated campaigns.
-- Do NOT truncate auth.users / player_profiles unless a separate identity-wipe is approved.

-- Review counts, then:
-- commit;
-- or
-- rollback;
*/

-- =============================================================================
-- SECTION D — Post-reset verification (read-only)
-- =============================================================================
-- select count(*) from promotional_voucher_claims where campaign_id='event-three-rooftop-v1';
-- select count(*) from promotional_vouchers where campaign_id='event-three-rooftop-v1';
-- select campaign_id, mode, real_redeemable from promotional_issuance_config where campaign_id='event-three-rooftop-v1';
-- Expect: zero demo claims/vouchers; config still demo until separate launch approval.
