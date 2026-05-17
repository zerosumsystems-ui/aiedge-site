import type { Bar, ChartTimeframe } from '@/lib/types'
import { filterRegularSessionBars } from '@/lib/opening-features'
import { get as upstashGet, isUpstashConfigured, setEx as upstashSetEx } from '@/lib/upstash'

export const dynamic = 'force-dynamic'

// Per-worker in-flight coalescing. When N visitors request the same slow
// ticker / range at the same time (the AVGO case — Databento Historical
// can take 20s+ for unsubscribed symbols), they all share one upstream
// fetch instead of stampeding the API. Vercel's edge cache picks up the
// completed response afterwards, so subsequent users get instant hits.
type InflightEntry = { promise: Promise<{ status: number; body: string; cacheControl: string }>; startedAt: number }
const inflight: Map<string, InflightEntry> = (globalThis as unknown as {
  __barsInflight?: Map<string, InflightEntry>
}).__barsInflight ?? new Map()
;(globalThis as unknown as { __barsInflight?: Map<string, InflightEntry> }).__barsInflight = inflight
const INFLIGHT_MAX_AGE_MS = 60_000

/**
 * GET /api/bars?ticker=IONQ&from=2026-04-01&to=2026-04-15&tf=auto
 *
 * Fetches historical OHLC bars from Databento for an arbitrary ticker +
 * date range. Returns ChartData-compatible shape so LightweightChart can
 * render directly.
 *
 *   tf=auto         → we pick based on range length (details below)
 *   tf=1min|5min|15min|30min|1h|4h|daily → explicit override
 *   session=open    → same-day RTH opening slice from 09:30 ET; use minutes=5..120
 *   session=rth     → same-day regular session only (09:30-16:00 ET)
 *   session=all     → same-day extended session window (04:00-20:00 ET)
 *   limit=390       → optional output cap override for full-screen chart tools
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
  /**
   * True when the response was capped by the `limit` parameter (or default cap)
   * and earlier bars were dropped. Lets API consumers detect silent truncation
   * without comparing counts.
   */
  truncated?: boolean
  /** Bar count before truncation, when truncation occurred. */
  untruncatedCount?: number
  /**
   * Set when the requested schema was unavailable from Databento and we fell
   * back to a finer schema + aggregated. Helps callers explain unexpected
   * latency or partial-window edges.
   */
  schemaFallback?: 'ohlcv-1h-to-1m'
}

type DatabentoSchema = 'ohlcv-1s' | 'ohlcv-1m' | 'ohlcv-1h' | 'ohlcv-1d'

// EQUS.MINI intraday publishes with a ~30 min lag (empirically observed
// from the 422 frontier message). Keep a small safety buffer above that
// so brief publish-rate dips don't 422. The live aggregator covers the
// remaining gap in real time once it's running.
const DATABENTO_FEED_LAG_MS = 35 * 60 * 1000

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
    case '1min':
      return 'ohlcv-1m'
    case '5min':
    case '15min':
    case '30min':
      return 'ohlcv-1m'
    case '1h':
    case '4h':
      return 'ohlcv-1h'
    case 'daily':
    case 'weekly':
      // Databento doesn't expose ohlcv-1w — fetch daily and aggregate here.
      return 'ohlcv-1d'
  }
}

function etOffsetHours(date: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    timeZoneName: 'shortOffset',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
  }).formatToParts(new Date(`${date}T12:00:00Z`))
  const zone = parts.find((part) => part.type === 'timeZoneName')?.value ?? 'GMT-5'
  const match = zone.match(/GMT([+-]\d{1,2})(?::(\d{2}))?/)
  if (!match) return -5
  const hours = Number(match[1])
  const minutes = Number(match[2] ?? 0)
  return hours + Math.sign(hours) * (minutes / 60)
}

function etDateTimeToUtc(date: string, hour: number, minute: number): Date {
  const [year, month, day] = date.split('-').map(Number)
  const offset = etOffsetHours(date)
  return new Date(Date.UTC(year, month - 1, day, hour - offset, minute))
}

function previousWeekday(date: string): string {
  const [year, month, day] = date.split('-').map(Number)
  if (!year || !month || !day) return date
  const previous = new Date(Date.UTC(year, month - 1, day - 1, 12))
  while (previous.getUTCDay() === 0 || previous.getUTCDay() === 6) {
    previous.setUTCDate(previous.getUTCDate() - 1)
  }
  return previous.toISOString().slice(0, 10)
}

