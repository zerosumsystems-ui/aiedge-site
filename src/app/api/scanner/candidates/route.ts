import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * GET /api/scanner/candidates
 *
 * Returns rows from public.setup_candidates with optional filters.
 *
 *   pattern=tfo                  — filter by pattern slug
 *   direction=long|short         — filter by direction
 *   symbol=SPY                   — filter by ticker
 *   since=YYYY-MM-DD             — only sessions on/after this date
 *   limit=200                    — max rows (default 200, cap 500)
 *
 * Ordered by session_date desc, score desc. The table is anon-readable
 * (RLS policy), so this route doesn't gate on a session.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const pattern = searchParams.get('pattern')
  const direction = searchParams.get('direction')
  const symbol = searchParams.get('symbol')
  const since = searchParams.get('since')
  const date = searchParams.get('date')                  // exact session_date match
  const limitRaw = Number(searchParams.get('limit') ?? 200)
  const limit = Math.min(Math.max(Number.isFinite(limitRaw) ? Math.floor(limitRaw) : 200, 1), 500)

  let supabase
  try {
    supabase = await createClient()
  } catch {
    return Response.json(
      { error: 'supabase not configured' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    )
  }

  let q = supabase
    .from('setup_candidates')
    .select(
      'id, symbol, session_date, pattern, direction, fire_ts, pivot_index, ' +
        'fired_bar_index, consecutive_count, strong_count, score, status, note, source, created_at, ' +
        'outcome_window_bars, outcome_net_pct, outcome_mfe_pct, outcome_mae_pct, outcome_bars_seen, outcome_computed_at, ' +
        'features, features_extracted_at, ' +
        'model_score, model_target, model_version, model_scored_at',
    )
    // Within a session, model_score desc surfaces the "model thinks this
    // pays" candidates first. Rule-based score is the final tiebreaker
    // so behavior is unchanged on rows without a model score yet.
    .order('session_date', { ascending: false })
    .order('model_score', { ascending: false, nullsFirst: false })
    .order('score', { ascending: false })
    .limit(limit)

  if (pattern) q = q.eq('pattern', pattern)
  if (direction) q = q.eq('direction', direction)
  if (symbol) q = q.eq('symbol', symbol.toUpperCase())
  if (since) q = q.gte('session_date', since)
  if (date) q = q.eq('session_date', date)

  const { data, error } = await q
  if (error) {
    return Response.json(
      { error: error.message },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    )
  }

  // A pinned lookup (symbol + pattern + direction + exact date) is the
  // SymbolPage feedback form's read path — it needs to reflect the user's
  // last save instantly, so it bypasses the edge cache. The list view
  // (no exact date) gets a short s-maxage to absorb scanner-page traffic.
  const pinned = !!(symbol && pattern && direction && date)
  const cacheControl = pinned
    ? 'no-store'
    : 'public, s-maxage=15, stale-while-revalidate=60'
  return Response.json(
    { candidates: data ?? [], filters: { pattern, direction, symbol, since, date, limit } },
    {
      status: 200,
      headers: { 'Cache-Control': cacheControl },
    },
  )
}
