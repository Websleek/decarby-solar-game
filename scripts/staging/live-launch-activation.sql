-- LIVE LAUNCH ACTIVATION — DO NOT RUN without explicit written approval.
-- Prerequisites:
--   1) Migration 20260331000000_non_expiring_vouchers applied
--   2) Adult attestation UI + email template deploy live
--   3) Demo-data reset completed (or confirmed unused emails)
--   4) Resend domain + secrets ready; VOUCHER_EMAIL_SEND_DEMO=false
--   5) Staging concurrency + /code/ browser QA passed
--
-- This flips event-three-rooftop-v1 to approved live, non-expiring vouchers.
-- It does NOT send email and does NOT mint vouchers by itself.

/*
begin;

update public.promotional_issuance_config
set
  mode = 'approved_live',
  claims_enabled = true,
  real_redeemable = true,
  voucher_ttl_days = null,  -- non-expiring new vouchers
  updated_at = now()
where campaign_id = 'event-three-rooftop-v1'
  and mode = 'demo'
  and real_redeemable = false;

-- Expect exactly 1 row updated. Verify:
select campaign_id, mode, claims_enabled, real_redeemable, voucher_ttl_days
from public.promotional_issuance_config
where campaign_id = 'event-three-rooftop-v1';

-- commit;  -- only after verification
-- rollback; -- if unexpected
*/
