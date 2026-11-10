-- Final C pre-deploy — leaderboard snapshot atomicity / recoverability.
-- Depends on Phase 4C.3 leaderboard_snapshots tables + finalise_leaderboard_snapshot.
-- Populated snapshots remain immutable. Empty (failed/incomplete) snapshots are recoverable.
-- Additive only. Does not alter gameplay, scores, nicknames, or live leaderboard tables.
-- Document before apply. Do not auto-deploy from the agent.

begin;

-- Entries: block UPDATE only. DELETE must remain possible so ON DELETE CASCADE
-- can remove children when an empty incomplete parent snapshot is purged.
drop trigger if exists leaderboard_snapshot_entries_no_update
  on public.leaderboard_snapshot_entries;

drop trigger if exists leaderboard_snapshot_entries_no_update_only
  on public.leaderboard_snapshot_entries;

create or replace function public.leaderboard_snapshot_entries_deny_update()
returns trigger
language plpgsql
as $$
begin
  raise exception 'leaderboard_snapshot_entries are immutable once written';
end;
$$;

create trigger leaderboard_snapshot_entries_no_update_only
before update on public.leaderboard_snapshot_entries
for each row execute function public.leaderboard_snapshot_entries_deny_update();

revoke all on function public.leaderboard_snapshot_entries_deny_update()
  from public, anon, authenticated;

-- Snapshots: UPDATE always denied. DELETE allowed only when the snapshot has
-- zero entries (incomplete / empty finalisation) so operators can recover.
create or replace function public.leaderboard_snapshots_deny_mutation()
returns trigger
language plpgsql
as $$
declare
  v_entry_count integer;
begin
  if tg_op = 'UPDATE' then
    raise exception 'leaderboard_snapshots are immutable once finalised';
  end if;

  if tg_op = 'DELETE' then
    select count(*)::integer into v_entry_count
    from public.leaderboard_snapshot_entries e
    where e.snapshot_id = old.id;

    if coalesce(v_entry_count, 0) > 0 then
      raise exception 'leaderboard_snapshots are immutable once finalised';
    end if;
    return old;
  end if;

  return null;
end;
$$;

drop trigger if exists leaderboard_snapshots_no_update on public.leaderboard_snapshots;
create trigger leaderboard_snapshots_no_update
before update or delete on public.leaderboard_snapshots
for each row execute function public.leaderboard_snapshots_deny_mutation();

-- Atomic-ish finalise: any uncaught error rolls back the whole function call.
-- Empty prior snapshot for the same fingerprint is deleted and recreated.
create or replace function public.finalise_leaderboard_snapshot(
  p_board text,
  p_period_label text,
  p_source_fingerprint text,
  p_level_id text default null,
  p_period_start timestamptz default null,
  p_period_end timestamptz default null,
  p_limit integer default 100
)
returns table (
  snapshot_id uuid,
  inserted boolean,
  entry_count integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing_id uuid;
  v_snapshot_id uuid;
  v_limit integer;
  v_count integer := 0;
begin
  if p_board not in ('overall', 'speed') then
    raise exception 'unsupported_board' using errcode = '22023';
  end if;
  if p_board = 'speed' and (p_level_id is null or char_length(p_level_id) < 3) then
    raise exception 'level_id_required' using errcode = '22023';
  end if;
  if p_board = 'overall' then
    p_level_id := null;
  end if;
  if p_period_label is null or char_length(btrim(p_period_label)) < 3 then
    raise exception 'invalid_period' using errcode = '22023';
  end if;
  if p_source_fingerprint is null or char_length(p_source_fingerprint) < 8 then
    raise exception 'invalid_fingerprint' using errcode = '22023';
  end if;

  v_limit := greatest(1, least(coalesce(p_limit, 100), 200));

  select s.id into v_existing_id
  from public.leaderboard_snapshots s
  where s.board = p_board
    and coalesce(s.level_id, '') = coalesce(p_level_id, '')
    and s.period_label = p_period_label
    and s.source_fingerprint = p_source_fingerprint
  for update;

  if v_existing_id is not null then
    select count(*)::integer into v_count
    from public.leaderboard_snapshot_entries e
    where e.snapshot_id = v_existing_id;

    if coalesce(v_count, 0) > 0 then
      -- Populated snapshot: true idempotent success.
      return query select v_existing_id, false, v_count;
      return;
    end if;

    -- Empty incomplete snapshot: recoverable purge, then recreate below.
    delete from public.leaderboard_snapshots s where s.id = v_existing_id;
    v_existing_id := null;
  end if;

  insert into public.leaderboard_snapshots (
    board,
    level_id,
    period_label,
    period_start,
    period_end,
    source_fingerprint,
    verification_metadata
  ) values (
    p_board,
    p_level_id,
    p_period_label,
    p_period_start,
    p_period_end,
    p_source_fingerprint,
    jsonb_build_object(
      'generator', 'finalise_leaderboard_snapshot',
      'finalised', true,
      'limit', v_limit,
      'atomicity', 'final_c_recoverable_empty'
    )
  )
  returning id into v_snapshot_id;

  if p_board = 'overall' then
    insert into public.leaderboard_snapshot_entries (
      snapshot_id, rank, player_id, public_nickname, score_metric, duration_metric_ms
    )
    select
      v_snapshot_id,
      r.rank,
      p.id,
      r.public_nickname,
      r.total_score,
      r.total_duration_ms
    from public.leaderboard_overall(v_limit, 0) r
    join public.player_profiles p
      on p.public_nickname = r.public_nickname
     and p.moderation_status = 'active';
  else
    insert into public.leaderboard_snapshot_entries (
      snapshot_id, rank, player_id, public_nickname, score_metric, duration_metric_ms
    )
    select
      v_snapshot_id,
      r.rank,
      p.id,
      r.public_nickname,
      r.verified_score,
      r.verified_duration_ms
    from public.leaderboard_speed(p_level_id, v_limit, 0) r
    join public.player_profiles p
      on p.public_nickname = r.public_nickname
     and p.moderation_status = 'active';
  end if;

  select count(*)::integer into v_count
  from public.leaderboard_snapshot_entries e
  where e.snapshot_id = v_snapshot_id;

  return query select v_snapshot_id, true, v_count;
exception
  when unique_violation then
    select s.id into v_existing_id
    from public.leaderboard_snapshots s
    where s.board = p_board
      and coalesce(s.level_id, '') = coalesce(p_level_id, '')
      and s.period_label = p_period_label
      and s.source_fingerprint = p_source_fingerprint;

    select count(*)::integer into v_count
    from public.leaderboard_snapshot_entries e
    where e.snapshot_id = v_existing_id;

    -- If the raced row is empty, purge and surface a retryable error rather than
    -- permanently locking an unusable fingerprint.
    if v_existing_id is not null and coalesce(v_count, 0) = 0 then
      delete from public.leaderboard_snapshots s where s.id = v_existing_id;
      raise exception 'snapshot_incomplete_retry'
        using errcode = '40001',
              hint = 'Empty raced snapshot purged; retry finalise_leaderboard_snapshot.';
    end if;

    return query select v_existing_id, false, coalesce(v_count, 0);
end;
$$;

revoke all on function public.finalise_leaderboard_snapshot(
  text, text, text, text, timestamptz, timestamptz, integer
) from public, anon, authenticated;
grant execute on function public.finalise_leaderboard_snapshot(
  text, text, text, text, timestamptz, timestamptz, integer
) to service_role;

comment on function public.finalise_leaderboard_snapshot is
  'Finalises a leaderboard snapshot. Populated snapshots are immutable; empty incomplete snapshots are deletable and re-finalisable.';

commit;
