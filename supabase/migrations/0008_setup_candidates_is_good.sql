-- Objective "good" label, computed at the row level from the
-- outcome columns. This becomes the V2 training target — replaces
-- mfe_ge_1pct, which was ticker-blind and never volatility-aware.
--
-- "Good" = the setup paid at least 1.5× what it cost in heat, AND
-- the favorable move was at least 0.5% absolute (so coin-flip tiny
-- moves don't qualify). MFE / MAE = ~R-multiple of the realized
-- excursion before any model-driven exit, so this is a clean
-- objective verdict on whether the setup was worth taking.
--
-- GENERATED ALWAYS AS ... STORED means Postgres recomputes this
-- whenever outcome_mfe_pct or outcome_mae_pct is updated — no
-- separate job, no risk of drift between the column and the rule.
alter table public.setup_candidates
  add column if not exists is_good boolean GENERATED ALWAYS AS (
    outcome_computed_at IS NOT NULL
    AND outcome_mfe_pct IS NOT NULL
    AND outcome_mae_pct IS NOT NULL
    AND outcome_mfe_pct >= 0.5
    AND outcome_mfe_pct >= 1.5 * outcome_mae_pct
  ) STORED;
