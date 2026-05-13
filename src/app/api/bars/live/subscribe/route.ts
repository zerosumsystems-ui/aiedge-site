export const dynamic = "force-dynamic"

/**
 * POST /api/bars/live/subscribe?ticker=ABC
 *
 * Asks the Fly live-bar aggregator to dynamically subscribe to a new
 * ticker via its /subscribe endpoint. Without this, custom symbols
 * fall back to Databento Historical and are stuck at the ~35-min
 * publish frontier. Subscribed symbols stream into Upstash like the
 * default set.
 *
 * Requires LIVE_BARS_INTERNAL_URL (e.g. https://aiedge-live-bars.fly.dev)
 * and optionally LIVE_SUBSCRIBE_TOKEN (shared bearer with Fly). When
 * the URL isn't set the route degrades to a 503 and the chart silently
 * keeps using historical data.
 *
 * Resilience:
 *  - Single in-process memo of recent positive/negative outcomes keyed
 *    by ticker, so concurrent clients and quick reloads don't hammer a
 *    known-bad upstream. Negative cache is short (30s) so transient
 *    aggregator hiccups recover quickly; positive cache is long (10m)
 *    since the upstream subscribe is idempotent.
 *  - One retry on transient failures (network error / 5xx / timeout)
 *    with a 250ms backoff. Per-attempt timeout is 4s so the total
 *    wallclock stays under ~9s even with the retry.
 */

const TICKER_RE = /^[A-Z][A-Z0-9.\-]{0,9}$/

type MemoEntry = { ok: boolean; status: number; body: unknown; expiresAt: number }
const POSITIVE_TTL_MS = 10 * 60_000
const NEGATIVE_TTL_MS = 30_000
const PER_ATTEMPT_TIMEOUT_MS = 4_000
const RETRY_BACKOFF_MS = 250

const memo: Map<string, MemoEntry> = (globalThis as unknown as {
  __subscribeMemo?: Map<string, MemoEntry>
}).__subscribeMemo ?? new Map()
;(globalThis as unknown as { __subscribeMemo?: Map<string, MemoEntry> }).__subscribeMemo = memo

async function attemptSubscribe(
  upstreamUrl: string,
  headers: Record<string, string>,
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const resp = await fetch(upstreamUrl, {
    method: "POST",
    headers,
    cache: "no-store",
    signal: AbortSignal.timeout(PER_ATTEMPT_TIMEOUT_MS),
  })
  const body = await resp.json().catch(() => ({}))
  return { ok: resp.ok, status: resp.status, body }
}

export async function POST(request: Request) {
  const url = new URL(request.url)
  const ticker = (url.searchParams.get("ticker") || "").trim().toUpperCase()
  if (!ticker || !TICKER_RE.test(ticker)) {
    return Response.json({ ok: false, error: "invalid ticker" }, { status: 400 })
  }

  const now = Date.now()
  const cached = memo.get(ticker)
  if (cached && cached.expiresAt > now) {
    return Response.json(cached.body, { status: cached.ok ? 200 : cached.status })
  }

  // Default to the production Fly app — overridable via env for
  // staging or local testing. Without this default, every Vercel
  // env that hadn't set LIVE_BARS_INTERNAL_URL would silently 503
  // and custom symbols would stay 35 min behind even though the
  // aggregator was happy to accept the subscribe.
  const upstreamBase = process.env.LIVE_BARS_INTERNAL_URL || "https://aiedge-live-bars.fly.dev"

  const headers: Record<string, string> = {}
  const token = process.env.LIVE_SUBSCRIBE_TOKEN
  if (token) headers.Authorization = `Bearer ${token}`

  const upstreamUrl = `${upstreamBase.replace(/\/$/, "")}/subscribe?ticker=${encodeURIComponent(ticker)}`

  let lastError: unknown = null
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const result = await attemptSubscribe(upstreamUrl, headers)
      const expiresAt = Date.now() + (result.ok ? POSITIVE_TTL_MS : NEGATIVE_TTL_MS)
      memo.set(ticker, { ...result, expiresAt })
      return Response.json(result.body, { status: result.ok ? 200 : result.status })
    } catch (error) {
      lastError = error
      if (attempt === 0) await new Promise((r) => setTimeout(r, RETRY_BACKOFF_MS))
    }
  }
  const body = { ok: false, error: lastError instanceof Error ? lastError.message : String(lastError) }
  memo.set(ticker, { ok: false, status: 502, body, expiresAt: Date.now() + NEGATIVE_TTL_MS })
  return Response.json(body, { status: 502 })
}
