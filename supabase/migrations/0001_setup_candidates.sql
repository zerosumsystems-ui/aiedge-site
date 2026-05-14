-- Scanner-emitted setup candidates.
--
-- One row per (symbol, session_date, pattern, direction) — the scanner
-- upserts on that key so re-runs are idempotent. The chart UI deep-links
-- via `/chart?symbol=...&t=fire_ts&pattern=...` (epoch seconds).
--
-- Backfill batch sources: rule-based detectors in scripts/ (tfo, …).
-- Live source (future): the Fly aggregator on each closed bar.

create table if not exists public.setup_candidates (
  id              bigserial primary key,
  symbol          text        not null,
  session_date    date        not null,
  pattern         text        not null,   -- 'tfo', and one row per future pattern
  direction       text        not null,   -- 'long' | 'short'
  fire_ts         bigint      not null,   -- epoch seconds (bar open)
  pivot_index     integer     not null,
  fired_bar_index integer     not null,
  consecutive_count integer   not null,
  strong_count    integer     not null,
  score           double precision not null,
  -- Trader review state. Defaults to 'new'; UI flips to
  -- 'good'/'bad'/'traded' (or whatever taxonomy we settle on).
  status          text        not null default 'new',
  source          text        not null default 'backfill', -- 'backfill' | 'live'
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  -- Idempotent upsert key.
  constraint setup_candidates_unique_per_session
    unique (symbol, session_date, pattern, direction)
);

create index if not exists setup_candidates_fire_ts_idx
  on public.setup_candidates (fire_ts desc);
create index if not exists setup_candidates_session_date_idx
  on public.setup_candidates (session_date desc);
create index if not exists setup_candidates_score_idx
  on public.setup_candidates (score desc);
create index if not exists setup_candidates_pattern_dir_idx
  on public.setup_candidates (pattern, direction);

-- RLS — read-only for anon (the public /scanner page is signed-out
-- friendly), service role writes via the backfill + live paths.
alter table public.setup_candidates enable row level security;

create policy "setup_candidates: anon read"
  on public.setup_candidates for select
  to anon, authenticated
  using (true);

-- Service role bypasses RLS automatically; no insert/update policy
-- means only the service role can write. Don't add a write policy.
