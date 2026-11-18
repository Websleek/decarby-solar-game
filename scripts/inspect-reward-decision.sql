-- Read-only inspection for a campaign run that shows A$50 on the client
-- but returns not_eligible on claim. Replace :run_id with the UUID.
-- Do not select email / phone / full_name.

-- 1) Run + decision summary
select
  r.id as run_id,
  r.campaign_id,
  r.status as run_status,
  r.reward_eligible,
  r.reward_tier_id,
  r.reward_amount_cents,
  r.total_stars as run_total_stars,
  d.id as decision_id,
  d.eligible as decision_eligible,
  d.tier_id as decision_tier_id,
  d.amount_cents as decision_amount_cents,
  d.total_stars as decision_total_stars,
  d.voucher_issued,
  d.decision->>'code' as decision_code,
  d.decision->>'reason' as decision_reason,
  d.created_at as decision_created_at
from public.promotional_campaign_runs r
left join public.promotional_campaign_reward_decisions d on d.run_id = r.id
where r.id = :'run_id';

-- 2) Verified rooftop rows for the run
select
  level_id,
  status,
  verified_stars,
  verified_score,
  level_version,
  verified_record_id is not null as has_verified_record
from public.promotional_campaign_run_levels
where run_id = :'run_id'
order by level_id;

-- 3) Existing claim lock (ids only)
select
  id as claim_id,
  status as claim_status,
  reward_tier_id,
  amount_cents,
  created_at
from public.promotional_voucher_claims
where run_id = :'run_id';

-- 4) Issuance config for the run's campaign
select
  c.campaign_id,
  c.mode,
  c.claims_enabled,
  c.real_redeemable,
  c.terms_version
from public.promotional_issuance_config c
join public.promotional_campaign_runs r on r.campaign_id = c.campaign_id
where r.id = :'run_id';
