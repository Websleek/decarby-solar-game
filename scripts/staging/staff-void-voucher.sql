-- CONTROLLED STAFF VOID — erroneously issued promotional voucher.
-- Explicit approval required. Prefer SQL Editor / service-role with a ticket id.
--
-- Effect:
--   * voucher.status -> void ( /code/ shows Cancelled; redeem returns void )
--   * claim.status -> void when not already redeemed
--   * immutable audit insert: event_type=redeem_rejected, payload.reason=manual_void
--
-- Does NOT:
--   * delete claims, email jobs, or history
--   * change redeemed_at on already-redeemed vouchers (aborts instead)
--   * flip campaign issuance config
--   * weaken no-update/delete trigger on redemption_events

-- Lookup first (read-only):
-- select id, code, status, demo, redeemable, redeemed_at, campaign_id
-- from public.promotional_vouchers
-- where code = 'DSR-XXXX-XXXX-XXXX';

/*
begin;

do $$
declare
  v public.promotional_vouchers%rowtype;
begin
  select * into v
  from public.promotional_vouchers
  where code = 'DSR-XXXX-XXXX-XXXX'
  for update;

  if not found then
    raise exception 'ABORT: voucher not found';
  end if;
  if v.status = 'redeemed' then
    raise exception 'ABORT: already redeemed — do not void; escalate';
  end if;
  if v.status = 'void' then
    raise exception 'ABORT: already void';
  end if;

  update public.promotional_vouchers
  set status = 'void'
  where id = v.id
    and status is distinct from 'redeemed';

  update public.promotional_voucher_claims
  set status = 'void'
  where id = v.claim_id
    and status is distinct from 'redeemed';

  insert into public.promotional_voucher_redemption_events (
    voucher_id, event_type, actor_kind, actor_session_jti, payload
  ) values (
    v.id,
    'redeem_rejected',
    'staff_password',
    null,
    jsonb_build_object(
      'reason', 'manual_void',
      'ticket', 'REPLACE_WITH_TICKET_ID',
      'priorStatus', v.status,
      'code', v.code
    )
  );
end $$;

-- Verify then commit or rollback:
-- select code, status, redeemed_at from promotional_vouchers where code = 'DSR-XXXX-XXXX-XXXX';
-- commit;
-- rollback;
*/
