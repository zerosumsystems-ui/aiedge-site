-- Per-candidate feature vector for ML training. Pure functions of the
-- session 5-min bars; one JSONB blob keyed by short names so we can
-- evolve the feature set without re-running migrations. extracted_at
-- separately so a backfill knows when to re-compute.
alter table public.setup_candidates
  add column if not exists features jsonb,
  add column if not exists features_extracted_at timestamptz;

-- Loosen the TFO-specific NOT NULLs so we can also store other pattern
-- detections (scanner-history ingest, future ML candidates) in the
-- same table without forcing TFO-only columns to carry sentinel values.
alter table public.setup_candidates
  alter column pivot_index drop not null,
  alter column fired_bar_index drop not null,
  alter column consecutive_count drop not null,
  alter column strong_count drop not null,
  alter column score drop not null;
