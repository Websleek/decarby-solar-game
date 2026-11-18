-- Audited reconciliation for non-issued, incorrect/ineligible reward decisions.
-- Required because promotional_campaign_reward_decisions are insert-only immutable
-- and the prior evaluate path could not delete/replace stale rows.
--
-- LEGAL/SAFETY:
-- - Never modifies rows once a voucher claim exists for the run.
-- - Never modifies rows with voucher_issued = true.
-- - Only replaces decisions while decarby.reconcile_reward_decision = on (transaction-local).

create or replace function public.promotional_reward_decisions_deny_mutation()
returns trigger
language plpgsql
as $$
begin
  -- Controlled reconcile path: allow DELETE of non-issued decisions only.
  if tg_op = 'DELETE'
     and current_setting('decarby.reconcile_reward_decision', true) = 'on'
     and old.voucher_issued is not true
     and not exists (
       select 1
       from public.promotional_voucher_claims c
       where c.run_id = old.run_id
     ) then
    return old;
  end if;

  raise exception 'promotional_campaign_reward_decisions are immutable';
end;
$$;

create or replace function public.reconcile_campaign_reward_decision(
  p_run_id uuid,
  p_player_id uuid,
  p_eligible boolean,
  p_tier_id text,
  p_amount_cents integer,
  p_total_stars integer,
  p_total_score integer,
  p_decision jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing public.promotional_campaign_reward_decisions%rowtype;
  v_inserted public.promotional_campaign_reward_decisions%rowtype;
  v_claim_exists boolean;
begin
  if p_run_id is null or p_player_id is null then
    return jsonb_build_object('ok', false, 'code', 'invalid_request', 'message', 'Missing run or player.');
  end if;
  if p_decision is null then
    return jsonb_build_object('ok', false, 'code', 'invalid_request', 'message', 'Decision payload required.');
  end if;
  if coalesce(p_amount_cents, 0) < 0 then
    return jsonb_build_object('ok', false, 'code', 'invalid_request', 'message', 'Invalid amount.');
  end if;

  select exists(
    select 1 from public.promotional_voucher_claims where run_id = p_run_id
  ) into v_claim_exists;

  if v_claim_exists then
    return jsonb_build_object(
      'ok', false,
      'code', 'claim_exists',
      'message', 'Reward decision cannot be changed after a voucher claim exists.'
    );
  end if;

  select * into v_existing
  from public.promotional_campaign_reward_decisions
  where run_id = p_run_id
  for update;

  if found then
    if v_existing.player_id is distinct from p_player_id then
      return jsonb_build_object('ok', false, 'code', 'forbidden', 'message', 'Campaign run does not belong to this player.');
    end if;
    if v_existing.voucher_issued is true then
      return jsonb_build_object('ok', false, 'code', 'voucher_issued', 'message', 'Reward decision is locked after voucher issuance.');
    end if;

    -- Already matches the corrected eligible decision — no rewrite.
    if v_existing.eligible is true
       and p_eligible is true
       and v_existing.amount_cents = p_amount_cents
       and v_existing.tier_id is not distinct from p_tier_id
       and v_existing.total_stars = p_total_stars then
      return jsonb_build_object(
        'ok', true,
        'reconciled', false,
        'idempotent', true,
        'decisionId', v_existing.id,
        'eligible', v_existing.eligible,
        'tierId', v_existing.tier_id,
        'amountCents', v_existing.amount_cents,
        'totalStars', v_existing.total_stars,
        'totalScore', v_existing.total_score,
        'decision', v_existing.decision
      );
    end if;

    -- Only correct ineligible / incomplete / outdated non-issued decisions.
    perform set_config('decarby.reconcile_reward_decision', 'on', true);
    delete from public.promotional_campaign_reward_decisions where id = v_existing.id;
    perform set_config('decarby.reconcile_reward_decision', 'off', true);
  end if;

  insert into public.promotional_campaign_reward_decisions (
    run_id,
    player_id,
    eligible,
    tier_id,
    amount_cents,
    currency,
    total_stars,
    total_score,
    decision,
    voucher_issued
  ) values (
    p_run_id,
    p_player_id,
    coalesce(p_eligible, false),
    p_tier_id,
    coalesce(p_amount_cents, 0),
    'AUD',
    coalesce(p_total_stars, 0),
    coalesce(p_total_score, 0),
    p_decision,
    false
  )
  returning * into v_inserted;

  update public.promotional_campaign_runs
  set
    status = case when v_inserted.eligible then 'reward_calculated' else 'ineligible' end,
    reward_tier_id = v_inserted.tier_id,
    reward_amount_cents = v_inserted.amount_cents,
    reward_eligible = v_inserted.eligible,
    reward_reason = coalesce(p_decision->>'reason', reward_reason),
    total_stars = v_inserted.total_stars,
    total_score = v_inserted.total_score,
    decision = p_decision,
    completed_at = coalesce(completed_at, now())
  where id = p_run_id
    and player_id = p_player_id;

  return jsonb_build_object(
    'ok', true,
    'reconciled', true,
    'idempotent', false,
    'decisionId', v_inserted.id,
    'eligible', v_inserted.eligible,
    'tierId', v_inserted.tier_id,
    'amountCents', v_inserted.amount_cents,
    'totalStars', v_inserted.total_stars,
    'totalScore', v_inserted.total_score,
    'decision', v_inserted.decision
  );
end;
$$;

revoke all on function public.reconcile_campaign_reward_decision(
  uuid, uuid, boolean, text, integer, integer, integer, jsonb
) from public, anon, authenticated;

grant execute on function public.reconcile_campaign_reward_decision(
  uuid, uuid, boolean, text, integer, integer, integer, jsonb
) to service_role;

comment on function public.reconcile_campaign_reward_decision is
  'Replace a non-issued reward decision after tier/campaign rule corrections. Blocked once a claim exists.';
