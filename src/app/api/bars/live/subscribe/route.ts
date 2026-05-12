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
 */

const TICKER_RE = /^[A-Z][A-Z0-9.\-]{0,9}$/

export async function POST(request: Request) {
  const url = new URL(request.url)
  const ticker = (url.searchParams.get("ticker") || "").trim().toUpperCase()
  if (!ticker || !TICKER_RE.test(ticker)) {
    return Response.json({ ok: false, error: "invalid ticker" }, { status: 400 })
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
  try {
    const resp = await fetch(upstreamUrl, {
      method: "POST",
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(6000),
    })
    const body = await resp.json().catch(() => ({}))
    return Response.json(body, { status: resp.ok ? 200 : resp.status })
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 502 },
    )
  }
}
