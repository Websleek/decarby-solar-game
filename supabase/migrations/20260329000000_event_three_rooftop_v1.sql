-- Event mode: 3-rooftop primary campaign (event-three-rooftop-v1).
-- Additive only — does not remove classic-five-rooftop-v1 history.
-- Manual apply required; agents must not push this to production automatically.

-- 1) Demo issuance seed for the new event campaign (non-redeemable).
insert into public.promotional_issuance_config (
  campaign_id,
  mode,
  claims_enabled,
  real_redeemable,
  terms_version,
  voucher_ttl_days
)
values (
  'event-three-rooftop-v1',
  'demo',
  true,
  false,
  'promo-terms-v1',
  90
)
on conflict (campaign_id) do update
set
  mode = excluded.mode,
  claims_enabled = excluded.claims_enabled,
  real_redeemable = excluded.real_redeemable,
  terms_version = excluded.terms_version,
  voucher_ttl_days = excluded.voucher_ttl_days;

-- Keep the legacy five-rooftop campaign fail-closed for new claims if still present.
update public.promotional_issuance_config
set claims_enabled = false
where campaign_id = 'classic-five-rooftop-v1'
  and mode = 'demo';

-- 2) Overall Champions: require at least 3 verified classic rooftops (event path).
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
    where e.level_id in ('sunny-house', 'chimney-challenge', 'tricky-rooftop')
    group by e.player_id
  ),
  qualified as (
    select p.*
    from per_player p
    cross join active_levels a
    where p.levels_completed >= 3
      and a.n >= 3
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

-- 3) Optional phone on voucher claims (empty string allowed).
alter table public.promotional_voucher_claims
  drop constraint if exists promotional_voucher_claims_phone_len;

alter table public.promotional_voucher_claims
  alter column phone drop not null;

alter table public.promotional_voucher_claims
  add constraint promotional_voucher_claims_phone_len check (
    phone is null
    or phone = ''
    or char_length(phone) between 8 and 32
  );
