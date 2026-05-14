-- Persist the pivot bar's epoch second (LOD for longs, HOD for shorts).
-- The candidate already has pivot_index (0-based session bar index),
-- but mapping that to a wall-clock timestamp at the chart layer requires
-- knowing the session-open epoch — annoying to derive in the client.
-- Storing pivot_ts directly mirrors the fire_ts / strong_bar_ts naming
-- and gives the chart a single value to paint without arithmetic.
--
-- Same one-source-of-truth principle: the detector decides, the chart
-- reads. Nullable for back-compat with rows detected before this column
-- existed; a backfill rerun populates them.
alter table public.setup_candidates
  add column if not exists pivot_ts integer;
