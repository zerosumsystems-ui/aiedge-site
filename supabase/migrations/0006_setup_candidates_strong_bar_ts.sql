-- Persist the exact timestamps of Brooks-strong confirming bars
-- alongside the candidate. The detector already decides which bars
-- qualify (scripts/tfo_detector.py via _confirming_run); without this
-- column the chart re-runs the Brooks rule in JS to paint them, which
-- is duplicated logic that can silently drift. Storing the source of
-- truth in one place eliminates that.
--
-- integer[] holds unix epoch seconds for each Brooks-strong bar in
-- chronological order. Nullable for back-compat with rows detected
-- before this column existed; a backfill rerun populates them.
alter table public.setup_candidates
  add column if not exists strong_bar_ts integer[];
