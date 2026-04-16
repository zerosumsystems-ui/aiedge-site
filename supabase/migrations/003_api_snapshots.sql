-- Persistent storage for /api/* route handlers. Replaces the in-memory +
-- /tmp pattern, which was per-serverless-instance and caused data to
-- appear "missing" on most requests after a sync.
--
-- One row per snapshot key: vault, trades, journal, patterns, progress,
-- review, scan, scan-history. Payload is stored as JSONB so the same
-- strongly-typed TS interfaces in @/lib/types remain the source of truth.

CREATE TABLE IF NOT EXISTS api_snapshots (
  key         text        PRIMARY KEY,
  payload     jsonb       NOT NULL DEFAULT '{}'::jsonb,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS api_snapshots_updated_at_idx
  ON api_snapshots (updated_at DESC);

-- Writes go through route handlers with the service-role key, which
-- bypasses RLS. Anon reads are not used (route handlers always read via
-- the service-role client), but RLS is enabled to keep the table locked
-- down if the anon key is ever used accidentally.
ALTER TABLE api_snapshots ENABLE ROW LEVEL SECURITY;
