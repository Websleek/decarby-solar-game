-- Phase 3C — secure public leaderboard read models (SECURITY DEFINER).
-- Clients never supply rankings. Nicknames come only from active profiles.
-- Document before apply. Do not auto-deploy from the agent.
--
-- Version policy: rankings use only the currently active game_level_versions row
-- per level_id. Historical verified rows for inactive versions remain stored but
-- are excluded from live boards until/unless that version is reactivated.

begin;

create or replace function public.competition_week_bounds_canberra()
returns table (week_start timestamptz, week_end timestamptz, label text)
language sql
stable
security definer
set search_path = public
as $$
  with local_now as (
    select timezone('Australia/Canberra', now()) as local_ts
  ),
  bounds as (
    select
      date_trunc('week', local_ts)::timestamp as week_start_local,
      (date_trunc('week', local_ts) + interval '7 days')::timestamp as week_end_local
    from local_now
  )
  select
    timezone('Australia/Canberra', week_start_local) as week_start,
    timezone('Australia/Canberra', week_end_local) as week_end,
    to_char(week_start_local, 'YYYY-"W"IW') as label
  from bounds;
$$;

revoke all on function public.competition_week_bounds_canberra() from public;
grant execute on function public.competition_week_bounds_canberra() to anon, authenticated, service_role;

