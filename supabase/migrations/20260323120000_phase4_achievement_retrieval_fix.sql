-- Phase 4A fix — restore service_role read access and harden award RPC result shape.
-- Root cause: REVOKE ALL ... FROM PUBLIC removed service_role table privileges, so
-- Edge admin.from('player_achievements') returned empty while SECURITY DEFINER
-- awards still persisted (inserted:false on backfill with real earned_at).
-- Document before apply. Do not auto-deploy from the agent.

begin;

-- Service role must be able to read awards for operational Edge paths.
-- Authenticated clients continue to use list_my_achievements / RLS select-own.
grant select on table public.player_achievements to service_role;

-- Harden award helper: avoid RETURNS TABLE name shadowing; always return a row
-- only when a persisted award exists for this player/achievement.
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
  on conflict (player_id, achievement_id) do nothing
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
      return; -- no persisted row; caller must not invent an unlock
    end if;
    v_inserted := false;
  end if;

  achievement_id := v_achievement_id;
  earned_at := v_earned_at;
  inserted := v_inserted;
  return next;
end;
$$;

revoke all on function public.award_player_achievement(uuid, text, uuid, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.award_player_achievement(uuid, text, uuid, uuid, jsonb)
  to service_role;

commit;
