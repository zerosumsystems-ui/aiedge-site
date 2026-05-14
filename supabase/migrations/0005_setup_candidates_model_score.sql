-- Per-candidate model output. The score is a calibrated probability
-- (Brier ~0.21 on the V1 LogReg baseline) so 0 = "model thinks this
-- won't pay" and 1 = "model thinks this will pay." Target name + model
-- version live alongside so when we retrain or swap targets (e.g. from
-- mfe_ge_1pct to net_positive), the meaning of the number stays
-- self-describing.
alter table public.setup_candidates
  add column if not exists model_score real,
  add column if not exists model_target text,
  add column if not exists model_version text,
  add column if not exists model_scored_at timestamptz;

-- Hot index for "sort scanner list by model_score desc, latest sessions
-- first." Partial index on rows that actually have a score so we don't
-- pay for the 285 pre-scoring rows once the live scorer is in place.
create index if not exists setup_candidates_model_score_idx
  on public.setup_candidates (session_date desc, model_score desc)
  where model_score is not null;
