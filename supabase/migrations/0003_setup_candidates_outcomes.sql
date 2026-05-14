-- Objective outcome stats for each scanner candidate, computed once per
-- candidate by scripts/compute_tfo_outcomes.py. Window = N bars after
-- the fire bar (default 24 x 5min = 2h). Net is signed relative to the
-- direction (long: close-fire vs fire close; short: fire close - close).
-- MFE / MAE are favorable / adverse excursion percentages within the
-- window, both expressed as positive numbers.

alter table public.setup_candidates
  add column if not exists outcome_window_bars integer,
  add column if not exists outcome_net_pct      double precision,
  add column if not exists outcome_mfe_pct      double precision,
  add column if not exists outcome_mae_pct      double precision,
  add column if not exists outcome_bars_seen    integer,
  add column if not exists outcome_computed_at  timestamptz;

create index if not exists setup_candidates_outcome_net_idx
  on public.setup_candidates (outcome_net_pct desc);
