import type { Bar, ChartTimeframe } from "@/lib/types"
import { isUpstashConfigured, zrangebyscore } from "@/lib/upstash"

export const dynamic = "force-dynamic"

/**
 * GET /api/bars/live?ticker=SPY&minutes=60
 *
 * Reads the trailing live bar window from Upstash Redis. The
 * scripts/live_bars_aggregator.py process writes each closed 1-minute
 * bar to a sorted set keyed by ticker (`bars:1m:SPY`, score = ts).
 *
 * Companion to /api/bars (historical). The chart component fetches both
 * and stitches: hist for everything older, live for the trailing N min.
 *
 * Returns 503 while the live wiring isn't fully provisioned, so callers
 * can fall back gracefully to hist with the existing 60-min clamp.
 */

interface LiveBarsResponse {
  bars: Bar[]
  timeframe: ChartTimeframe
  effectiveTimeframe: ChartTimeframe
  ticker: string
  from: string
  to: string
  source: "databento-live"
}

function parseBar(member: string): Bar | null {
  try {
    const parsed = JSON.parse(member) as Partial<Bar>
    if (typeof parsed.t !== "number") return null
    if (
      typeof parsed.o !== "number" ||
      typeof parsed.h !== "number" ||
      typeof parsed.l !== "number" ||
      typeof parsed.c !== "number"
    ) {
      return null
    }
    return {
      t: parsed.t,
      o: parsed.o,
      h: parsed.h,
      l: parsed.l,
      c: parsed.c,
      v: typeof parsed.v === "number" ? parsed.v : undefined,
    }
  } catch {
    return null
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const ticker = (searchParams.get("ticker") ?? "").toUpperCase()
  const minutes = Math.min(Math.max(Number(searchParams.get("minutes") ?? 60) || 60, 1), 360)

  if (!ticker) {
    return Response.json(
      { error: "ticker is required" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    )
  }

  const now = Math.floor(Date.now() / 1000)
  const from = now - minutes * 60

  if (!isUpstashConfigured()) {
    const payload: LiveBarsResponse = {
      bars: [],
      timeframe: "1min",
      effectiveTimeframe: "1min",
      ticker,
      from: new Date(from * 1000).toISOString(),
      to: new Date(now * 1000).toISOString(),
      source: "databento-live",
    }

    return Response.json(payload, {
      headers: {
        "Cache-Control": "no-store",
        "X-Live-Status": "upstash-not-configured",
      },
    })
  }

  const members = await zrangebyscore(`bars:1m:${ticker}`, from, now)
  const bars = members
    .map(parseBar)
    .filter((b): b is Bar => b !== null)
    .sort((a, b) => a.t - b.t)

  const payload: LiveBarsResponse = {
    bars,
    timeframe: "1min",
    effectiveTimeframe: "1min",
    ticker,
    from: new Date(from * 1000).toISOString(),
    to: new Date(now * 1000).toISOString(),
    source: "databento-live",
  }

  return Response.json(payload, {
    headers: {
      "Cache-Control": "no-store",
      "X-Live-Status": bars.length > 0 ? "ok" : "empty-set",
    },
  })
}
