-- STAGING / LOCAL ONLY — isolated single-use redeem fixture.
-- Campaign: staff-redeem-test-v1 (does NOT touch event-three-rooftop-v1).
-- Prefer scripts/staging/run-staff-redeem-integration.mjs which refuses production.
-- Do not run against production project lrohmaodpqbmvgxsspql.

-- Issuance config for the isolated test campaign only.
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

-- Remaining rows (auth user, profile, run, decision, claim, voucher) are created by
-- run-staff-redeem-integration.mjs so auth.users FK stays valid.
