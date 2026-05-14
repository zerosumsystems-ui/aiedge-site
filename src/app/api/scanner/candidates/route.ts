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
        'fired_bar_index, consecutive_count, strong_count, score, status, source, created_at',
    )
    .order('session_date', { ascending: false })
    .order('score', { ascending: false })
    .limit(limit)

  if (pattern) q = q.eq('pattern', pattern)
  if (direction) q = q.eq('direction', direction)
  if (symbol) q = q.eq('symbol', symbol.toUpperCase())
  if (since) q = q.gte('session_date', since)

  const { data, error } = await q
  if (error) {
    return Response.json(
      { error: error.message },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    )
  }

  return Response.json(
    { candidates: data ?? [], filters: { pattern, direction, symbol, since, limit } },
    {
      status: 200,
      headers: {
        // Short edge cache — backfill batches change on a slow cadence,
        // but live writes will start landing once the aggregator pipes
        // candidates in. 15s is a fair freshness/perf tradeoff for V1.
        'Cache-Control': 'public, s-maxage=15, stale-while-revalidate=60',
      },
    },
  )
}
