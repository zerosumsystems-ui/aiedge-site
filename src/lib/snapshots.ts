import { createAdminClient } from './supabase/admin'

/**
 * Snapshot key → JSON payload persistence, backed by the api_snapshots table.
 *
 * Routes in src/app/api/* used to keep the latest synced payload in a
 * module-level variable + /tmp file. On Vercel that's per-instance, so a
 * sync POST that lands on instance A is invisible to GETs routed to B.
 * This helper gives every instance the same canonical view.
 *
 * Sync scripts and route handler payload shapes are unchanged — the
 * strongly-typed TS interfaces in @/lib/types remain the source of truth;
 * we just round-trip them through JSONB.
 */

export type SnapshotKey =
  | 'vault'
  | 'trades'
  | 'journal'
  | 'patterns'
  | 'progress'
  | 'review'
  | 'scan'
  | 'scan-history'

export async function getSnapshot<T>(key: SnapshotKey, empty: T): Promise<T> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('api_snapshots')
    .select('payload')
    .eq('key', key)
    .maybeSingle()

  if (error) {
    console.error(`[snapshots] getSnapshot(${key}) failed:`, error.message)
    return empty
  }

  return (data?.payload as T | undefined) ?? empty
}

export async function setSnapshot<T>(key: SnapshotKey, payload: T): Promise<void> {
  const supabase = createAdminClient()
  const { error } = await supabase.from('api_snapshots').upsert(
    {
      key,
      payload: payload as unknown as Record<string, unknown>,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'key' }
  )

  if (error) {
    throw new Error(`setSnapshot(${key}) failed: ${error.message}`)
  }
}