-- Eligible classic bests on active versions for active nicknames only.
create or replace function public._leaderboard_eligible_classic()
returns table (
  player_id uuid,
  public_nickname text,
  level_id text,
  verified_score integer,
  verified_duration_ms integer,
  verified_at timestamptz,
  level_version_id uuid,
  version integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    v.player_id,
    p.public_nickname,
    v.level_id,
    v.verified_score,
    v.verified_duration_ms,
    v.verified_at,
    v.level_version_id,
    lv.version
  from public.verified_game_records v
  join public.game_level_versions lv
    on lv.id = v.level_version_id
   and lv.active = true
   and lv.level_id = v.level_id
  join public.player_profiles p
    on p.id = v.player_id
   and p.moderation_status = 'active'
  where v.game_mode = 'classic';
$$;

create or replace function public._leaderboard_eligible_time_attack()
returns table (
  player_id uuid,
  public_nickname text,
  level_id text,
  verified_score integer,
  verified_duration_ms integer,
  verified_at timestamptz,
  level_version_id uuid,
  version integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    v.player_id,
    p.public_nickname,
    v.level_id,
    v.verified_score,
    v.verified_duration_ms,
    v.verified_at,
    v.level_version_id,
    lv.version
  from public.verified_game_records v
  join public.game_level_versions lv
    on lv.id = v.level_version_id
   and lv.active = true
   and lv.level_id = v.level_id
  join public.player_profiles p
    on p.id = v.player_id
   and p.moderation_status = 'active'
  where v.game_mode = 'timeAttack';
$$;

revoke all on function public._leaderboard_eligible_classic() from public;
revoke all on function public._leaderboard_eligible_time_attack() from public;

-- Overall Champions: require verified Classic on all 5 active rooftops.
-- Score = sum of per-level bests (one row already unique per player/level/version/mode).
create or replace function public.leaderboard_overall(
  p_limit integer default 20,
  p_offset integer default 0
)
returns table (
  rank bigint,
  public_nickname text,
  total_score integer,
  levels_completed integer,
  total_duration_ms integer
)
language sql
stable
security definer
set search_path = public
as $$
  with active_levels as (
    select count(*)::integer as n from public.game_level_versions where active = true
  ),
  per_player as (
    select
      e.player_id,
      max(e.public_nickname) as public_nickname,
      sum(e.verified_score)::integer as total_score,
      count(*)::integer as levels_completed,
      sum(e.verified_duration_ms)::integer as total_duration_ms
    from public._leaderboard_eligible_classic() e
    group by e.player_id
  ),
  qualified as (
    select p.*
    from per_player p
    cross join active_levels a
    where p.levels_completed >= a.n
      and a.n >= 5
  ),
  ordered as (
    select
      row_number() over (
        order by q.total_score desc, q.total_duration_ms asc, q.public_nickname asc
      ) as rank,
      q.public_nickname,
      q.total_score,
      q.levels_completed,
      q.total_duration_ms
    from qualified q
  )
  select *
  from ordered
  where rank > greatest(coalesce(p_offset, 0), 0)
  order by rank
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
$$;

-- Weekly Leaders: best Classic score per level verified within Canberra week; sum those.
-- Players need at least one eligible weekly score (partial OK for weekly board).
create or replace function public.leaderboard_weekly(
  p_limit integer default 20,
  p_offset integer default 0
)
returns table (
  rank bigint,
  public_nickname text,
  total_score integer,
  levels_counted integer,
  week_label text,
  week_end timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with week as (
    select * from public.competition_week_bounds_canberra()
  ),
  weekly_rows as (
    select e.*
    from public._leaderboard_eligible_classic() e
    cross join week w
    where e.verified_at >= w.week_start
      and e.verified_at < w.week_end
  ),
  per_player as (
    select
      wr.player_id,
      max(wr.public_nickname) as public_nickname,
      sum(wr.verified_score)::integer as total_score,
      count(*)::integer as levels_counted
    from weekly_rows wr
    group by wr.player_id
  ),
  ordered as (
    select
      row_number() over (
        order by p.total_score desc, p.levels_counted desc, p.public_nickname asc
      ) as rank,
      p.public_nickname,
      p.total_score,
      p.levels_counted,
      (select label from week) as week_label,
      (select week_end from week) as week_end
    from per_player p
  )
  select *
  from ordered
  where rank > greatest(coalesce(p_offset, 0), 0)
  order by rank
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
$$;

create or replace function public.leaderboard_rooftop(
  p_level_id text,
  p_limit integer default 20,
  p_offset integer default 0
)
returns table (
  rank bigint,
  public_nickname text,
  verified_score integer,
  verified_duration_ms integer,
  level_id text,
  puzzle_version integer
)
language sql
stable
security definer
set search_path = public
as $$
  with filtered as (
    select *
    from public._leaderboard_eligible_classic() e
    where e.level_id = p_level_id
  ),
  ordered as (
    select
      row_number() over (
        order by f.verified_score desc, f.verified_duration_ms asc, f.verified_at asc, f.public_nickname asc
      ) as rank,
      f.public_nickname,
      f.verified_score,
      f.verified_duration_ms,
      f.level_id,
      f.version as puzzle_version
    from filtered f
  )
  select *
  from ordered
  where rank > greatest(coalesce(p_offset, 0), 0)
  order by rank
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
$$;

create or replace function public.leaderboard_speed(
  p_level_id text,
  p_limit integer default 20,
  p_offset integer default 0
)
returns table (
  rank bigint,
  public_nickname text,
  verified_duration_ms integer,
  verified_score integer,
  level_id text,
  puzzle_version integer
)
language sql
stable
security definer
set search_path = public
as $$
  with filtered as (
    select *
    from public._leaderboard_eligible_time_attack() e
    where e.level_id = p_level_id
  ),
  ordered as (
    select
      row_number() over (
        order by f.verified_duration_ms asc, f.verified_score desc, f.verified_at asc, f.public_nickname asc
      ) as rank,
      f.public_nickname,
      f.verified_duration_ms,
      f.verified_score,
      f.level_id,
      f.version as puzzle_version
    from filtered f
  )
  select *
  from ordered
  where rank > greatest(coalesce(p_offset, 0), 0)
  order by rank
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
$$;

-- Viewer standing helpers (nickname match for signed-in profile; never returns user_id).
create or replace function public.leaderboard_my_nickname()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select p.public_nickname
  from public.player_profiles p
  where p.user_id = auth.uid()
    and p.moderation_status = 'active'
  limit 1;
$$;

-- Speed board gate: true once at least one eligible Time Attack record exists.
create or replace function public.leaderboard_speed_available()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public._leaderboard_eligible_time_attack() limit 1);
$$;

revoke all on function public.leaderboard_overall(integer, integer) from public;
revoke all on function public.leaderboard_weekly(integer, integer) from public;
revoke all on function public.leaderboard_rooftop(text, integer, integer) from public;
revoke all on function public.leaderboard_speed(text, integer, integer) from public;
revoke all on function public.leaderboard_my_nickname() from public;
revoke all on function public.leaderboard_speed_available() from public;

grant execute on function public.leaderboard_overall(integer, integer) to anon, authenticated, service_role;
grant execute on function public.leaderboard_weekly(integer, integer) to anon, authenticated, service_role;
grant execute on function public.leaderboard_rooftop(text, integer, integer) to anon, authenticated, service_role;
grant execute on function public.leaderboard_speed(text, integer, integer) to anon, authenticated, service_role;
grant execute on function public.leaderboard_my_nickname() to anon, authenticated, service_role;
grant execute on function public.leaderboard_speed_available() to anon, authenticated, service_role;

commit;
