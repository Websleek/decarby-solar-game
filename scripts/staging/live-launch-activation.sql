-- LIVE LAUNCH ACTIVATION — DO NOT RUN without explicit written approval.
-- Campaign-scoped only: event-three-rooftop-v1
--
-- Prerequisites:
--   1) Migration 20260331000000_non_expiring_vouchers applied
--   2) Terms page live at https://decarby-solar-game.vercel.app/voucher-terms/
--   3) claim-campaign-voucher + resend-campaign-voucher-email redeployed with publicUrl
--   4) Demo-data reset completed (or confirmed unused emails)
--   5) VOUCHER_EMAIL_SEND_DEMO=false (do not enable demo allowlist for public live)
--   6) Promoter approval for live discounts + canary email
--
-- Target values:
--   mode=approved_live
--   claims_enabled=true
--   real_redeemable=true
--   voucher_ttl_days=NULL
--
-- This does NOT send email and does NOT mint vouchers by itself.

/*
begin;

update public.promotional_issuance_config
set
  mode = 'approved_live',
  claims_enabled = true,
  real_redeemable = true,
  voucher_ttl_days = null,
  updated_at = now()
where campaign_id = 'event-three-rooftop-v1'
  and mode = 'demo'
  and real_redeemable = false;

-- Expect exactly 1 row updated. Verify:
select campaign_id, mode, claims_enabled, real_redeemable, voucher_ttl_days, terms_version
from public.promotional_issuance_config
where campaign_id = 'event-three-rooftop-v1';

-- commit;  -- only after verification
-- rollback; -- if unexpected
*/

-- EMERGENCY STOP (separate approval; does not void already-issued vouchers):
/*
update public.promotional_issuance_config
set real_redeemable = false, mode = 'demo', updated_at = now()
where campaign_id = 'event-three-rooftop-v1';
*/
