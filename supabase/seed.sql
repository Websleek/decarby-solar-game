-- Local seed aligned with hashLevelConfiguration() / Phase 3A approved versions.
-- Prefer applying migrations (including 20260320120000) over relying only on this file.

insert into public.game_level_versions (level_id, version, configuration_hash, active)
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
