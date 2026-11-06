-- Phase 3A — Decarby Solar backend foundation
-- Anonymous auth + profiles + level versions + score tables (unverified claims only from clients)

create extension if not exists "pgcrypto";

create type public.game_mode as enum ('classic', 'timeAttack');
create type public.verification_status as enum ('pending', 'rejected', 'verified');
create type public.moderation_status as enum ('active', 'flagged', 'restricted');

-- ---------------------------------------------------------------------------
-- player_profiles
-- ---------------------------------------------------------------------------
create table public.player_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  public_nickname text not null,
  nickname_normalized text generated always as (lower(public_nickname)) stored,
  moderation_status public.moderation_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint player_profiles_nickname_length check (
    char_length(public_nickname) between 3 and 20
  ),
  constraint player_profiles_nickname_charset check (
    public_nickname ~ '^[A-Za-z0-9][A-Za-z0-9 _.-]{1,18}[A-Za-z0-9]$'
  )
);

create unique index player_profiles_nickname_normalized_uidx
  on public.player_profiles (nickname_normalized);

create index player_profiles_moderation_idx
  on public.player_profiles (moderation_status);

-- Public projection: nickname only (no user_id / auth identifiers)
create view public.public_player_profiles
with (security_invoker = true)
as
select
  id,
  public_nickname
from public.player_profiles
where moderation_status = 'active';

-- ---------------------------------------------------------------------------
-- game_level_versions
-- ---------------------------------------------------------------------------
create table public.game_level_versions (
  id uuid primary key default gen_random_uuid(),
  level_id text not null,
  version integer not null check (version > 0),
  configuration_hash text not null check (char_length(configuration_hash) between 8 and 128),
  active boolean not null default false,
  created_at timestamptz not null default now(),
  unique (level_id, version)
);

-- At most one active version per level
create unique index game_level_versions_one_active_uidx
  on public.game_level_versions (level_id)
  where active;

-- ---------------------------------------------------------------------------
-- game_score_submissions (claimed only; verification is server-side later)
-- ---------------------------------------------------------------------------
create table public.game_score_submissions (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.player_profiles (id) on delete cascade,
  level_id text not null,
  level_version_id uuid not null references public.game_level_versions (id),
  game_mode public.game_mode not null,
  claimed_score integer not null check (claimed_score >= 0),
  claimed_duration_ms integer not null check (claimed_duration_ms >= 0),
  verification_status public.verification_status not null default 'pending',
  submitted_at timestamptz not null default now(),
  constraint game_score_submissions_pending_only_from_clients check (
    verification_status in ('pending', 'rejected', 'verified')
  )
);

create index game_score_submissions_player_idx
  on public.game_score_submissions (player_id, submitted_at desc);

create index game_score_submissions_level_idx
  on public.game_score_submissions (level_id, game_mode, verification_status);

-- ---------------------------------------------------------------------------
-- verified_game_records (service-role / trusted writers only)
-- ---------------------------------------------------------------------------
create table public.verified_game_records (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.player_profiles (id) on delete cascade,
  level_id text not null,
  level_version_id uuid not null references public.game_level_versions (id),
  game_mode public.game_mode not null,
  verified_score integer not null check (verified_score >= 0),
  verified_duration_ms integer not null check (verified_duration_ms >= 0),
  verified_at timestamptz not null default now(),
  unique (player_id, level_id, level_version_id, game_mode)
);

create index verified_game_records_board_idx
  on public.verified_game_records (level_id, game_mode, verified_score desc, verified_duration_ms asc);

-- ---------------------------------------------------------------------------
-- updated_at helper
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger player_profiles_set_updated_at
before update on public.player_profiles
for each row execute function public.set_updated_at();

-- Prevent clients from changing moderation_status or user_id
create or replace function public.enforce_player_profile_owner_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    if new.user_id is distinct from old.user_id then
      raise exception 'user_id is immutable';
    end if;
    if new.moderation_status is distinct from old.moderation_status then
      if auth.role() <> 'service_role' then
        raise exception 'moderation_status can only be changed by moderators';
      end if;
    end if;
  end if;
  return new;
end;
$$;

create trigger player_profiles_enforce_owner_columns
before update on public.player_profiles
for each row execute function public.enforce_player_profile_owner_columns();

-- Force client inserts on score submissions to remain pending
create or replace function public.enforce_score_submission_pending()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() <> 'service_role' then
    if tg_op = 'INSERT' then
      new.verification_status := 'pending';
    elsif tg_op = 'UPDATE' then
      raise exception 'Clients cannot update score submissions';
    end if;
  end if;
  return new;
end;
$$;

create trigger game_score_submissions_enforce_pending
before insert or update on public.game_score_submissions
for each row execute function public.enforce_score_submission_pending();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.player_profiles enable row level security;
alter table public.game_level_versions enable row level security;
alter table public.game_score_submissions enable row level security;
alter table public.verified_game_records enable row level security;

-- Profiles: owner read/write; no public read of user_id (use view instead)
create policy "profiles_select_own"
  on public.player_profiles
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "profiles_insert_own"
  on public.player_profiles
  for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and moderation_status = 'active'
  );

create policy "profiles_update_own_nickname"
  on public.player_profiles
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Public nickname view readable by everyone (including anon role if granted)
grant select on public.public_player_profiles to anon, authenticated;

-- Level versions: public read of active rows only; no client writes
create policy "level_versions_select_active"
  on public.game_level_versions
  for select
  to anon, authenticated
  using (active = true);

-- Score submissions: insert/select own pending claims only; no updates/deletes
create policy "score_submissions_select_own"
  on public.game_score_submissions
  for select
  to authenticated
  using (
    player_id in (
      select id from public.player_profiles where user_id = auth.uid()
    )
  );

create policy "score_submissions_insert_own_pending"
  on public.game_score_submissions
  for insert
  to authenticated
  with check (
    verification_status = 'pending'
    and player_id in (
      select id from public.player_profiles where user_id = auth.uid()
    )
  );

-- Verified records: read-only for authenticated/anon (leaderboard later);
-- no insert/update/delete policies for clients (service role bypasses RLS)
create policy "verified_records_select_public"
  on public.verified_game_records
  for select
  to anon, authenticated
  using (true);

-- Explicitly revoke dangerous grants from anon/authenticated
revoke insert, update, delete on public.game_level_versions from anon, authenticated;
revoke update, delete on public.game_score_submissions from anon, authenticated;
revoke insert, update, delete on public.verified_game_records from anon, authenticated;

grant select on public.game_level_versions to anon, authenticated;
grant select, insert on public.game_score_submissions to authenticated;
grant select on public.verified_game_records to anon, authenticated;
grant select, insert, update on public.player_profiles to authenticated;