function resolveAvailableSessionDate(date: string, session: string | null, openingMinutes: number): string {
  const window = sessionFetchWindow(date, session, openingMinutes)
  if (!window) return date
  // A Saturday or Sunday never has a trading session, so a same-day
  // request for one would query Databento for a date it has no data on
  // (a 422). Resolve to the prior weekday — the most recent real session.
  const [y, mo, d] = date.split('-').map(Number)
  const dow = new Date(Date.UTC(y, mo - 1, d, 12)).getUTCDay()
  if (dow === 0 || dow === 6) return previousWeekday(date)
  const availableCutoff = Date.now() - DATABENTO_FEED_LAG_MS
  return window.start.getTime() > availableCutoff ? previousWeekday(date) : date
}

function etDate(timestamp: number): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(timestamp * 1000))
}

function etMinutes(timestamp: number): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(timestamp * 1000))
  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? 0)
  const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? 0)
  return hour * 60 + minute
}

function filterSessionBars(
  bars: Bar[],
  fromDate: string,
  toDate: string,
  session: string | null,
  openingMinutes: number,
): Bar[] {
  const inRange = bars.filter((bar) => {
    const d = etDate(bar.t)
    return d >= fromDate && d <= toDate
  })
  if (session === 'open') {
    const openStart = 9 * 60 + 30
    const openEnd = openStart + openingMinutes
    return inRange.filter((bar) => {
      const minutes = etMinutes(bar.t)
      return minutes >= openStart && minutes < openEnd
    })
  }
  if (session === 'rth') {
    return filterRegularSessionBars(inRange)
  }
  if (session === 'all' || session === 'ext') {
    return inRange.filter((bar) => {
      const minutes = etMinutes(bar.t)
      return minutes >= 4 * 60 && minutes < 20 * 60
    })
  }
  return inRange
}

