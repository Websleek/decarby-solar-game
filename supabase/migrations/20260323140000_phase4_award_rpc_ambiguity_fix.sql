-- Phase 4A fix — resolve PostgreSQL 42702 ambiguous "achievement_id" in award RPC.
-- Exact failing pattern (deployed retrieval-fix body):
--   ON CONFLICT (player_id, achievement_id) DO NOTHING
-- With RETURNS TABLE (achievement_id text, ...), PL/pgSQL treats achievement_id as an
-- output variable, so the unqualified ON CONFLICT column list is ambiguous (42702).
-- Document before apply. Do not auto-deploy from the agent.

begin;

create or replace function public.award_player_achievement(
  p_player_id uuid,
  p_achievement_id text,
  p_source_attempt_id uuid default null,
  p_source_record_id uuid default null,
  p_audit jsonb default '{}'::jsonb
)
returns table (
  achievement_id text,
  earned_at timestamptz,
  inserted boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_achievement_id text;
  v_earned_at timestamptz;
  v_inserted boolean := false;
begin
  -- Reject empty / whitespace / out-of-bounds IDs before touching the table.
  if p_achievement_id is null
     or p_achievement_id <> btrim(p_achievement_id)
     or char_length(p_achievement_id) < 3
     or char_length(p_achievement_id) > 64 then
    raise exception 'invalid_achievement_id'
      using errcode = '22023',
            hint = 'achievement_id must be 3-64 characters with no leading/trailing whitespace';
  end if;

  insert into public.player_achievements as pa (
    player_id,
    achievement_id,
    source_attempt_id,
    source_record_id,
    audit
  )
  values (
    p_player_id,
    p_achievement_id,
    p_source_attempt_id,
    p_source_record_id,
    coalesce(p_audit, '{}'::jsonb)
  )
  -- Named constraint avoids unqualified column references that collide with
  -- RETURNS TABLE output variables (PostgreSQL error 42702).
  on conflict on constraint player_achievements_player_achievement_uidx
  do nothing
  returning pa.achievement_id, pa.earned_at
  into v_achievement_id, v_earned_at;

  if found then
    v_inserted := true;
  else
    select pa.achievement_id, pa.earned_at
      into v_achievement_id, v_earned_at
    from public.player_achievements as pa
    where pa.player_id = p_player_id
      and pa.achievement_id = p_achievement_id;

    if not found then
      -- No persisted row: return zero rows. Callers must not invent unlocks.
      return;
    end if;

    v_inserted := false;
  end if;

  -- Map locals into the result row positionally; do not assign to output
  -- variable names mid-statement where they could shadow table columns.
  return query
  select
    v_achievement_id,
    v_earned_at,
    v_inserted;
end;
$$;

revoke all on function public.award_player_achievement(uuid, text, uuid, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.award_player_achievement(uuid, text, uuid, uuid, jsonb)
  to service_role;

commit;
