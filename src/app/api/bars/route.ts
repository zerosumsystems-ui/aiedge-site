import type { Bar, ChartTimeframe } from '@/lib/types'
import { requireSession } from '@/lib/auth/require-session'

export const dynamic = 'force-dynamic'

/**
 * GET /api/bars?ticker=IONQ&from=2026-04-01&to=2026-04-15&tf=auto
 *
 * Fetches historical OHLC bars from Databento for an arbitrary ticker +
 * date range. Returns ChartData-compatible shape so LightweightChart can
 * render directly.
 *
 *   tf=auto         → we pick based on range length (details below)
 *   tf=5min|15min|1h|daily → explicit override
 *
 * Databento is our canonical market-data provider (see feedback_databento_only
 * in user memory). Uses the Historical REST API directly — no SDK, since the
 * `databento` npm package is unmaintained. Auth is HTTP Basic with the API key
 * as the username and an empty password.
 *
 * Auto timeframe heuristic (targets a readable 50-300 bar chart):
 *   Same session         (<1 day)   → ohlcv-1m  (we'll downsample to 5m if needed)
 *   1-3 day hold                    → ohlcv-1m  (rendered as 15m effective)
 *   4-14 day hold                   → ohlcv-1h
 *   15+ day hold                    → ohlcv-1d
 *
 * Databento EQUS.MINI dataset covers US consolidated equity data. Matches what
 * the scanner uses (backfill_historical_databento.py).
 */

interface BarsResponse {
  bars: Bar[]
  timeframe: ChartTimeframe
  effectiveTimeframe: ChartTimeframe
  ticker: string
  from: string
  to: string
  source: 'databento'
}

type DatabentoSchema = 'ohlcv-1s' | 'ohlcv-1m' | 'ohlcv-1h' | 'ohlcv-1d'

function pickSchema(fromMs: number, toMs: number): DatabentoSchema {
  const days = (toMs - fromMs) / 86_400_000
  if (days < 1) return 'ohlcv-1m'
  if (days <= 3) return 'ohlcv-1m'
  if (days <= 14) return 'ohlcv-1h'
  return 'ohlcv-1d'
}

function schemaToTimeframe(schema: DatabentoSchema): ChartTimeframe {
  switch (schema) {
    case 'ohlcv-1s':
    case 'ohlcv-1m':
      return '5min'
    case 'ohlcv-1h':
      return '1h'
    case 'ohlcv-1d':
      return 'daily'
  }
}

function overrideToSchema(tf: ChartTimeframe): DatabentoSchema {
  switch (tf) {
    case '5min':
    case '15min':
      return 'ohlcv-1m'
    case '1h':
      return 'ohlcv-1h'
    case 'daily':
    case 'weekly':
      // Databento doesn't expose ohlcv-1w — fetch daily and aggregate here.
      return 'ohlcv-1d'
  }
}

/**
 * Downsample 1-minute bars into wider buckets (5m, 15m) client-server side.
 * Databento's ohlcv schemas are fixed at 1s/1m/1h/1d, so for 5min + 15min
 * chart periods we fetch 1m bars and aggregate here.
 */
function downsample(bars: Bar[], minutesPerBucket: number): Bar[] {
  if (minutesPerBucket <= 1 || bars.length === 0) return bars
  const bucketSec = minutesPerBucket * 60
  const out: Bar[] = []
  let current: Bar | null = null
  for (const b of bars) {
    const bucketStart = Math.floor(b.t / bucketSec) * bucketSec
    if (!current || current.t !== bucketStart) {
      if (current) out.push(current)
      current = { t: bucketStart, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v }
    } else {
      current.h = Math.max(current.h, b.h)
      current.l = Math.min(current.l, b.l)
      current.c = b.c
      current.v = (current.v ?? 0) + (b.v ?? 0)
    }
  }
  if (current) out.push(current)
  return out
}

/**
 * Aggregate daily bars into weekly (Mon–Fri, keyed by the Monday of each
 * week). Open = first trading day's open, high = max, low = min, close =
 * last trading day's close. Volume summed.
 */
function downsampleWeekly(bars: Bar[]): Bar[] {
  if (bars.length === 0) return bars
  const out: Bar[] = []
  let current: Bar | null = null
  let currentWeekKey = ''
  for (const b of bars) {
    const d = new Date(b.t * 1000)
    // Move back to the most-recent Monday (ET-agnostic; weeks are coarse).
    const dow = d.getUTCDay() // 0 Sun … 6 Sat
    const daysBackToMon = ((dow + 6) % 7)
    const monday = new Date(d)
    monday.setUTCDate(d.getUTCDate() - daysBackToMon)
    monday.setUTCHours(0, 0, 0, 0)
    const weekKey = monday.toISOString().slice(0, 10)
    if (weekKey !== currentWeekKey) {
      if (current) out.push(current)
      currentWeekKey = weekKey
      current = {
        t: Math.floor(monday.getTime() / 1000),
        o: b.o, h: b.h, l: b.l, c: b.c, v: b.v,
      }
    } else if (current) {
      current.h = Math.max(current.h, b.h)
      current.l = Math.min(current.l, b.l)
      current.c = b.c
      current.v = (current.v ?? 0) + (b.v ?? 0)
    }
  }
  if (current) out.push(current)
  return out
}

/** Parse Databento JSON-lines OHLCV row. Prices use pretty_px=true so they're
 * plain floats; ts_event is ISO8601 or epoch ns depending on version. */
