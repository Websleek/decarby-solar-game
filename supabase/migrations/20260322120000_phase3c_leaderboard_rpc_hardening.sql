-- Phase 3C hardening — single controlled public leaderboard API.
-- Board RPCs are service_role-only so anon/authenticated clients cannot bypass
-- the get-leaderboard Edge Function rate limiter via PostgREST.
-- Document before apply. Do not auto-deploy from the agent.

begin;

-- Public ranking boards: Edge Function (service role) only.
revoke all on function public.leaderboard_overall(integer, integer) from public, anon, authenticated;
revoke all on function public.leaderboard_weekly(integer, integer) from public, anon, authenticated;
revoke all on function public.leaderboard_rooftop(text, integer, integer) from public, anon, authenticated;
revoke all on function public.leaderboard_speed(text, integer, integer) from public, anon, authenticated;
revoke all on function public.competition_week_bounds_canberra() from public, anon, authenticated;
revoke all on function public.leaderboard_speed_available() from public, anon, authenticated;

grant execute on function public.leaderboard_overall(integer, integer) to service_role;
grant execute on function public.leaderboard_weekly(integer, integer) to service_role;
grant execute on function public.leaderboard_rooftop(text, integer, integer) to service_role;
grant execute on function public.leaderboard_speed(text, integer, integer) to service_role;
grant execute on function public.competition_week_bounds_canberra() to service_role;
grant execute on function public.leaderboard_speed_available() to service_role;

-- Own public nickname helper: signed-in callers + service role (never returns auth ids).
revoke all on function public.leaderboard_my_nickname() from public, anon;
grant execute on function public.leaderboard_my_nickname() to authenticated, service_role;

-- Internal helpers remain non-executable by clients.
revoke all on function public._leaderboard_eligible_classic() from public, anon, authenticated;
revoke all on function public._leaderboard_eligible_time_attack() from public, anon, authenticated;

commit;