function sessionFetchWindow(date: string, session: string | null, openingMinutes: number): { start: Date; end: Date } | null {
  if (session === 'open') {
    return {
      start: etDateTimeToUtc(date, 9, 30),
      end: etDateTimeToUtc(date, 9, 30 + openingMinutes),
    }
  }
  if (session === 'rth') {
    return {
      start: etDateTimeToUtc(date, 9, 30),
      end: etDateTimeToUtc(date, 16, 0),
    }
  }
  if (session === 'all' || session === 'ext') {
    return {
      start: etDateTimeToUtc(date, 4, 0),
      end: etDateTimeToUtc(date, 20, 0),
    }
  }
  return null
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
  const apiKey = process.env.DATABENTO_API_KEY
  if (!apiKey) {
    return Response.json(
      { error: 'DATABENTO_API_KEY not configured on the server' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    )
  }

  const { searchParams } = new URL(request.url)
  const ticker = (searchParams.get('ticker') ?? '').toUpperCase()
  const from = searchParams.get('from')
  const to = searchParams.get('to')
  const tfParam = (searchParams.get('tf') ?? 'auto') as ChartTimeframe | 'auto'
  const session = searchParams.get('session')
  const openingMinutes = Math.min(Math.max(Number(searchParams.get('minutes') ?? 20) || 20, 5), 120)
  const requestedLimit = Number(searchParams.get('limit') ?? NaN)

  if (!ticker || !from || !to) {
    return Response.json(
      { error: 'ticker, from, to are required' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } }
    )
  }

  // Reject obvious garbage tickers upfront. US-listed equities are
  // 1-5 uppercase letters with optional class suffix (BRK.B, BF-B). Anything
  // outside this gets a clear 400 instead of going to Databento and coming
  // back with an opaque empty result (which a quant pipeline could mistake
  // for "no trading activity").
  if (!/^[A-Z][A-Z0-9.\-]{0,7}$/.test(ticker)) {
    return Response.json(
      { error: `invalid ticker "${ticker}" — expected 1-8 uppercase letters/digits/[.\\-]` },
      { status: 400, headers: { 'Cache-Control': 'no-store' } }
    )
  }

  const sameDaySessionRequest = from === to && sessionFetchWindow(from, session, openingMinutes) !== null
  const resolvedFrom = sameDaySessionRequest ? resolveAvailableSessionDate(from, session, openingMinutes) : from
  const resolvedTo = sameDaySessionRequest ? resolvedFrom : to

  const fromDate = new Date(resolvedFrom)
  const toDate = new Date(resolvedTo)
  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
    return Response.json({ error: 'invalid from/to' }, { status: 400, headers: { 'Cache-Control': 'no-store' } })
  }

  // Future-date short-circuit. Returning 502 from Databento for "from > today"
  // is misleading — it's not a backend error, the data just doesn't exist yet.
  // Match the weekend/holiday behavior (200 with bars: []).
  const todayUtcMidnight = Date.UTC(
    new Date().getUTCFullYear(),
    new Date().getUTCMonth(),
    new Date().getUTCDate(),
  )
  if (fromDate.getTime() > todayUtcMidnight) {
    return Response.json(
      {
        bars: [],
        timeframe: (tfParam === 'auto' ? '5min' : tfParam) as ChartTimeframe,
        effectiveTimeframe: (tfParam === 'auto' ? '5min' : tfParam) as ChartTimeframe,
        ticker,
        from,
        to,
        source: 'databento',
      } satisfies BarsResponse,
      { status: 200, headers: { 'Cache-Control': 'public, s-maxage=60, max-age=60' } }
    )
  }

  // Context padding — 20% on each side for intraday, 5 days for daily.
  const schema: DatabentoSchema =
    tfParam === 'auto'
      ? pickSchema(fromDate.getTime(), toDate.getTime())
      : overrideToSchema(tfParam)
  const timeframe: ChartTimeframe =
    tfParam === 'auto' ? schemaToTimeframe(schema) : tfParam
  // Context padding: weekly needs ~6 months of history so the chart has
  // enough bars to read; daily gets a 1-week cushion; intraday 20% each
  // side with a 24h floor — callers pass YYYY-MM-DD (parsed as UTC midnight),
  // so a same-day intraday trade (from == to) would land entirely outside US
  // RTH without ≥24h of pad. The 78-bar cap below still keeps the chart tight.
  // Build a session window that spans from start-day open through end-day
  // close. The old code only used resolvedFrom for both, which meant any
  // multi-day RTH request stopped at the start day's 16:00 ET and the
  // chart never saw today's bars.
  const fromSessionWindow = sessionFetchWindow(resolvedFrom, session, openingMinutes)
  const toSessionWindow = sessionFetchWindow(resolvedTo, session, openingMinutes)
  const explicitSessionWindow = fromSessionWindow && toSessionWindow
    ? { start: fromSessionWindow.start, end: toSessionWindow.end }
    : null
  const padMs =
    timeframe === 'weekly'
      ? 180 * 86_400_000
      : schema === 'ohlcv-1d'
        ? 5 * 86_400_000
        : Math.max((toDate.getTime() - fromDate.getTime()) * 0.2, 86_400_000)
  const paddedFrom = explicitSessionWindow?.start ?? new Date(fromDate.getTime() - padMs)
  // EQUS.MINI intraday publishes with a ~30 min lag; clamp past that or
  // Databento returns 422 "data_end_after_available_end" on near-realtime queries.
  // Apply the clamp to both the auto-padded path AND explicit RTH/EXT session
  // ends — mid-session, 16:00 ET (RTH) or 20:00 ET (EXT) is still in the future
  // relative to the data Databento has published. The live aggregator
  // (/api/bars/live) is responsible for the last ~30 minutes.
  //
  // Daily / weekly schemas only get a new bar at the end of each session,
  // and Databento exposes the latest one at 00:00 UTC of the *next* day.
  // Use today's UTC midnight as the cap so we don't ask for today's daily
  // bar before it exists (422 data_schema_not_fully_available).
  const lagCutoff =
    schema === 'ohlcv-1d'
      ? new Date(Date.UTC(
          new Date().getUTCFullYear(),
          new Date().getUTCMonth(),
          new Date().getUTCDate(),
        )).getTime() - 60_000
      : Date.now() - DATABENTO_FEED_LAG_MS
  const paddedTo = explicitSessionWindow
    ? new Date(Math.min(explicitSessionWindow.end.getTime(), lagCutoff))
    : new Date(Math.min(toDate.getTime() + padMs, lagCutoff))

  // Databento Historical API — HTTP Basic auth, key as username, empty pw.
  // URL is built inside `fetchSchema` so we can retry with a different schema
  // when the upstream returns `data_schema_not_fully_available`.
  const auth =
    'Basic ' + Buffer.from(`${apiKey}:`, 'utf8').toString('base64')

  const defaultMaxBars = session === 'open' ? openingMinutes : 78
  const maxBars = Number.isFinite(requestedLimit)
    ? Math.min(Math.max(Math.floor(requestedLimit), 1), 1000)
    : defaultMaxBars

  // In-flight coalescing key. Identical concurrent requests join the
  // existing Promise instead of issuing a duplicate upstream fetch. The
  // key includes everything that materially shapes the response body so
  // we never serve one request's payload to another's parameters.
  const inflightKey = [
    ticker,
    resolvedFrom,
    resolvedTo,
    schema,
    timeframe,
    session ?? '',
    openingMinutes,
    maxBars,
    paddedFrom.toISOString(),
    paddedTo.toISOString(),
  ].join('|')

  const now = Date.now()
  // Drop stale entries so a one-off slow response doesn't pin memory.
  for (const [key, entry] of inflight) {
    if (now - entry.startedAt > INFLIGHT_MAX_AGE_MS) inflight.delete(key)
  }

  // Persistent cache for fully-past windows. Bars in a closed window
  // never change, so we back the Vercel edge cache with Upstash Redis
  // and skip Databento entirely on hit. This protects against edge-cache
  // misses (cold region, new visitor, post-revalidation window) where
  // Databento would otherwise take 3-15s for a cold ticker. The cache
  // key mirrors `inflightKey` exactly so two requests with the same
  // shape share both the in-flight Promise AND the Redis entry.
  const todayEt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
  const fullyPast = resolvedTo < todayEt
  const cacheKey = `bars:cache:v2:${inflightKey}`
  if (fullyPast && isUpstashConfigured()) {
    try {
      const cached = await upstashGet(cacheKey)
      if (cached) {
        return new Response(cached, {
          status: 200,
          headers: {
            'Cache-Control': 'public, s-maxage=86400, max-age=86400, immutable',
            'Content-Type': 'application/json',
            'X-Bars-Cache': 'hit',
          },
        })
      }
    } catch {
      // Cache miss/network error — fall through to Databento.
    }
  }

  const existing = inflight.get(inflightKey)
  const work = existing?.promise ?? (async () => {
    // Fetch + parse rows for a given schema. Returns either parsed bars or
    // the raw response details so the caller can decide whether to fall back.
    async function fetchSchema(targetSchema: DatabentoSchema, endIso?: string): Promise<
      | { ok: true; rawBars: Bar[] }
      | { ok: false; status: number; body: string }
    > {
      const fetchUrl = new URL('https://hist.databento.com/v0/timeseries.get_range')
      fetchUrl.searchParams.set('dataset', 'EQUS.MINI')
      fetchUrl.searchParams.set('symbols', ticker)
      fetchUrl.searchParams.set('schema', targetSchema)
      fetchUrl.searchParams.set('start', paddedFrom.toISOString())
      fetchUrl.searchParams.set('end', endIso ?? paddedTo.toISOString())
      fetchUrl.searchParams.set('encoding', 'json')
      fetchUrl.searchParams.set('pretty_px', 'true')
      fetchUrl.searchParams.set('pretty_ts', 'true')
      const resp = await fetch(fetchUrl, { headers: { Authorization: auth } })
      if (!resp.ok) {
        const body = await resp.text()
        return { ok: false, status: resp.status, body }
      }
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
      return { ok: true, rawBars }
    }

    try {
      let actualSchema: DatabentoSchema = schema
      let schemaFallback: BarsResponse['schemaFallback']
      let result = await fetchSchema(schema)

      // ohlcv-1h has a longer publishing lag than ohlcv-1m, so recent windows
      // can come back with `data_schema_not_fully_available`. Fall back to
      // ohlcv-1m and aggregate up — preserves the request shape rather than
      // failing the whole call.
      if (!result.ok && schema === 'ohlcv-1h' && result.body.includes('data_schema_not_fully_available')) {
        actualSchema = 'ohlcv-1m'
        schemaFallback = 'ohlcv-1h-to-1m'
        result = await fetchSchema('ohlcv-1m')
      }

      // Databento 422 `data_end_after_available_end` — the requested
      // `end` runs past the dataset frontier. The feed-lag clamp assumes
      // data is published up to ~35 min ago, but on weekends and holidays
      // the last real session can be days back, so the clamp isn't enough.
      // The error names the exact available end; retry once clamped to it.
      if (!result.ok && result.status === 422 && result.body.includes('data_end_after_available_end')) {
        const m = result.body.match(/available up to '([^']+)'/)
        const availableEnd = m ? new Date(m[1].replace(' ', 'T')) : null
        if (availableEnd && !Number.isNaN(availableEnd.getTime()) && availableEnd.getTime() > paddedFrom.getTime()) {
          result = await fetchSchema(actualSchema, availableEnd.toISOString())
        }
      }

      if (!result.ok) {
        console.error(`[bars] databento ${result.status}:`, result.body.slice(0, 500))
        return {
          status: 502,
          body: JSON.stringify({ error: `databento ${result.status}: ${result.body.slice(0, 300)}`, ticker, from, to }),
          cacheControl: 'no-store',
        }
      }
      const rawBars = result.rawBars

      let bars = filterSessionBars(rawBars, resolvedFrom, resolvedTo, session, openingMinutes)
      let effectiveTimeframe: ChartTimeframe = timeframe
      if (actualSchema === 'ohlcv-1m') {
        if (timeframe === '1min') {
          effectiveTimeframe = '1min'
        } else if (timeframe === '5min') {
          bars = downsample(bars, 5)
          effectiveTimeframe = '5min'
        } else if (timeframe === '15min') {
          bars = downsample(bars, 15)
          effectiveTimeframe = '15min'
        } else if (timeframe === '30min') {
          bars = downsample(bars, 30)
          effectiveTimeframe = '30min'
        } else if (timeframe === '1h') {
          bars = downsample(bars, 60)
          effectiveTimeframe = '1h'
        } else if (timeframe === '4h') {
          bars = downsample(bars, 240)
          effectiveTimeframe = '4h'
        } else {
          bars = downsample(bars, 5)
          effectiveTimeframe = '5min'
        }
      } else if (actualSchema === 'ohlcv-1h') {
        if (timeframe === '4h') {
          bars = downsample(bars, 240)
          effectiveTimeframe = '4h'
        } else {
          effectiveTimeframe = '1h'
        }
      } else if (timeframe === 'weekly' && actualSchema === 'ohlcv-1d') {
        bars = downsampleWeekly(rawBars)
        effectiveTimeframe = 'weekly'
      }

      // Hard cap — 78 candles max per full-session chart (one RTH session at 5-min bars).
      // More than this causes analysis paralysis on a fast Brooks read. See
      // user memory: feedback_chart_candle_cap. Tail keeps the most recent
      // bars so the trade-exit context is preserved in round-trip charts. Opening
      // 1-minute views can be longer so bar 18 has the full matching 90 minutes.
      // `truncated` flag lets API consumers detect the cap kicked in without
      // re-counting against `limit`.
      const untruncatedCount = bars.length
      let truncated = false
      if (bars.length > maxBars) {
        bars = bars.slice(-maxBars)
        truncated = true
      }

      const payload: BarsResponse = {
        bars,
        timeframe,
        effectiveTimeframe,
        ticker,
        from: resolvedFrom,
        to: resolvedTo,
        source: 'databento',
        ...(truncated ? { truncated, untruncatedCount } : {}),
        ...(schemaFallback ? { schemaFallback } : {}),
      }
      // Cache aggressively when the requested range is entirely in the
      // past — those bars never change, so Vercel's edge can absorb every
      // repeat hit (incognito visits, new users, etc.). Today-inclusive
      // requests still get a short edge cache because the live route
      // (/api/bars/live) handles the trailing minutes. `fullyPast` is
      // computed outside the work block so the Redis pre-check above
      // and the post-fetch write below share the same value.
      const cacheControl = fullyPast
        ? 'public, s-maxage=86400, max-age=86400, immutable'
        : 'public, s-maxage=30, max-age=10, stale-while-revalidate=60'
      const body = JSON.stringify(payload)
      if (fullyPast && isUpstashConfigured()) {
        // Fire-and-forget — don't block the response on the cache write.
        // 24h TTL matches the edge cache; a v2 prefix on the key means
        // stale shapes from older deploys are ignored.
        upstashSetEx(cacheKey, body, 24 * 3600).catch((err) => {
          console.error('[bars] upstash setEx failed:', err)
        })
      }
      return { status: 200, body, cacheControl }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`[bars] ${ticker} ${from}→${to} @ ${schema} failed:`, message)
      return {
        status: 502,
        body: JSON.stringify({ error: `bars fetch failed: ${message}`, ticker, from, to, timeframe }),
        cacheControl: 'no-store',
      }
    }
  })()

  if (!existing) {
    inflight.set(inflightKey, { promise: work, startedAt: now })
    work.finally(() => {
      if (inflight.get(inflightKey)?.promise === work) inflight.delete(inflightKey)
    })
  }

  const result = await work
  return new Response(result.body, {
    status: result.status,
    headers: {
      'Cache-Control': result.cacheControl,
      'Content-Type': 'application/json',
      'X-Bars-Cache': fullyPast ? 'miss' : 'skip',
    },
  })
}
