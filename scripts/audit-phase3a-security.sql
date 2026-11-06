-- Phase 3A post-migration security audit (read-only)

select 'schema_migrations' as check_name, version, name
from supabase_migrations.schema_migrations
order by version;

select c.relname as relation,
       c.relkind,
       c.relrowsecurity as rls_enabled,
       c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'player_profiles',
    'game_level_versions',
    'game_score_submissions',
    'verified_game_records',
    'public_player_profiles'
  )
order by c.relname;

select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in (
    'player_profiles',
    'game_level_versions',
    'game_score_submissions',
    'verified_game_records'
  )
order by tablename, policyname;

select grantee, table_name, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in (
    'player_profiles',
    'game_level_versions',
    'game_score_submissions',
    'verified_game_records',
    'public_player_profiles'
  )
  and grantee in ('anon', 'authenticated', 'public')
order by table_name, grantee, privilege_type;

select event_object_table as table_name, trigger_name, action_timing, event_manipulation, action_statement
from information_schema.triggers
where event_object_schema = 'public'
  and event_object_table in (
    'player_profiles',
    'game_score_submissions'
  )
order by event_object_table, trigger_name;

select pg_get_viewdef('public.public_player_profiles'::regclass, true) as public_player_profiles_def;

select
  (select count(*) from public.player_profiles) as player_profiles_count,
  (select count(*) from public.game_level_versions) as game_level_versions_count,
  (select count(*) from public.game_score_submissions) as game_score_submissions_count,
  (select count(*) from public.verified_game_records) as verified_game_records_count;
