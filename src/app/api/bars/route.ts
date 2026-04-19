import type { Bar, ChartTimeframe } from '@/lib/types'
import { requireSession } from '@/lib/auth/require-session'
import yahooFinance from 'yahoo-finance2'

export const dynamic = 'force-dynamic'

/**
 * GET /api/bars?ticker=IONQ&from=2026-04-01&to=2026-04-15&tf=auto
 *
 * Fetches historical OHLC bars from Yahoo Finance for an arbitrary ticker +
 * date range. Returns `ChartData`-compatible shape so LightweightChart can
 * render directly.
 *
 *   tf=auto         → we pick based on the range (details below)
 *   tf=5min|15min|1h|daily → explicit override
 *
 * Why Yahoo and not Databento: Databento requires a paid license + live feed
 * credentials that aren't in the Vercel env. Yahoo is free, no-key, works
 * from serverless, and is fine for post-fact journal chart rendering.
 *
 * Auto timeframe heuristic (optimized for a readable 50-200 bar chart):
 *   Same session         (<1 day)   → 5min
 *   1-3 day hold                    → 15min
 *   4-14 day hold                   → 1h
 *   15+ day hold                    → daily
 *
 * Yahoo pads in "5m" and "15m" granularity only for the last ~60 days; older
 * ranges silently fall back to daily. We detect that and report the effective
 * timeframe so the UI can surface it.
 */

interface BarsResponse {
  bars: Bar[]
  timeframe: ChartTimeframe
  effectiveTimeframe: ChartTimeframe // what Yahoo actually returned
  ticker: string
  from: string
  to: string
  source: 'yahoo'
}

function pickTimeframe(fromMs: number, toMs: number): ChartTimeframe {
  const days = (toMs - fromMs) / 86_400_000
  if (days < 1) return '5min'
  if (days <= 3) return '15min'
  if (days <= 14) return '1h'
  return 'daily'
}

function tfToYahooInterval(tf: ChartTimeframe): string {
  switch (tf) {
    case '5min':
      return '5m'
    case '15min':
      return '15m'
    case '1h':
      return '1h'
    case 'daily':
      return '1d'
  }
}

export async function GET(request: Request) {
  const unauth = await requireSession(request)
  if (unauth) return unauth

  const { searchParams } = new URL(request.url)
  const ticker = (searchParams.get('ticker') ?? '').toUpperCase()
  const from = searchParams.get('from')
  const to = searchParams.get('to')
  const tfParam = (searchParams.get('tf') ?? 'auto') as ChartTimeframe | 'auto'

  if (!ticker || !from || !to) {
    return Response.json(
      { error: 'ticker, from, to are required' },
      { status: 400 }
    )
  }

  const fromDate = new Date(from)
  const toDate = new Date(to)
  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
    return Response.json({ error: 'invalid from/to' }, { status: 400 })
  }

  const timeframe: ChartTimeframe =
    tfParam === 'auto'
      ? pickTimeframe(fromDate.getTime(), toDate.getTime())
      : tfParam

  // Yahoo restricts intraday granularity by range. Widen the window a touch
  // so we get context bars before the entry and after the exit (~20% on each
  // side for intraday, 5 days for daily).
  const padMs =
    timeframe === 'daily' ? 5 * 86_400_000 : (toDate.getTime() - fromDate.getTime()) * 0.2
  const paddedFrom = new Date(fromDate.getTime() - padMs)
  const paddedTo = new Date(Math.min(toDate.getTime() + padMs, Date.now()))

  try {
    // chart() is the actual OHLC endpoint; historical() only does daily.
    // Cast is needed because yahoo-finance2's overload resolution picks the
    // untyped overload for our options shape (no explicit `return: 'array'`).
    type YahooQuote = {
      date?: Date | string | number
      open?: number | null
      high?: number | null
      low?: number | null
      close?: number | null
      volume?: number | null
    }
    const result = (await yahooFinance.chart(ticker, {
      period1: paddedFrom,
      period2: paddedTo,
      interval: tfToYahooInterval(timeframe) as
        | '5m'
        | '15m'
        | '1h'
        | '1d',
      return: 'array',
    })) as { quotes?: YahooQuote[] }

    const quotes: YahooQuote[] = result.quotes ?? []
    const bars: Bar[] = []
    for (const q of quotes) {
      if (
        q.date == null ||
        q.open == null ||
        q.high == null ||
        q.low == null ||
        q.close == null
      ) {
        continue
      }
      bars.push({
        t: Math.floor(new Date(q.date).getTime() / 1000),
        o: q.open,
        h: q.high,
        l: q.low,
        c: q.close,
        v: q.volume ?? undefined,
      })
    }

    // Yahoo sometimes returns daily bars when an intraday interval isn't
    // supported for the requested range. Detect by bar spacing.
    let effective: ChartTimeframe = timeframe
    if (bars.length >= 2) {
      const spacingSec = bars[1].t - bars[0].t
      if (spacingSec >= 82_800) effective = 'daily'
      else if (spacingSec >= 3300) effective = '1h'
      else if (spacingSec >= 800) effective = '15min'
      else effective = '5min'
    }

    const payload: BarsResponse = {
      bars,
      timeframe,
      effectiveTimeframe: effective,
      ticker,
      from,
      to,
      source: 'yahoo',
    }
    return Response.json(payload, {
      // Bars for a closed past range are immutable — cache them at the edge.
      headers: { 'Cache-Control': 'public, s-maxage=3600, max-age=600' },
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[bars] ${ticker} ${from}→${to} @ ${timeframe} failed:`, message)
    return Response.json(
      { error: `bars fetch failed: ${message}`, ticker, from, to, timeframe },
      { status: 502 }
    )
  }
}
