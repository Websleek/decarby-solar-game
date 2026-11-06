-- Phase 3A — seed approved game_level_versions for the five campaign rooftops.
-- Idempotent: upserts on (level_id, version), keeps only the approved current
-- version active per level, and does not delete historical rows.
--
-- Hashes produced by src/backend/levelHash.ts → hashLevelConfiguration().

begin;

-- Deactivate non-approved rows for these levels so the unique active index
-- allows activating the current approved versions.
update public.game_level_versions
set active = false
where level_id in (
  'sunny-house',
  'chimney-challenge',
  'tricky-rooftop',
  'solar-puzzle-master',
  'decarby-solar-champion'
)
and not (
  (level_id = 'sunny-house' and version = 1)
  or (level_id = 'chimney-challenge' and version = 1)
  or (level_id = 'tricky-rooftop' and version = 1)
  or (level_id = 'solar-puzzle-master' and version = 2)
  or (level_id = 'decarby-solar-champion' and version = 1)
);

insert into public.game_level_versions (
  level_id,
  version,
  configuration_hash,
  active
)
values
  ('sunny-house', 1, 'fnv1a_81da96c8', true),
  ('chimney-challenge', 1, 'fnv1a_1fc69ab5', true),
  ('tricky-rooftop', 1, 'fnv1a_e0beb2d8', true),
  ('solar-puzzle-master', 2, 'fnv1a_c126034a', true),
  ('decarby-solar-champion', 1, 'fnv1a_2c9555ba', true)
on conflict (level_id, version) do update
set
  configuration_hash = excluded.configuration_hash,
  active = excluded.active;

-- If a stale active duplicate somehow remains for another version, clear it.
update public.game_level_versions
set active = false
where level_id in (
  'sunny-house',
  'chimney-challenge',
  'tricky-rooftop',
  'solar-puzzle-master',
  'decarby-solar-champion'
)
and active = true
and not (
  (level_id = 'sunny-house' and version = 1)
  or (level_id = 'chimney-challenge' and version = 1)
  or (level_id = 'tricky-rooftop' and version = 1)
  or (level_id = 'solar-puzzle-master' and version = 2)
  or (level_id = 'decarby-solar-champion' and version = 1)
);

commit;
