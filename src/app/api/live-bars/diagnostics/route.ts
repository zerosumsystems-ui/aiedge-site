export const dynamic = "force-dynamic"

/**
 * GET /api/live-bars/diagnostics
 *
 * Operator-facing health probe for the Fly live-bar aggregator and the
 * Upstash store it writes to. Pings each side independently so you can
 * tell at a glance whether the aggregator is up and whether the bars
 * have actually made it into Redis.
 *
 * The returned shape is intentionally flat for `curl … | jq` use:
 *
 *   {
 *     ok: boolean,                // aggregator reachable AND healthy
 *     aggregator: {
 *       url: string,              // upstream host being probed
 *       reachable: boolean,
 *       status: number | null,    // HTTP status from /health
 *       latency_ms: number,
 *       error: string | null,
 *       body: {…}                 // raw /health JSON when reachable
 *     },
 *     upstash: {
 *       configured: boolean,
 *       subscribed_symbols: string[] | null,
 *       sample_keys: number       // distinct bars:1m:* keys present
 *     }
 *   }
 *
 * No auth — values are operationally useful but contain no secrets
 * (Fly URL is public, Upstash URL not exposed in the response).
 */

type AggregatorProbe = {
  url: string
  reachable: boolean
  status: number | null
  latency_ms: number
  error: string | null
  body: unknown
}

type UpstashProbe = {
  configured: boolean
  subscribed_symbols: string[] | null
  sample_keys: number
  error: string | null
}

async function probeAggregator(): Promise<AggregatorProbe> {
  const base = (process.env.LIVE_BARS_INTERNAL_URL || "https://aiedge-live-bars.fly.dev").replace(/\/$/, "")
  const url = `${base}/health`
  const t0 = Date.now()
  try {
    const resp = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(4_000),
    })
    const latency_ms = Date.now() - t0
    let body: unknown = null
    try {
      body = await resp.json()
    } catch {
      body = await resp.text().catch(() => null)
    }
    return {
      url: base,
      reachable: true,
      status: resp.status,
      latency_ms,
      error: null,
      body,
    }
  } catch (error) {
    return {
      url: base,
      reachable: false,
      status: null,
      latency_ms: Date.now() - t0,
      error: error instanceof Error ? error.message : String(error),
      body: null,
    }
  }
}

async function probeUpstash(): Promise<UpstashProbe> {
  const base = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!base || !token) {
    return { configured: false, subscribed_symbols: null, sample_keys: 0, error: null }
  }
  const headers = { Authorization: `Bearer ${token}` }
  const root = base.replace(/\/$/, "")
  try {
    const [smembersResp, scanResp] = await Promise.all([
      fetch(`${root}/smembers/live:subscribed`, { method: "POST", headers, cache: "no-store", signal: AbortSignal.timeout(4_000) }),
      fetch(`${root}/scan/0/match/bars:1m:*/count/200`, { method: "POST", headers, cache: "no-store", signal: AbortSignal.timeout(4_000) }),
    ])
    const subscribedJson = (await smembersResp.json().catch(() => ({}))) as { result?: unknown }
    const scanJson = (await scanResp.json().catch(() => ({}))) as { result?: [string, unknown[]] }
    const subscribed = Array.isArray(subscribedJson.result)
      ? subscribedJson.result.map((value) => String(value).toUpperCase()).filter(Boolean)
      : []
    const keys = Array.isArray(scanJson.result?.[1]) ? scanJson.result[1] : []
    return {
      configured: true,
      subscribed_symbols: subscribed,
      sample_keys: keys.length,
      error: null,
    }
  } catch (error) {
    return {
      configured: true,
      subscribed_symbols: null,
      sample_keys: 0,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

export async function GET() {
  const [aggregator, upstash] = await Promise.all([probeAggregator(), probeUpstash()])
  const ok = aggregator.reachable && aggregator.status === 200
  return Response.json(
    { ok, aggregator, upstash },
    {
      status: ok ? 200 : 502,
      headers: { "Cache-Control": "no-store" },
    },
  )
}