interface DatabentoOhlcv {
  hd?: { ts_event?: string | number }
  ts_event?: string | number
  open?: number | string
  high?: number | string
  low?: number | string
  close?: number | string
  volume?: number | string
}

function parseBar(row: DatabentoOhlcv): Bar | null {
  const ts = row.hd?.ts_event ?? row.ts_event
  if (ts == null) return null
  // ts_event may be ISO string or nanosecond epoch int
  let tSec: number
  if (typeof ts === 'string') {
    tSec = Math.floor(new Date(ts).getTime() / 1000)
  } else {
    // epoch ns → seconds
    tSec = Math.floor(Number(ts) / 1_000_000_000)
  }
  if (!Number.isFinite(tSec)) return null
  const o = Number(row.open)
  const h = Number(row.high)
  const l = Number(row.low)
  const c = Number(row.close)
  const v = row.volume == null ? undefined : Number(row.volume)
  if (!Number.isFinite(o) || !Number.isFinite(h) || !Number.isFinite(l) || !Number.isFinite(c)) {
    return null
  }
  return { t: tSec, o, h, l, c, v }
}

export async function GET(request: Request) {
  const unauth = await requireSession(request)
  if (unauth) return unauth

  const apiKey = process.env.DATABENTO_API_KEY
  if (!apiKey) {
    return Response.json(
      { error: 'DATABENTO_API_KEY not configured on the server' },
      { status: 503 }
    )
  }

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

  // Context padding — 20% on each side for intraday, 5 days for daily.
  const schema: DatabentoSchema =
    tfParam === 'auto'
      ? pickSchema(fromDate.getTime(), toDate.getTime())
      : overrideToSchema(tfParam)
  const timeframe: ChartTimeframe =
    tfParam === 'auto' ? schemaToTimeframe(schema) : tfParam
  // Context padding: weekly needs ~6 months of history so the chart has
  // enough bars to read; daily gets a 1-week cushion; intraday 20% each side.
  const padMs =
    timeframe === 'weekly'
      ? 180 * 86_400_000
      : schema === 'ohlcv-1d'
        ? 5 * 86_400_000
        : Math.max((toDate.getTime() - fromDate.getTime()) * 0.2, 3_600_000)
  const paddedFrom = new Date(fromDate.getTime() - padMs)
  const paddedTo = new Date(Math.min(toDate.getTime() + padMs, Date.now()))

  // Databento Historical API — HTTP Basic auth, key as username, empty pw.
  const url = new URL('https://hist.databento.com/v0/timeseries.get_range')
  url.searchParams.set('dataset', 'EQUS.MINI')
  url.searchParams.set('symbols', ticker)
  url.searchParams.set('schema', schema)
  url.searchParams.set('start', paddedFrom.toISOString())
  url.searchParams.set('end', paddedTo.toISOString())
  url.searchParams.set('encoding', 'json')
  url.searchParams.set('pretty_px', 'true')
  url.searchParams.set('pretty_ts', 'true')

  const auth =
    'Basic ' + Buffer.from(`${apiKey}:`, 'utf8').toString('base64')

  try {
    const resp = await fetch(url, { headers: { Authorization: auth } })
    if (!resp.ok) {
      const body = await resp.text()
      console.error(`[bars] databento ${resp.status}:`, body.slice(0, 500))
      return Response.json(
        { error: `databento ${resp.status}: ${body.slice(0, 300)}`, ticker, from, to },
        { status: 502 }
      )
    }

    // JSON lines — one record per line.
    const text = await resp.text()
    const rawBars: Bar[] = []
    for (const line of text.split('\n')) {
      const t = line.trim()
      if (!t) continue
      try {
        const row = JSON.parse(t) as DatabentoOhlcv
        const bar = parseBar(row)
        if (bar) rawBars.push(bar)
      } catch {
        // Skip malformed lines
      }
    }

    // Downsample for requested effective timeframe.
    let bars = rawBars
    let effectiveTimeframe: ChartTimeframe = timeframe
    if (schema === 'ohlcv-1m') {
      if (timeframe === '15min') {
        bars = downsample(rawBars, 15)
        effectiveTimeframe = '15min'
      } else if (timeframe === '5min') {
        bars = downsample(rawBars, 5)
        effectiveTimeframe = '5min'
      } else {
        effectiveTimeframe = '5min'
        bars = downsample(rawBars, 5)
      }
    } else if (timeframe === 'weekly' && schema === 'ohlcv-1d') {
      bars = downsampleWeekly(rawBars)
      effectiveTimeframe = 'weekly'
    }

    // Hard cap — 78 candles max per chart (one RTH session at 5-min bars).
    // More than this causes analysis paralysis on a fast Brooks read. See
    // user memory: feedback_chart_candle_cap. Tail keeps the most recent
    // bars so the trade-exit context is preserved in round-trip charts.
    const MAX_BARS = 78
    if (bars.length > MAX_BARS) {
      bars = bars.slice(-MAX_BARS)
    }

    const payload: BarsResponse = {
      bars,
      timeframe,
      effectiveTimeframe,
      ticker,
      from,
      to,
      source: 'databento',
    }
    return Response.json(payload, {
      // Historical bars are immutable — cache at edge.
      headers: { 'Cache-Control': 'public, s-maxage=3600, max-age=600' },
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[bars] ${ticker} ${from}→${to} @ ${schema} failed:`, message)
    return Response.json(
      { error: `bars fetch failed: ${message}`, ticker, from, to, timeframe },
      { status: 502 }
    )
  }
}
