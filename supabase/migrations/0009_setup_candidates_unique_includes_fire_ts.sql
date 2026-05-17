-- Pullbacks recur intraday, so one row per
-- (symbol, session_date, pattern, direction) is too strict — the live
-- pullback runner emits many fires per symbol per session.
--
-- Adding fire_ts to the uniqueness key gives each distinct fire its own
-- candidate row. This only LOOSENS the constraint: TFO fires once per
-- session/direction with a deterministic fire_ts, so its dedup-on-409
-- behavior in live_tfo_runner is unchanged, and no existing row can
-- conflict under the wider key.
alter table public.setup_candidates
  drop constraint if exists setup_candidates_unique_per_session;

alter table public.setup_candidates
  add constraint setup_candidates_unique_per_session
  unique (symbol, session_date, pattern, direction, fire_ts);
