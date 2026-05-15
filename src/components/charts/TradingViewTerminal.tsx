"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { FormEvent, ReactNode, TouchEvent } from "react"
import {
  CandlestickSeries,
  ColorType,
  HistogramSeries,
  LineSeries,
  LineStyle,
  createChart,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type LogicalRange,
  type MouseEventParams,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts"
import type { Bar, ChartTimeframe } from "@/lib/types"

type IntradayTimeframe = Extract<ChartTimeframe, "1min" | "5min" | "15min" | "30min" | "1h">
type ChartViewTimeframe = IntradayTimeframe | Extract<ChartTimeframe, "daily" | "weekly">
type SessionMode = "rth" | "all"

function isIntradayTimeframe(tf: ChartViewTimeframe): tf is IntradayTimeframe {
  return tf === "1min" || tf === "5min" || tf === "15min" || tf === "30min" || tf === "1h"
}

// Live-bar poll cadence. The Fly aggregator updates the in-progress 1m bar
// every ~500ms, so 1m views poll tight (1s) for a real-time feel. On wider
// timeframes the user can't perceive sub-bar movement, so we slow down a lot.
// Daily / weekly aren't polled at all (handled by the isIntradayTimeframe
// gate at the call site).
function liveTickIntervalMs(tf: ChartViewTimeframe): number {
  switch (tf) {
    case "1min": return 1_000
    case "5min": return 3_000
    case "15min": return 5_000
    case "30min": return 10_000
    case "1h": return 15_000
    default: return 60_000
  }
}

// Calendar lookback (in days) when fetching for non-intraday timeframes.
// Picked so each timeframe shows ~60 bars of history — slightly over so
// holidays and weekends don't shrink the view.
const NON_INTRADAY_FETCH_DAYS: Record<"daily" | "weekly", number> = {
  daily: 100,   // ~70 trading days, trims to last 60
  weekly: 480,  // ~96 weeks of data, trims to last 60
}
const NON_INTRADAY_DISPLAY_BARS = 60

type LiveStatus = "ok" | "empty-set" | "upstash-not-configured" | "unknown"

interface BarsPayload {
  bars: Bar[]
  ticker: string
  source: string
  liveStatus?: LiveStatus
}

interface SymbolsPayload {
  symbols: string[]
  dataset: string | null
  schema: string | null
}

interface QuotesPayload {
  quotes: Quote[]
}

interface Quote {
  symbol: string
  last: number | null
  changePct: number | null
  volume: number
  stale: boolean
}

interface BrooksLevel {
  price: number
  title: string
  color: string
  style: LineStyle
  group: LevelGroup
}

interface BarNumberLabel {
  id: string
  x: number
  y: number
  text: string
  tone: "bull" | "bear"
}

type PythonZoneKind = "micro" | "fvg"
type ZoneDirection = "bull" | "bear"

interface PriceZone {
  id: string
  kind: PythonZoneKind
  direction: ZoneDirection
  startIndex: number
  endIndex: number
  low: number
  high: number
  filled: boolean
  fillIndex?: number
}

interface ZoneOverlay extends PriceZone {
  left: number
  top: number
  width: number
  height: number
}

interface HtfContextOverlay {
  id: string
  label: string
  left: number
  wickX: number
  wickTop: number
  wickHeight: number
  bodyTop: number
  bodyHeight: number
  bodyWidth: number
  color: string
  open: number
  high: number
  low: number
  close: number
}

interface CrosshairReadout {
  x: number
  y: number
  lines: string[]
}

type LevelGroup = "current" | "prior" | "globex" | "opening"
type LevelVisibility = Record<LevelGroup, boolean>

const DEFAULT_SYMBOLS = ["SPY", "QQQ", "NVDA", "TSLA", "META", "GOOGL", "AAPL", "MSFT", "AMZN"]

const TEAL = "#00C896"
const RED = "#EF5350"
const GRID = "#252525"
const AXIS = "#333333"
const TEXT = "#9BA1A6"
const BG = "#1A1A1A"

const TIMEFRAMES: Array<{ value: ChartViewTimeframe; label: string; minutes: number }> = [
  { value: "1min", label: "1m", minutes: 1 },
  { value: "5min", label: "5m", minutes: 5 },
  { value: "15min", label: "15m", minutes: 15 },
  { value: "1h", label: "1H", minutes: 60 },
  // Non-intraday timeframes — labels deliberately distinct from the
  // bar-window selector's "1D/2D/3D" to avoid confusion. "Day" = the
  // chart shows daily bars; the bar-window scope selector is hidden.
  { value: "daily", label: "Day", minutes: 390 },
  { value: "weekly", label: "Wk", minutes: 1950 },
]

function timeframeLabel(timeframe: ChartViewTimeframe): string {
  return TIMEFRAMES.find((item) => item.value === timeframe)?.label ?? timeframe
}

const DEFAULT_BAR_WINDOW = 1  // days

const CHART_PREFS_KEY = "aiedge.chart.preferences.v1"
const PRIOR_DAYS_CACHE_KEY = "aiedge.chart.priordays.v1"
const MAX_PRIOR_DAYS_CACHE_ENTRIES = 200
const CUSTOM_SYMBOLS_KEY = "aiedge.chart.customSymbols.v1"
const DRAWN_LINES_KEY = "aiedge.chart.drawnLines.v1"

const DEFAULT_LEVEL_VISIBILITY: LevelVisibility = {
  current: true,
  prior: true,
  globex: true,
  opening: true,
}

const LEVEL_GROUPS: Array<{ key: LevelGroup; label: string; swatch: string }> = [
  { key: "current", label: "DAY", swatch: TEAL },
  { key: "prior", label: "YDAY", swatch: "#C9A227" },
  { key: "globex", label: "GX", swatch: "#6E737A" },
  { key: "opening", label: "18", swatch: "#F5A623" },
]

// `value` is the number of trailing trading days to display on the
// chart. The chart filters its bar series by ET date, so the bar count
// scales with the user's selected timeframe (1D at 5m = 78 bars, at
// 1m = ~390 bars, etc).
const BAR_WINDOW_CHOICES = [
  { value: 1, label: "1D" },
  { value: 2, label: "2D" },
  { value: 3, label: "3D" },
]

const ET_DATE_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
})

const ET_CLOCK_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
})

function todayEt(): string {
  const parts = ET_DATE_FORMATTER.formatToParts(new Date())
  const year = parts.find((part) => part.type === "year")?.value
  const month = parts.find((part) => part.type === "month")?.value
  const day = parts.find((part) => part.type === "day")?.value
  if (!year || !month || !day) return new Date().toISOString().slice(0, 10)
  return `${year}-${month}-${day}`
}

function etDateForTimestamp(timestamp: number): string {
  return ET_DATE_FORMATTER.format(new Date(timestamp * 1000))
}

type DisplayTimezone = "ET" | "UTC" | "local"

const UTC_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
})

const LOCAL_FORMATTER = new Intl.DateTimeFormat([], {
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
})

function formatBarTime(timestamp: number, tz: DisplayTimezone): string {
  if (tz === "UTC") return UTC_FORMATTER.format(new Date(timestamp * 1000))
  if (tz === "local") return LOCAL_FORMATTER.format(new Date(timestamp * 1000))
  return formatEt(timestamp)
}

function formatEt(timestamp: number): string {
  return ET_CLOCK_FORMATTER.format(new Date(timestamp * 1000))
}

function formatPrice(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "-"
  const decimals = value >= 100 ? 2 : value >= 10 ? 3 : 4
  return value.toFixed(decimals)
}

function formatVolume(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "-"
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(1)}K`
  return Math.round(value).toLocaleString()
}

function signed(value: number | null | undefined, suffix = ""): string {
  if (value == null || !Number.isFinite(value)) return "-"
  const sign = value > 0 ? "+" : ""
  return `${sign}${value.toFixed(2)}${suffix}`
}

function etMinuteOfDay(timestamp: number): number {
  const parts = ET_CLOCK_FORMATTER.formatToParts(new Date(timestamp * 1000))
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0)
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0)
  return hour * 60 + minute
}

function isRthBar(bar: Bar): boolean {
  const minutes = etMinuteOfDay(bar.t)
  return minutes >= 9 * 60 + 30 && minutes < 16 * 60
}

function isPremarketBar(bar: Bar): boolean {
  const minutes = etMinuteOfDay(bar.t)
  return minutes >= 4 * 60 && minutes < 9 * 60 + 30
}

function isOpening18Bar(bar: Bar): boolean {
  const minutes = etMinuteOfDay(bar.t)
  return minutes >= 9 * 60 + 30 && minutes < 11 * 60
}

function previousEtDates(date: string, count: number): string[] {
  const [year, month, day] = date.split("-").map(Number)
  if (!year || !month || !day) return []
  return Array.from({ length: count }, (_, index) => {
    const next = new Date(Date.UTC(year, month - 1, day - index - 1, 12))
    return next.toISOString().slice(0, 10)
  })
}

function liveStatusColor(status: LiveStatus, liveFresh: boolean, subscribed: boolean): string {
  if (status === "upstash-not-configured") return "bg-red"
  if (status === "empty-set") return subscribed ? "bg-yellow" : "bg-sub"
  if (status === "ok") return liveFresh ? "bg-teal" : "bg-yellow"
  return "bg-gray"
}

function liveStatusLabel(status: LiveStatus, liveFresh: boolean, subscribed: boolean): string {
  if (status === "upstash-not-configured") return "Live feed not configured (Upstash env vars missing)"
  if (status === "empty-set") {
    return subscribed
      ? "Live feed configured — waiting for first bar from the aggregator"
      : "Live feed not subscribed for this symbol — chart is showing delayed historical only"
  }
  if (status === "ok") return liveFresh ? "Live — data flowing" : "Live — last bar is stale"
  return "Connecting…"
}

// Short chip text alongside the price. Returns null when the feed is
// healthy + fresh — the green dot alone is enough. Any other state
// surfaces a label so the user can tell "historical only" / "stale" /
// "subscribing…" at a glance without hovering for the tooltip.
function liveStatusBadgeText(
  status: LiveStatus,
  liveFresh: boolean,
  subscribed: boolean,
): { label: string; tone: "teal" | "yellow" | "sub" | "red" } | null {
  if (status === "upstash-not-configured") return { label: "FEED OFF", tone: "red" }
  if (status === "empty-set") {
    return subscribed
      ? { label: "SUBSCRIBING…", tone: "yellow" }
      : { label: "HISTORICAL", tone: "sub" }
  }
  if (status === "ok") {
    return liveFresh ? null : { label: "STALE", tone: "yellow" }
  }
  return { label: "CONNECTING…", tone: "sub" }
}

function mergeBars(historyBars: Bar[], liveBars: Bar[]): Bar[] {
  const byTime = new Map<number, Bar>()
  for (const bar of historyBars) byTime.set(bar.t, bar)
  for (const bar of liveBars) byTime.set(bar.t, bar)
  return Array.from(byTime.values()).sort((a, b) => a.t - b.t)
}

function aggregateBars(bars: Bar[], minutesPerBucket: number): Bar[] {
  if (minutesPerBucket <= 1 || bars.length === 0) return bars
  const bucketSeconds = minutesPerBucket * 60
  const output: Bar[] = []
  let current: Bar | null = null

  for (const bar of bars) {
    const bucketStart = Math.floor(bar.t / bucketSeconds) * bucketSeconds
    if (!current || current.t !== bucketStart) {
      if (current) output.push(current)
      current = { t: bucketStart, o: bar.o, h: bar.h, l: bar.l, c: bar.c, v: bar.v ?? 0 }
    } else {
      current.h = Math.max(current.h, bar.h)
      current.l = Math.min(current.l, bar.l)
      current.c = bar.c
      current.v = (current.v ?? 0) + (bar.v ?? 0)
    }
  }

  if (current) output.push(current)
  return output
}

// Max 1-min bars we expect to fetch for `fetchDays` of trading data
// when querying tf=1min. Includes a buffer for extended-hours requests
// (session=all spans 04:00-20:00 = 16h = 960m/day, vs RTH's 390m/day).
function rawLimitFor(timeframe: ChartViewTimeframe, barWindow: number, fetchDays = 1): number {
  void timeframe
  void barWindow
  return Math.min(Math.max(960 * fetchDays, 78), 5000)
}

// How many trading days of bars to *fetch* for a given trading-day
// scope (barWindow). One extra day on top of the scope so the EMA has
// a warmup period before the first visible bar.
function fetchDaysForBarWindow(barWindow: number, timeframe: ChartViewTimeframe): number {
  void timeframe
  return Math.max(1, barWindow) + 1
}

// Earliest calendar date we need to query so that `fetchDays` worth of
// trading bars are guaranteed in the response (over-fetches across
// weekends + a holiday or two — the API filters non-trading time).
function earliestFetchDate(sessionDate: string, fetchDays: number): string {
  if (fetchDays <= 1) return sessionDate
  const calendarDaysBack = fetchDays + 3
  const candidates = previousEtDates(sessionDate, calendarDaysBack)
  return candidates[candidates.length - 1] ?? sessionDate
}

function emaLineData(bars: Bar[], period = 20, seed?: number) {
  if (bars.length === 0) return []
  const alpha = 2 / (period + 1)
  let ema = seed ?? bars[0].c
  return bars.map((bar, index) => {
    ema = index === 0 && seed === undefined ? bar.c : bar.c * alpha + ema * (1 - alpha)
    return { time: bar.t as UTCTimestamp, value: ema }
  })
}

// Higher-timeframe EMA20 overlays. Intraday overlays interpolate between
// HTF EMA points so they read as smooth guides on the LTF chart; daily
// and weekly remain stepped context references. We expose four independent
// HTFs (15m, 1h, daily, weekly) so traders can stack as many higher-
// timeframe references as they want over the LTF candles.
//
// Each spec carries:
//   tf           — the /api/bars timeframe to fetch
//   lookbackDays — calendar days of history (≥ ~30 HTF bars so the
//                  EMA20 has a real warmup period)
//   color        — distinct hue so overlays don't blend into one another
const HTF_SPECS = [
  { key: "15m" as const, label: "15m EMA20", chipLabel: "15m", tf: "15min" as const, minutes: 15, lookbackDays: 5, session: "rth" as const, color: "rgba(245, 166, 35, 0.5)", lineWidth: 2 as const, lineStyle: LineStyle.Dotted, projection: "smooth" as const },
  { key: "1h" as const, label: "1h EMA20", chipLabel: "1h", tf: "1h" as const, minutes: 60, lookbackDays: 14, session: "rth" as const, color: "rgba(239, 83, 80, 0.5)", lineWidth: 2 as const, lineStyle: LineStyle.Dashed, projection: "smooth" as const },
  { key: "daily" as const, label: "Daily EMA20", chipLabel: "D", tf: "daily" as const, minutes: 390, lookbackDays: 100, session: null, color: "rgba(91, 168, 230, 1)", lineWidth: 2 as const, lineStyle: LineStyle.Dotted, projection: "step" as const },
  { key: "weekly" as const, label: "Weekly EMA20", chipLabel: "W", tf: "weekly" as const, minutes: 1950, lookbackDays: 480, session: null, color: "rgba(91, 168, 230, 1)", lineWidth: 2 as const, lineStyle: LineStyle.Dashed, projection: "step" as const },
]

type HtfKey = (typeof HTF_SPECS)[number]["key"]
type HtfProjection = (typeof HTF_SPECS)[number]["projection"]
type HtfVisibility = Record<HtfKey, boolean>

const TF_MINUTES: Record<ChartViewTimeframe, number> = {
  "1min": 1,
  "5min": 5,
  "15min": 15,
  "30min": 30,
  "1h": 60,
  daily: 390,
  weekly: 1950,
}

// Only show an HTF overlay when its bucket is wider than the chart's
// own bucket — a 15m EMA over 1h candles is just noise.
function availableHtfsFor(ltf: ChartViewTimeframe) {
  const ltfMin = TF_MINUTES[ltf]
  return HTF_SPECS.filter((spec) => spec.minutes > ltfMin)
}

function htfContextSpecFor(timeframe: ChartViewTimeframe): typeof HTF_SPECS[number] | null {
  if (timeframe === "weekly") return null
  if (timeframe === "daily") return HTF_SPECS.find((spec) => spec.key === "weekly") ?? null
  return HTF_SPECS.find((spec) => spec.key === "daily") ?? null
}

function emptyHtfVisibility(): HtfVisibility {
  return HTF_SPECS.reduce((acc, spec) => {
    acc[spec.key] = false
    return acc
  }, {} as HtfVisibility)
}

function emptyHtfBars(): Record<HtfKey, Bar[]> {
  return HTF_SPECS.reduce((acc, spec) => {
    acc[spec.key] = []
    return acc
  }, {} as Record<HtfKey, Bar[]>)
}

// Project a pre-computed HTF EMA series onto the LTF bar grid. Step mode
// holds the latest HTF EMA until a new point appears; smooth mode linearly
// interpolates between neighboring HTF EMA points for intraday overlays.
function projectHtfEmaOntoLtfBars(
  htfEma: { time: number; value: number }[],
  ltfBars: Bar[],
  projection: HtfProjection,
): { time: UTCTimestamp; value: number }[] {
  if (htfEma.length === 0 || ltfBars.length === 0) return []
  const result: { time: UTCTimestamp; value: number }[] = []
  let idx = 0
  for (const bar of ltfBars) {
    while (idx + 1 < htfEma.length && htfEma[idx + 1].time <= bar.t) {
      idx += 1
    }
    if (htfEma[idx].time <= bar.t) {
      const current = htfEma[idx]
      const next = htfEma[idx + 1]
      let value = current.value
      if (projection === "smooth" && next && next.time > current.time) {
        const ratio = Math.max(0, Math.min(1, (bar.t - current.time) / (next.time - current.time)))
        value = current.value + (next.value - current.value) * ratio
      }
      result.push({ time: bar.t as UTCTimestamp, value })
    }
  }
  return result
}

// Brooks "always-in" direction classifier. At any moment the market
// has a side that's currently winning; this proxy looks at where
// the latest close sits vs the EMA20 and how the EMA20 itself has
// moved over the trailing ~10 bars. Returns "long", "short", or
// "neutral" when the two signals disagree.
type AlwaysIn = "long" | "short" | "neutral"

function alwaysInDirection(bars: Bar[], period: number, emaSeed?: number): AlwaysIn {
  if (bars.length < 4) return "neutral"
  const emaSeries = emaLineData(bars, period, emaSeed)
  const last = bars[bars.length - 1]
  const lastEma = emaSeries[emaSeries.length - 1]?.value
  if (lastEma == null) return "neutral"
  const lookback = Math.min(10, emaSeries.length - 1)
  const priorEma = emaSeries[emaSeries.length - 1 - lookback]?.value ?? lastEma
  const emaSlopeUp = lastEma > priorEma
  const emaSlopeDown = lastEma < priorEma
  const above = last.c > lastEma
  const below = last.c < lastEma
  if (above && emaSlopeUp) return "long"
  if (below && emaSlopeDown) return "short"
  return "neutral"
}

// Per-session cumulative VWAP. Resets to bar #1's typical price at
// each new ET trading day, then accumulates Σ(typicalPrice × volume) /
// Σ(volume) within the session. Bars with zero volume don't move it.
function vwapLineData(bars: Bar[]) {
  if (bars.length === 0) return []
  let sumPV = 0
  let sumV = 0
  let prevDate: string | null = null
  return bars.map((bar) => {
    const date = etDateForTimestamp(bar.t)
    if (date !== prevDate) {
      prevDate = date
      sumPV = 0
      sumV = 0
    }
    const tp = (bar.h + bar.l + bar.c) / 3
    const v = bar.v ?? 0
    sumPV += tp * v
    sumV += v
    return { time: bar.t as UTCTimestamp, value: sumV > 0 ? sumPV / sumV : tp }
  })
}

function computeMicroGapZones(bars: Bar[], maxActive = 80): PriceZone[] {
  const zones: PriceZone[] = []
  const active: number[] = []

  for (let i = 1; i < bars.length; i += 1) {
    const bar = bars[i]

    for (const zoneIndex of [...active]) {
      const zone = zones[zoneIndex]
      zone.endIndex = i
      const filled = bar.h >= zone.low && bar.l <= zone.high
      if (filled) {
        zone.filled = true
        zone.fillIndex = i
        zone.endIndex = i
        active.splice(active.indexOf(zoneIndex), 1)
      }
    }

    const prev = bars[i - 1]
    const prevBodyHigh = Math.max(prev.o, prev.c)
    const prevBodyLow = Math.min(prev.o, prev.c)
    const bodyHigh = Math.max(bar.o, bar.c)
    const bodyLow = Math.min(bar.o, bar.c)
    const bull = bodyLow > prevBodyHigh
    const bear = bodyHigh < prevBodyLow

    if (bull || bear) {
      zones.push({
        id: `micro-${bar.t}-${bull ? "bull" : "bear"}`,
        kind: "micro",
        direction: bull ? "bull" : "bear",
        startIndex: i,
        endIndex: i,
        low: bull ? prevBodyHigh : bodyHigh,
        high: bull ? bodyLow : prevBodyLow,
        filled: false,
      })
      active.push(zones.length - 1)

      while (active.length > maxActive) {
        const oldest = active.shift()
        if (oldest != null) zones[oldest].endIndex = i
      }
    }
  }

  return zones
}

function computeFvgZones(bars: Bar[], maxActive = 120): PriceZone[] {
  const zones: PriceZone[] = []
  const active: number[] = []

  for (let i = 0; i < bars.length; i += 1) {
    const bar = bars[i]

    for (const zoneIndex of [...active]) {
      const zone = zones[zoneIndex]
      zone.endIndex = i
      const filled = zone.direction === "bull"
        ? bar.l <= zone.low
        : bar.h >= zone.high
      if (filled) {
        zone.filled = true
        zone.fillIndex = i
        zone.endIndex = i
        active.splice(active.indexOf(zoneIndex), 1)
      }
    }

    if (i < 2) continue
    const anchor = bars[i - 2]
    const bull = bar.l > anchor.h
    const bear = bar.h < anchor.l

    if (bull || bear) {
      zones.push({
        id: `fvg-${bar.t}-${bull ? "bull" : "bear"}`,
        kind: "fvg",
        direction: bull ? "bull" : "bear",
        startIndex: i,
        endIndex: i,
        low: bull ? anchor.h : bar.h,
        high: bull ? bar.l : anchor.l,
        filled: false,
      })
      active.push(zones.length - 1)

      while (active.length > maxActive) {
        const oldest = active.shift()
        if (oldest != null) zones[oldest].endIndex = i
      }
    }
  }

  return zones
}

function estimateBarWidth(chart: IChartApi, bars: Bar[]): number {
  for (let i = 1; i < bars.length; i += 1) {
    const prev = chart.timeScale().timeToCoordinate(bars[i - 1].t as UTCTimestamp)
    const next = chart.timeScale().timeToCoordinate(bars[i].t as UTCTimestamp)
    if (prev != null && next != null && Math.abs(Number(next) - Number(prev)) > 0) {
      return Math.max(3, Math.min(24, Math.abs(Number(next) - Number(prev))))
    }
  }
  return 8
}

function buildZoneOverlays(args: {
  chart: IChartApi
  candles: ISeriesApi<"Candlestick">
  bars: Bar[]
  microGapsVisible: boolean
  microGapsMaxActive: number
  fvgVisible: boolean
  fvgMaxActive: number
}): ZoneOverlay[] {
  const { chart, candles, bars, microGapsVisible, microGapsMaxActive, fvgVisible, fvgMaxActive } = args
  if (bars.length === 0 || (!microGapsVisible && !fvgVisible)) return []

  const zones = [
    ...(microGapsVisible ? computeMicroGapZones(bars, microGapsMaxActive) : []),
    ...(fvgVisible ? computeFvgZones(bars, fvgMaxActive) : []),
  ]
  const barWidth = estimateBarWidth(chart, bars)
  const overlays: ZoneOverlay[] = []

  for (const zone of zones) {
    const startBar = bars[Math.max(0, Math.min(zone.startIndex, bars.length - 1))]
    const endBar = bars[Math.max(0, Math.min(zone.endIndex, bars.length - 1))]
    if (!startBar || !endBar || zone.high <= zone.low) continue

    const x1 = chart.timeScale().timeToCoordinate(startBar.t as UTCTimestamp)
    const x2 = chart.timeScale().timeToCoordinate(endBar.t as UTCTimestamp)
    const yTop = candles.priceToCoordinate(zone.high)
    const yBottom = candles.priceToCoordinate(zone.low)
    if (x1 == null || x2 == null || yTop == null || yBottom == null) continue

    const left = Math.min(Number(x1), Number(x2)) - barWidth * 0.45
    const right = Math.max(Number(x1), Number(x2)) + barWidth * 0.45
    const top = Math.min(Number(yTop), Number(yBottom))
    const bottom = Math.max(Number(yTop), Number(yBottom))

    overlays.push({
      ...zone,
      left,
      top,
      width: Math.max(3, right - left),
      height: Math.max(2, bottom - top),
    })
  }

  return overlays
}

function buildHtfContextOverlays(args: {
  candles: ISeriesApi<"Candlestick">
  containerWidth: number
  contextBars: Bar[]
  label: string
}): HtfContextOverlay[] {
  const { candles, containerWidth, contextBars, label } = args
  if (containerWidth <= 0 || contextBars.length === 0) return []

  const bodyWidth = 10
  const spacing = 7
  const rightPad = 62
  // The caller already slices the bar list to the desired count (which
  // by default follows the bar-window selector and can be overridden in
  // the indicator settings). Render whatever it sent.
  const visible = contextBars

  return visible.flatMap((bar, index) => {
    const highY = candles.priceToCoordinate(bar.h)
    const lowY = candles.priceToCoordinate(bar.l)
    const openY = candles.priceToCoordinate(bar.o)
    const closeY = candles.priceToCoordinate(bar.c)
    if (highY == null || lowY == null || openY == null || closeY == null) return []

    const rightIndex = visible.length - 1 - index
    const left = Math.max(8, containerWidth - rightPad - bodyWidth - rightIndex * (bodyWidth + spacing))
    const bodyTop = Math.min(Number(openY), Number(closeY))
    const bodyBottom = Math.max(Number(openY), Number(closeY))
    const wickTop = Math.min(Number(highY), Number(lowY))
    const wickBottom = Math.max(Number(highY), Number(lowY))
    const color = bar.c >= bar.o ? "rgba(0, 200, 150, 0.78)" : "rgba(239, 83, 80, 0.78)"

    return [{
      id: `htf-${label}-${bar.t}`,
      label: index === visible.length - 1 ? label : "",
      left,
      wickX: left + bodyWidth / 2,
      wickTop,
      wickHeight: Math.max(1, wickBottom - wickTop),
      bodyTop,
      bodyHeight: Math.max(3, bodyBottom - bodyTop),
      bodyWidth,
      color,
      open: bar.o,
      high: bar.h,
      low: bar.l,
      close: bar.c,
    }]
  })
}

function metricsFor(bars: Bar[]) {
  const first = bars[0]
  const latest = bars.at(-1) ?? null
  if (!first || !latest) {
    return {
      latest: null,
      change: null,
      changePct: null,
      high: null,
      low: null,
      volume: 0,
    }
  }
  const high = Math.max(...bars.map((bar) => bar.h))
  const low = Math.min(...bars.map((bar) => bar.l))
  const volume = bars.reduce((sum, bar) => sum + (bar.v ?? 0), 0)
  const change = latest.c - first.o
  return {
    latest,
    change,
    changePct: first.o === 0 ? null : (change / first.o) * 100,
    high,
    low,
    volume,
  }
}

function highLow(bars: Bar[]): { high: number | null; low: number | null } {
  if (bars.length === 0) return { high: null, low: null }
  return {
    high: Math.max(...bars.map((bar) => bar.h)),
    low: Math.min(...bars.map((bar) => bar.l)),
  }
}

function levelTolerance(price: number): number {
  return Math.max(Math.abs(price) * 0.00005, 0.01)
}

function mergeNearbyLevels(levels: BrooksLevel[]): BrooksLevel[] {
  const merged: BrooksLevel[] = []
  for (const level of levels.filter((item) => Number.isFinite(item.price))) {
    const existing = merged.find((item) => item.group === level.group && Math.abs(item.price - level.price) <= levelTolerance(level.price))
    if (existing) {
      existing.price = (existing.price + level.price) / 2
      existing.title = `${existing.title}/${level.title}`
    } else {
      merged.push({ ...level })
    }
  }
  return merged
}

function buildBrooksLevels(currentDayBars: Bar[], priorRthBars: Bar[]): BrooksLevel[] {
  const rthBars = currentDayBars.filter(isRthBar)
  const premarketBars = currentDayBars.filter(isPremarketBar)
  const opening18Bars = rthBars.filter(isOpening18Bar)
  const current = highLow(rthBars)
  const globex = highLow(premarketBars)
  const opening18 = highLow(opening18Bars)
  const prior = highLow(priorRthBars)
  const dayOpen = rthBars[0]?.o
  const priorClose = priorRthBars.at(-1)?.c
  const levels: BrooksLevel[] = []

  if (prior.high != null) {
    levels.push({ price: prior.high, title: "hoy", color: "#C9A227", style: LineStyle.Dashed, group: "prior" })
  }
  if (globex.high != null) {
    levels.push({ price: globex.high, title: "gxh", color: "#6E737A", style: LineStyle.Dotted, group: "globex" })
  }
  if (current.high != null) {
    levels.push({ price: current.high, title: "hod", color: TEAL, style: LineStyle.Dotted, group: "current" })
  }
  if (opening18.high != null) {
    levels.push({ price: opening18.high, title: "18h", color: "#F5A623", style: LineStyle.Dashed, group: "opening" })
  }
  if (priorClose != null) {
    levels.push({ price: priorClose, title: "coy", color: "#888888", style: LineStyle.Dotted, group: "prior" })
  }
  if (dayOpen != null) {
    levels.push({ price: dayOpen, title: "ood", color: "#5BA8E6", style: LineStyle.Dashed, group: "current" })
  }
  if (opening18.low != null) {
    levels.push({ price: opening18.low, title: "18l", color: "#F5A623", style: LineStyle.Dashed, group: "opening" })
  }
  if (globex.low != null) {
    levels.push({ price: globex.low, title: "gxl", color: "#6E737A", style: LineStyle.Dotted, group: "globex" })
  }
  if (current.low != null) {
    levels.push({ price: current.low, title: "lod", color: TEAL, style: LineStyle.Dotted, group: "current" })
  }
  if (prior.low != null) {
    levels.push({ price: prior.low, title: "loy", color: "#C9A227", style: LineStyle.Dotted, group: "prior" })
  }

  return mergeNearbyLevels(levels)
}

function readChartPrefs(): Record<string, unknown> {
  if (typeof window === "undefined") return {}
  try {
    const raw = window.localStorage.getItem(CHART_PREFS_KEY)
    return raw ? JSON.parse(raw) as Record<string, unknown> : {}
  } catch {
    return {}
  }
}

function writeChartPrefs(preferences: Record<string, unknown>) {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(CHART_PREFS_KEY, JSON.stringify(preferences))
  } catch {
    // Local storage is best-effort; private browsing can reject writes.
  }
}

// Prior-day historical bars never change, so we keep them in
// localStorage and only re-fetch today's session live. Eviction is
// least-recently-used past a 200-entry cap (≈ 6 MB worst case at 30 KB
// per entry, well inside the typical 5-10 MB origin quota).
interface PriorDaysEntry {
  bars: Bar[]
  lastUsed: number
}

function readPriorDaysCache(): Record<string, PriorDaysEntry> {
  if (typeof window === "undefined") return {}
  try {
    const raw = window.localStorage.getItem(PRIOR_DAYS_CACHE_KEY)
    return raw ? (JSON.parse(raw) as Record<string, PriorDaysEntry>) : {}
  } catch {
    return {}
  }
}

function writePriorDaysCache(cache: Record<string, PriorDaysEntry>) {
  if (typeof window === "undefined") return
  let entries = Object.entries(cache)
  if (entries.length > MAX_PRIOR_DAYS_CACHE_ENTRIES) {
    entries = entries
      .sort((a, b) => a[1].lastUsed - b[1].lastUsed)
      .slice(-MAX_PRIOR_DAYS_CACHE_ENTRIES)
  }
  try {
    window.localStorage.setItem(PRIOR_DAYS_CACHE_KEY, JSON.stringify(Object.fromEntries(entries)))
  } catch {
    // Quota exceeded; drop silently. In-memory cache still serves this session.
  }
}

function priorDaysCacheKey(symbol: string, from: string, to: string, tf: string, session: string): string {
  return `${symbol}|${from}|${to}|${tf}|${session}`
}

async function fetchPriorDayBars(args: {
  ticker: string
  from: string
  to: string
  tf: "1min"
  session: "rth" | "all"
  limit: number
}): Promise<Bar[]> {
  const key = priorDaysCacheKey(args.ticker, args.from, args.to, args.tf, args.session)
  const cache = readPriorDaysCache()
  const hit = cache[key]
  if (hit) {
    hit.lastUsed = Date.now()
    cache[key] = hit
    writePriorDaysCache(cache)
    return hit.bars
  }
  const qs = new URLSearchParams({
    ticker: args.ticker,
    from: args.from,
    to: args.to,
    tf: args.tf,
    session: args.session,
    limit: String(args.limit),
  })
  const payload = await fetchJson<BarsPayload>(`/api/bars?${qs}`)
  cache[key] = { bars: payload.bars, lastUsed: Date.now() }
  writePriorDaysCache(cache)
  return payload.bars
}

function storedSymbol(): string {
  const value = readChartPrefs().symbol
  return typeof value === "string" && value.trim() ? value.trim().toUpperCase() : "SPY"
}

function storedTimeframe(): ChartViewTimeframe {
  const value = readChartPrefs().timeframe
  return TIMEFRAMES.some((item) => item.value === value) ? (value as ChartViewTimeframe) : "5min"
}

function storedBarWindow(): number {
  const value = Number(readChartPrefs().barWindow)
  return BAR_WINDOW_CHOICES.some((item) => item.value === value) ? value : DEFAULT_BAR_WINDOW
}

function storedSessionMode(): SessionMode {
  const value = readChartPrefs().sessionMode
  return value === "all" || value === "rth" ? value : "rth"
}

function storedWatchlistVisible(): boolean {
  const value = readChartPrefs().watchlistVisible
  return typeof value === "boolean" ? value : true
}

function storedVolumeVisible(): boolean {
  const value = readChartPrefs().volumeVisible
  return typeof value === "boolean" ? value : true
}

function storedSessionRangeStripVisible(): boolean {
  const value = readChartPrefs().sessionRangeStripVisible
  return typeof value === "boolean" ? value : true
}

function storedDisplayTimezone(): DisplayTimezone {
  const value = readChartPrefs().displayTimezone
  return value === "UTC" || value === "local" ? value : "ET"
}

function storedCompareSymbol(): string | null {
  const value = readChartPrefs().compareSymbol
  if (typeof value !== "string") return null
  const clean = value.trim().toUpperCase()
  return clean && /^[A-Z][A-Z0-9.\-]{0,9}$/.test(clean) ? clean : null
}

// Per-symbol overrides for timeframe / scope / toggles, layered on top
// of the global defaults above. Stored separately so a missing entry
// just falls back to global. Keyed by symbol.
interface SymbolPrefs {
  timeframe?: ChartViewTimeframe
  barWindow?: number
  sessionMode?: SessionMode
  levelVisibility?: LevelVisibility
  volumeVisible?: boolean
  emaVisible?: boolean
  vwapVisible?: boolean
  htfEmaVisibility?: Partial<HtfVisibility>
  barNumbersVisible?: boolean
  microGapsVisible?: boolean
  fvgVisible?: boolean
  htfContextVisible?: boolean
  // Per-indicator overrides. `null` for htfContextCount means "follow
  // the bar window" (1D→1, 2D→2, 3D→3). Missing fields fall back to
  // the indicator's built-in default.
  htfContextCount?: number | null
  microGapsMaxActive?: number
  fvgMaxActive?: number
  // EMA periods. `emaPeriod` is the base (chart-timeframe) EMA period.
  // Each HTF overlay has its own period — sparse object keyed by
  // HtfKey, missing keys fall back to the default. Letting these vary
  // independently means a user can run, e.g., 9 on the chart's own
  // timeframe and 20 on the Daily HTF without one stomping the other.
  emaPeriod?: number
  htfEmaPeriods?: Partial<Record<HtfKey, number>>
}

const HTF_CONTEXT_COUNT_MIN = 1
const HTF_CONTEXT_COUNT_MAX = 5
const MICRO_GAPS_MAX_ACTIVE_DEFAULT = 80
const FVG_MAX_ACTIVE_DEFAULT = 120
const ZONE_MAX_ACTIVE_MIN = 0
const ZONE_MAX_ACTIVE_MAX = 500
const EMA_PERIOD_DEFAULT = 20
const EMA_PERIOD_MIN = 2
const EMA_PERIOD_MAX = 200

function formatEmaLabel(period: number): string {
  return `EMA${period}`
}

function formatHtfEmaLabel(spec: (typeof HTF_SPECS)[number], period: number): string {
  return `${spec.chipLabel} ${formatEmaLabel(period)}`
}

const PER_SYMBOL_PREFS_KEY = "aiedge.chart.perSymbol.v1"
const WEEKLY_HTF_EMA_OPT_INS_KEY = "aiedge.chart.weeklyHtfEmaOptIns.v1"

function readAllSymbolPrefs(): Record<string, SymbolPrefs> {
  if (typeof window === "undefined") return {}
  try {
    const raw = window.localStorage.getItem(PER_SYMBOL_PREFS_KEY)
    return raw ? (JSON.parse(raw) as Record<string, SymbolPrefs>) : {}
  } catch {
    return {}
  }
}

function readSymbolPrefs(symbol: string): SymbolPrefs {
  return readAllSymbolPrefs()[symbol] ?? {}
}

function readWeeklyHtfEmaOptIns(): Record<string, true> {
  if (typeof window === "undefined") return {}
  try {
    const raw = window.localStorage.getItem(WEEKLY_HTF_EMA_OPT_INS_KEY)
    return raw ? (JSON.parse(raw) as Record<string, true>) : {}
  } catch {
    return {}
  }
}

function hasWeeklyHtfEmaOptIn(symbol: string): boolean {
  return readWeeklyHtfEmaOptIns()[symbol] === true
}

function markWeeklyHtfEmaOptIn(symbol: string): void {
  if (typeof window === "undefined") return
  try {
    const optIns = readWeeklyHtfEmaOptIns()
    optIns[symbol] = true
    window.localStorage.setItem(WEEKLY_HTF_EMA_OPT_INS_KEY, JSON.stringify(optIns))
  } catch {
    // Quota / private mode — best-effort.
  }
}

function writeSymbolPrefs(symbol: string, prefs: SymbolPrefs): void {
  if (typeof window === "undefined") return
  try {
    const all = readAllSymbolPrefs()
    all[symbol] = prefs
    window.localStorage.setItem(PER_SYMBOL_PREFS_KEY, JSON.stringify(all))
  } catch {
    // Quota / private mode — best-effort.
  }
}

function symbolTimeframe(symbol: string): ChartViewTimeframe {
  const stored = readSymbolPrefs(symbol).timeframe
  return TIMEFRAMES.some((item) => item.value === stored) ? (stored as ChartViewTimeframe) : storedTimeframe()
}

function symbolBarWindow(symbol: string): number {
  const stored = readSymbolPrefs(symbol).barWindow
  return BAR_WINDOW_CHOICES.some((item) => item.value === stored) ? (stored as number) : storedBarWindow()
}

function symbolSessionMode(symbol: string): SessionMode {
  const stored = readSymbolPrefs(symbol).sessionMode
  return stored === "rth" || stored === "all" ? stored : storedSessionMode()
}

function symbolLevelVisibility(symbol: string): LevelVisibility {
  return readSymbolPrefs(symbol).levelVisibility ?? storedLevelVisibility()
}

function symbolVolumeVisible(symbol: string): boolean {
  const stored = readSymbolPrefs(symbol).volumeVisible
  return typeof stored === "boolean" ? stored : storedVolumeVisible()
}

function symbolEmaVisible(symbol: string): boolean {
  const stored = readSymbolPrefs(symbol).emaVisible
  return typeof stored === "boolean" ? stored : true
}

function symbolVwapVisible(symbol: string): boolean {
  const stored = readSymbolPrefs(symbol).vwapVisible
  // Default off — VWAP is a power-user indicator, opt-in.
  return typeof stored === "boolean" ? stored : false
}

function symbolHtfEmaVisibility(symbol: string): HtfVisibility {
  const stored = readSymbolPrefs(symbol).htfEmaVisibility ?? {}
  const weeklyOptedIn = hasWeeklyHtfEmaOptIn(symbol)
  const result = emptyHtfVisibility()
  for (const spec of HTF_SPECS) {
    if (spec.key === "weekly" && !weeklyOptedIn) continue
    const v = stored[spec.key]
    // Default off — HTF EMA overlays stack visually, so opt-in per HTF.
    if (typeof v === "boolean") result[spec.key] = v
  }
  return result
}

function symbolBarNumbersVisible(symbol: string): boolean {
  const stored = readSymbolPrefs(symbol).barNumbersVisible
  // Default on — Brooks bar numbers are core to the methodology.
  return typeof stored === "boolean" ? stored : true
}

function storedMicroGapsVisible(): boolean {
  const value = readChartPrefs().microGapsVisible
  return typeof value === "boolean" ? value : true
}

function storedFvgVisible(): boolean {
  const value = readChartPrefs().fvgVisible
  return typeof value === "boolean" ? value : true
}

function symbolMicroGapsVisible(symbol: string): boolean {
  const stored = readSymbolPrefs(symbol).microGapsVisible
  return typeof stored === "boolean" ? stored : storedMicroGapsVisible()
}

function symbolFvgVisible(symbol: string): boolean {
  const stored = readSymbolPrefs(symbol).fvgVisible
  return typeof stored === "boolean" ? stored : storedFvgVisible()
}

function storedHtfContextVisible(): boolean {
  const value = readChartPrefs().htfContextVisible
  return typeof value === "boolean" ? value : true
}

function symbolHtfContextVisible(symbol: string): boolean {
  const stored = readSymbolPrefs(symbol).htfContextVisible
  return typeof stored === "boolean" ? stored : storedHtfContextVisible()
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.max(min, Math.min(max, Math.round(value)))
}

// `null` (or undefined) means "follow the bar window" — the default.
// A finite number is a user-set override clamped to the visual cap.
function symbolHtfContextCount(symbol: string): number | null {
  const stored = readSymbolPrefs(symbol).htfContextCount
  if (stored === null) return null
  if (typeof stored !== "number" || !Number.isFinite(stored)) return null
  return clampInt(stored, HTF_CONTEXT_COUNT_MIN, HTF_CONTEXT_COUNT_MAX)
}

function symbolMicroGapsMaxActive(symbol: string): number {
  const stored = readSymbolPrefs(symbol).microGapsMaxActive
  if (typeof stored !== "number" || !Number.isFinite(stored)) return MICRO_GAPS_MAX_ACTIVE_DEFAULT
  return clampInt(stored, ZONE_MAX_ACTIVE_MIN, ZONE_MAX_ACTIVE_MAX)
}

function symbolFvgMaxActive(symbol: string): number {
  const stored = readSymbolPrefs(symbol).fvgMaxActive
  if (typeof stored !== "number" || !Number.isFinite(stored)) return FVG_MAX_ACTIVE_DEFAULT
  return clampInt(stored, ZONE_MAX_ACTIVE_MIN, ZONE_MAX_ACTIVE_MAX)
}

function symbolEmaPeriod(symbol: string): number {
  const stored = readSymbolPrefs(symbol).emaPeriod
  if (typeof stored !== "number" || !Number.isFinite(stored)) return EMA_PERIOD_DEFAULT
  return clampInt(stored, EMA_PERIOD_MIN, EMA_PERIOD_MAX)
}

function emptyHtfEmaPeriods(): Record<HtfKey, number> {
  return HTF_SPECS.reduce((acc, spec) => {
    acc[spec.key] = EMA_PERIOD_DEFAULT
    return acc
  }, {} as Record<HtfKey, number>)
}

function symbolHtfEmaPeriods(symbol: string): Record<HtfKey, number> {
  const stored = readSymbolPrefs(symbol).htfEmaPeriods ?? {}
  const result = emptyHtfEmaPeriods()
  for (const spec of HTF_SPECS) {
    const value = stored[spec.key]
    if (typeof value === "number" && Number.isFinite(value)) {
      result[spec.key] = clampInt(value, EMA_PERIOD_MIN, EMA_PERIOD_MAX)
    }
  }
  return result
}

// User-added symbols that aren't in the live aggregator's default list.
// Capped at 50 to keep localStorage tidy.
function readCustomSymbols(): string[] {
  if (typeof window === "undefined") return []
  try {
    const raw = window.localStorage.getItem(CUSTOM_SYMBOLS_KEY)
    const parsed = raw ? (JSON.parse(raw) as unknown) : []
    return Array.isArray(parsed) ? parsed.filter((s): s is string => typeof s === "string") : []
  } catch {
    return []
  }
}

function writeCustomSymbols(symbols: string[]): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(CUSTOM_SYMBOLS_KEY, JSON.stringify(symbols.slice(0, 50)))
  } catch {
    // Best-effort; quota/private mode just means symbols don't persist.
  }
}

// User-drawn horizontal price lines, keyed by symbol. Long-press on
// the chart drops one at the tap price; long-press near an existing
// line (~0.1% tolerance) removes it.
function readDrawnLines(symbol: string): number[] {
  if (typeof window === "undefined") return []
  try {
    const raw = window.localStorage.getItem(DRAWN_LINES_KEY)
    const parsed = raw ? (JSON.parse(raw) as Record<string, number[]>) : {}
    const lines = parsed[symbol]
    return Array.isArray(lines) ? lines.filter((n): n is number => Number.isFinite(n)) : []
  } catch {
    return []
  }
}

function writeDrawnLines(symbol: string, lines: number[]): void {
  if (typeof window === "undefined") return
  try {
    const raw = window.localStorage.getItem(DRAWN_LINES_KEY)
    const parsed = raw ? (JSON.parse(raw) as Record<string, number[]>) : {}
    parsed[symbol] = lines.slice(0, 50)
    window.localStorage.setItem(DRAWN_LINES_KEY, JSON.stringify(parsed))
  } catch {
    // Best-effort.
  }
}

function storedLevelVisibility(): LevelVisibility {
  const value = readChartPrefs().levelVisibility
  if (!value || typeof value !== "object") return DEFAULT_LEVEL_VISIBILITY
  const record = value as Partial<Record<LevelGroup, unknown>>
  return {
    current: typeof record.current === "boolean" ? record.current : true,
    prior: typeof record.prior === "boolean" ? record.prior : true,
    globex: typeof record.globex === "boolean" ? record.globex : true,
    opening: typeof record.opening === "boolean" ? record.opening : true,
  }
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" })
  const data = await response.json()
  if (!response.ok) {
    const message = typeof data?.error === "string" ? data.error : `${response.status} ${response.statusText}`
    throw new Error(message)
  }
  return data as T
}

async function fetchPriorRthBars(symbol: string, beforeDate: string): Promise<Bar[]> {
  for (const date of previousEtDates(beforeDate, 10)) {
    const qs = new URLSearchParams({
      ticker: symbol,
      from: date,
      to: date,
      tf: "1min",
      session: "rth",
      limit: "390",
    })
    try {
      const payload = await fetchJson<BarsPayload>(`/api/bars?${qs}`)
      if (payload.bars.length > 0) return payload.bars
    } catch {
      // Try the next calendar day back; weekends/holidays can legitimately be empty.
    }
  }
  return []
}

function SymbolIcon({ active }: { active: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`h-2 w-2 rounded-full ${active ? "bg-teal" : "bg-gray"}`}
    />
  )
}

function Segment<T extends string>({
  value,
  options,
  onChange,
  bare = false,
}: {
  value: T
  options: Array<{ value: T; label: string }>
  onChange: (next: T) => void
  bare?: boolean
}) {
  const wrapperClass = bare
    ? "flex shrink-0 items-center gap-0.5"
    : "glass-chip flex shrink-0 items-center gap-0.5 rounded-md p-0.5"
  return (
    <div className={wrapperClass}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={`min-h-6 rounded-md px-1.5 py-0.5 text-[10px] font-semibold tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-teal/70 focus-visible:ring-offset-2 focus-visible:ring-offset-bg ${
            value === option.value ? "bg-teal text-bg" : "text-sub hover:text-text"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

function IndicatorPill({
  label,
  active,
  swatchColor,
  onClick,
  ariaLabel,
  title,
  grouped = false,
}: {
  label: string
  active: boolean
  swatchColor: string
  onClick: () => void
  ariaLabel: string
  title?: string
  grouped?: boolean
}) {
  const chromeClass = grouped ? "min-h-6 px-1.5 py-0.5" : "glass-chip px-2 py-0.5"
  let stateClass = "text-sub/45 hover:text-sub"
  if (grouped) stateClass = "text-sub/45 hover:bg-surface/70 hover:text-sub"
  if (active) stateClass = grouped ? "bg-surface-hover text-text" : "text-text"

  return (
    <button
      type="button"
      aria-label={ariaLabel}
      aria-pressed={active}
      title={title ?? ariaLabel}
      onClick={onClick}
      className={`pointer-events-auto inline-flex items-center gap-1.5 rounded-md text-[11px] font-semibold tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-teal/70 focus-visible:ring-offset-2 focus-visible:ring-offset-bg ${chromeClass} ${stateClass}`}
    >
      <span
        aria-hidden="true"
        className="h-1.5 w-1.5 rounded-full"
        style={{
          backgroundColor: active ? swatchColor : "transparent",
          boxShadow: active ? "none" : `inset 0 0 0 1px ${swatchColor.replace(/[\d.]+\)$/, "0.6)")}`,
        }}
      />
      {label}
    </button>
  )
}

function EmaIndicatorControls({
  timeframe,
  availableHtfs,
  emaVisible,
  htfEmaVisibility,
  emaPeriod,
  htfEmaPeriods,
  onToggleEma,
  onToggleHtfEma,
}: {
  timeframe: ChartViewTimeframe
  availableHtfs: typeof HTF_SPECS
  emaVisible: boolean
  htfEmaVisibility: HtfVisibility
  emaPeriod: number
  htfEmaPeriods: Record<HtfKey, number>
  onToggleEma: () => void
  onToggleHtfEma: (key: HtfKey) => void
}) {
  const baseTimeframeLabel = timeframeLabel(timeframe)
  const baseEmaLabel = `${baseTimeframeLabel} ${formatEmaLabel(emaPeriod)}`

  return (
    <div className="glass-chip pointer-events-auto inline-flex items-center gap-0.5 rounded-md p-0.5" aria-label="EMA overlays">
      <span className="px-1.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-sub/70">
        EMA
      </span>
      <IndicatorPill
        grouped
        label={baseTimeframeLabel}
        active={emaVisible}
        swatchColor="rgba(91, 168, 230, 0.85)"
        onClick={onToggleEma}
        ariaLabel={emaVisible ? `Hide ${baseEmaLabel}` : `Show ${baseEmaLabel}`}
        title={baseEmaLabel}
      />
      {availableHtfs.map((spec) => {
        const htfLabel = formatHtfEmaLabel(spec, htfEmaPeriods[spec.key])
        return (
          <IndicatorPill
            grouped
            key={spec.key}
            label={spec.chipLabel}
            active={htfEmaVisibility[spec.key]}
            swatchColor={spec.color}
            onClick={() => onToggleHtfEma(spec.key)}
            ariaLabel={htfEmaVisibility[spec.key] ? `Hide ${htfLabel}` : `Show ${htfLabel}`}
            title={htfLabel}
          />
        )
      })}
    </div>
  )
}

function LevelControls({
  visibility,
  onToggle,
}: {
  visibility: LevelVisibility
  onToggle: (group: LevelGroup) => void
}) {
  return (
    <div className="glass-chip pointer-events-auto flex rounded-md p-0.5" aria-label="Brooks level visibility" data-testid="chart-level-controls">
      {LEVEL_GROUPS.map((group) => {
        const active = visibility[group.key]
        return (
          <button
            key={group.key}
            type="button"
            aria-label={`Toggle ${group.label} Brooks levels`}
            aria-pressed={active}
            onClick={() => onToggle(group.key)}
            className={`flex min-h-7 items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-semibold tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-teal/70 focus-visible:ring-offset-2 focus-visible:ring-offset-bg ${
              active ? "bg-surface-hover text-text" : "text-sub/45 hover:text-sub"
            }`}
          >
            <span
              aria-hidden="true"
              className="h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: active ? group.swatch : "transparent", boxShadow: active ? "none" : `inset 0 0 0 1px ${group.swatch}99` }}
            />
            {group.label}
          </button>
        )
      })}
    </div>
  )
}

function SymbolScroller({
  symbol,
  symbols,
  onSelect,
  onPrefetch,
  onAdd,
}: {
  symbol: string
  symbols: string[]
  onSelect: (symbol: string) => void
  onPrefetch?: (symbol: string) => void
  onAdd: (symbol: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const listRef = useRef<HTMLDivElement>(null)
  const wheelLockedUntilRef = useRef(0)
  const touchYRef = useRef<number | null>(null)
  const currentIndex = Math.max(symbols.indexOf(symbol), 0)
  const filteredSymbols = useMemo(() => {
    const q = query.trim().toUpperCase()
    if (!q) return symbols
    return symbols.filter((s) => s.includes(q))
  }, [query, symbols])

  const cycleSymbol = useCallback((direction: -1 | 1) => {
    if (symbols.length === 0) return
    const nextIndex = (currentIndex + direction + symbols.length) % symbols.length
    onSelect(symbols[nextIndex])
  }, [currentIndex, onSelect, symbols])

  useEffect(() => {
    if (!open) return
    const selected = listRef.current?.querySelector<HTMLElement>(`[data-symbol="${symbol}"]`)
    selected?.scrollIntoView({ block: "center" })
  }, [open, symbol])

  return (
    <div className="relative z-20 font-mono">
      {open && (
        <div
          // Dropdown rises above the button into the chart canvas — the
          // chrome row that hosts the scroller sits below the chart.
          className="glass-panel absolute bottom-[calc(100%+0.5rem)] right-0 w-32 rounded-md sm:w-40"
        >
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value.toUpperCase())}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return
              const target = query.trim().toUpperCase()
              if (!target) return
              if (filteredSymbols.includes(target)) {
                onSelect(target)
              } else if (filteredSymbols.length === 1) {
                onSelect(filteredSymbols[0])
              } else {
                onAdd(target)
                onSelect(target)
              }
              setQuery("")
              setOpen(false)
            }}
            placeholder="Find / add"
            aria-label="Find or add symbol"
            spellCheck={false}
            autoCapitalize="characters"
            autoCorrect="off"
            autoComplete="off"
            className="w-full rounded-t-md border-b border-border/60 bg-transparent px-3 py-2 text-center font-mono text-sm tracking-[0.06em] text-text placeholder:text-sub/50 outline-none focus-visible:border-teal/60"
          />
          <div
            ref={listRef}
            role="listbox"
            aria-label="Watchlist symbols"
            className="max-h-[200px] snap-y snap-mandatory overflow-y-auto py-2 scrollbar-none sm:max-h-[230px]"
          >
            {filteredSymbols.length === 0 ? (
              <div className="px-3 py-2 text-center text-[11px] text-sub/60">
                press Enter to add {query.trim().toUpperCase()}
              </div>
            ) : (
              filteredSymbols.map((item) => {
                const active = item === symbol
                return (
                  <button
                    key={item}
                    type="button"
                    role="option"
                    aria-selected={active}
                    data-symbol={item}
                    onPointerEnter={onPrefetch ? () => onPrefetch(item) : undefined}
                    onFocus={onPrefetch ? () => onPrefetch(item) : undefined}
                    onClick={() => {
                      onSelect(item)
                      setQuery("")
                      setOpen(false)
                    }}
                    className={`block h-11 w-full snap-center px-4 text-center transition-none outline-none focus-visible:bg-surface-hover focus-visible:text-text ${
                      active ? "text-xl font-semibold tracking-[0.08em] text-text" : "text-sm font-medium tracking-[0.04em] text-sub/60"
                    }`}
                  >
                    {item}
                  </button>
                )
              })
            )}
          </div>
        </div>
      )}
      <button
        type="button"
        data-testid="chart-symbol-scroller"
        aria-label="Scroll watchlist symbols"
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((value) => !value)}
        onWheel={(event) => {
          event.preventDefault()
          const now = Date.now()
          if (now < wheelLockedUntilRef.current) return
          wheelLockedUntilRef.current = now + 180
          cycleSymbol(event.deltaY > 0 ? 1 : -1)
          setOpen(true)
        }}
        onTouchStart={(event) => {
          touchYRef.current = event.touches[0]?.clientY ?? null
        }}
        onTouchMove={(event) => {
          const startY = touchYRef.current
          const currentY = event.touches[0]?.clientY
          if (startY == null || currentY == null) return
          const delta = currentY - startY
          if (Math.abs(delta) < 28) return
          cycleSymbol(delta < 0 ? 1 : -1)
          setOpen(true)
          touchYRef.current = currentY
        }}
        onTouchEnd={() => {
          touchYRef.current = null
        }}
        className="glass-chip flex min-h-9 min-w-[60px] items-center justify-center gap-1.5 rounded-md px-2.5 py-1 text-center outline-none focus-visible:ring-2 focus-visible:ring-teal/70 focus-visible:ring-offset-2 focus-visible:ring-offset-bg sm:min-w-[68px] sm:px-3"
      >
        <span className="font-mono text-[13px] font-semibold tracking-[0.06em] text-text sm:text-sm">{symbol}</span>
        <svg aria-hidden="true" viewBox="0 0 8 6" className="h-1.5 w-2 fill-sub/70">
          <path d="M0 1.4 1.4 0 4 2.6 6.6 0 8 1.4 4 5.4z" />
        </svg>
      </button>
    </div>
  )
}

function ChartSurface({
  symbol,
  bars,
  seedBars,
  levels,
  timeframe,
  barWindow,
  sessionMode,
  symbols,
  levelVisibility,
  liveFresh,
  liveStatus,
  liveSubscribed,
  volumeVisible,
  sessionRangeStripVisible,
  emaVisible,
  emaPeriod,
  htfEmaPeriods,
  vwapVisible,
  htfEmaVisibility,
  htfBars,
  barNumbersVisible,
  microGapsVisible,
  microGapsMaxActive,
  fvgVisible,
  fvgMaxActive,
  htfContextVisible,
  htfContextBars,
  htfContextLabel,
  drawnLines,
  replayActive,
  onExitReplay,
  displayTimezone,
  compareSymbol,
  compareBars,
  onClearCompare,
  onSelectSymbol,
  onPrefetchSymbol,
  onAddSymbol,
  onSelectTimeframe,
  onSelectBarWindow,
  onSelectSessionMode,
  onToggleLevel,
  onToggleVolume,
  onToggleSessionRangeStrip,
  onToggleEma,
  onToggleVwap,
  onToggleHtfEma,
  onToggleBarNumbers,
  onToggleMicroGaps,
  onToggleFvg,
  onToggleHtfContext,
  onAddDrawnLine,
  onClearDrawnLines,
}: {
  symbol: string
  bars: Bar[]
  seedBars: Bar[]
  levels: BrooksLevel[]
  timeframe: ChartViewTimeframe
  barWindow: number
  sessionMode: SessionMode
  symbols: string[]
  levelVisibility: LevelVisibility
  liveFresh: boolean
  liveStatus: LiveStatus
  liveSubscribed: boolean
  volumeVisible: boolean
  sessionRangeStripVisible: boolean
  emaVisible: boolean
  emaPeriod: number
  htfEmaPeriods: Record<HtfKey, number>
  vwapVisible: boolean
  htfEmaVisibility: HtfVisibility
  htfBars: Record<HtfKey, Bar[]>
  barNumbersVisible: boolean
  microGapsVisible: boolean
  microGapsMaxActive: number
  fvgVisible: boolean
  fvgMaxActive: number
  htfContextVisible: boolean
  htfContextBars: Bar[]
  htfContextLabel: string
  drawnLines: number[]
  replayActive: boolean
  onExitReplay: () => void
  displayTimezone: DisplayTimezone
  compareSymbol: string | null
  compareBars: Bar[]
  onClearCompare: () => void
  onSelectSymbol: (symbol: string) => void
  onPrefetchSymbol: (symbol: string) => void
  onAddSymbol: (symbol: string) => void
  onSelectTimeframe: (timeframe: ChartViewTimeframe) => void
  onSelectBarWindow: (barWindow: number) => void
  onSelectSessionMode: (mode: SessionMode) => void
  onToggleLevel: (group: LevelGroup) => void
  onToggleVolume: () => void
  onToggleSessionRangeStrip: () => void
  onToggleEma: () => void
  onToggleVwap: () => void
  onToggleHtfEma: (key: HtfKey) => void
  onToggleBarNumbers: () => void
  onToggleMicroGaps: () => void
  onToggleFvg: () => void
  onToggleHtfContext: () => void
  onAddDrawnLine: (price: number) => void
  onClearDrawnLines: () => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const candlesRef = useRef<ISeriesApi<"Candlestick"> | null>(null)
  const averageRef = useRef<ISeriesApi<"Line"> | null>(null)
  const htfSeriesRef = useRef<Partial<Record<HtfKey, ISeriesApi<"Line">>>>({})
  const vwapRef = useRef<ISeriesApi<"Line"> | null>(null)
  const volumeRef = useRef<ISeriesApi<"Histogram"> | null>(null)
  // Optional comparison ticker as a normalized %-change line on a
  // dedicated left price scale. Created lazily on first paint and
  // re-used across symbol/timeframe changes.
  const compareSeriesRef = useRef<ISeriesApi<"Line"> | null>(null)
  const priceLinesRef = useRef<IPriceLine[]>([])
  // Per-session Brooks level segments. Each level becomes a bounded
  // LineSeries spanning only the latest visible session, so in 2D/3D
  // views the level lines don't bleed across prior days where those
  // levels weren't yet defined.
  const levelSeriesRef = useRef<ISeriesApi<"Line">[]>([])
  // User-drawn horizontal S/R lines as full-chart price lines.
  const drawnLineHandlesRef = useRef<IPriceLine[]>([])
  const longPressTimerRef = useRef<number | null>(null)
  const scheduleLabelsRef = useRef<() => void>(() => {})
  const rangeSignatureRef = useRef("")
  const barsRef = useRef(bars)
  // Tracks the current visible *bar count* (not the day-count prop).
  // Used by the range-change handler to decide if the user has zoomed
  // away from the fitted view.
  const visibleBarCountRef = useRef(bars.length)
  const emaByTimeRef = useRef<Map<number, number>>(new Map())
  const tapStartRef = useRef<{ x: number; y: number; moved: boolean } | null>(null)
  const priceScaleDragRef = useRef<{ startY: number; from: number; to: number } | null>(null)
  // Tracks the currently selected display timezone for axis / readout
  // formatting. lightweight-charts' formatter callbacks are captured
  // once at chart creation, so we read from the ref instead of from
  // props to avoid rebuilding the chart on every TZ toggle.
  const displayTimezoneRef = useRef(displayTimezone)
  const microGapsVisibleRef = useRef(microGapsVisible)
  const microGapsMaxActiveRef = useRef(microGapsMaxActive)
  const fvgVisibleRef = useRef(fvgVisible)
  const fvgMaxActiveRef = useRef(fvgMaxActive)
  const htfContextVisibleRef = useRef(htfContextVisible)
  const htfContextBarsRef = useRef(htfContextBars)
  const htfContextLabelRef = useRef(htfContextLabel)
  useEffect(() => {
    displayTimezoneRef.current = displayTimezone
  }, [displayTimezone])
  useEffect(() => {
    microGapsVisibleRef.current = microGapsVisible
    microGapsMaxActiveRef.current = microGapsMaxActive
    fvgVisibleRef.current = fvgVisible
    fvgMaxActiveRef.current = fvgMaxActive
    scheduleLabelsRef.current()
  }, [fvgMaxActive, fvgVisible, microGapsMaxActive, microGapsVisible])
  useEffect(() => {
    htfContextVisibleRef.current = htfContextVisible
    htfContextBarsRef.current = htfContextBars
    htfContextLabelRef.current = htfContextLabel
    scheduleLabelsRef.current()
  }, [htfContextBars, htfContextLabel, htfContextVisible])
  const [barNumberLabels, setBarNumberLabels] = useState<BarNumberLabel[]>([])
  // Each entry = the x-coordinate of a session-open bar. Rendered as a
  // thin vertical line that visually separates ET trading days in 2D /
  // 3D views. Re-computed alongside the bar number labels.
  const [sessionDividers, setSessionDividers] = useState<{ id: string; x: number }[]>([])
  const [zoneOverlays, setZoneOverlays] = useState<ZoneOverlay[]>([])
  const [htfContextOverlays, setHtfContextOverlays] = useState<HtfContextOverlay[]>([])
  const [crosshairReadout, setCrosshairReadout] = useState<CrosshairReadout | null>(null)
  const [viewState, setViewState] = useState({ visibleBars: bars.length, offDefault: false })
  const metrics = useMemo(() => metricsFor(bars), [bars])
  const latest = metrics.latest
  const sessionRange = metrics.high != null && metrics.low != null ? metrics.high - metrics.low : 0
  const chartEmaLabel = `${timeframeLabel(timeframe)} ${formatEmaLabel(emaPeriod)}`
  const emaLabelShort = formatEmaLabel(emaPeriod)

  // Final EMA value over the prior aggregated bars, used to seed the EMA
  // line so it picks up where yesterday left off instead of resetting to
  // close at bar #1 of the visible window.
  const emaSeed = useMemo<number | undefined>(() => {
    if (seedBars.length === 0) return undefined
    return emaLineData(seedBars, emaPeriod).at(-1)?.value
  }, [seedBars, emaPeriod])

  // Brooks-style always-in classification. Refreshes whenever the bar
  // series or seed shifts (so it auto-updates as live bars stream in).
  const alwaysIn = useMemo(() => alwaysInDirection(bars, emaPeriod, emaSeed), [bars, emaPeriod, emaSeed])

  useEffect(() => {
    barsRef.current = bars
    emaByTimeRef.current = new Map(
      emaLineData(bars, emaPeriod, emaSeed).map((point) => [Number(point.time), point.value]),
    )
  }, [bars, emaPeriod, emaSeed])

  useEffect(() => {
    visibleBarCountRef.current = bars.length
  }, [bars.length])

  // Re-apply the chart's tick / crosshair time formatters whenever the
  // display timezone changes. The formatters themselves read from
  // displayTimezoneRef, but lightweight-charts caches the rendered tick
  // labels, so we have to call applyOptions to force a redraw.
  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return
    chart.applyOptions({
      timeScale: {
        tickMarkFormatter: (time: Time) =>
          typeof time === "number" ? formatBarTime(time, displayTimezoneRef.current) : String(time),
      },
      localization: {
        timeFormatter: (time: Time) =>
          typeof time === "number" ? formatBarTime(time, displayTimezoneRef.current) : String(time),
      },
    })
  }, [displayTimezone])

  const fitChartToBarWindow = useCallback((targetWindow: number) => {
    const chart = chartRef.current
    const container = containerRef.current
    if (!chart || !container) return
    chart.priceScale("right").applyOptions({ autoScale: true })
    const currentBars = barsRef.current
    const usableWidth = Math.max(240, container.clientWidth - 58)
    const barSpacing = Math.min(14, Math.max(2.4, usableWidth / (targetWindow + 12)))
    chart.applyOptions({ timeScale: { barSpacing, rightOffset: 6 } })
    chart.timeScale().applyOptions({ barSpacing, rightOffset: 6 })
    if (currentBars.length === 0) {
      chart.timeScale().fitContent()
      return
    }
    chart.timeScale().setVisibleLogicalRange({
      from: -6,
      to: currentBars.length + 6,
    })
  }, [])

  const resetView = useCallback(() => {
    const count = bars.length
    fitChartToBarWindow(count)
    scheduleLabelsRef.current()
    setViewState({ visibleBars: count, offDefault: false })
  }, [bars.length, fitChartToBarWindow])

  const showReadoutForBar = useCallback((bar: Bar, index: number, x: number, y: number, mode: "follow" | "corner" = "follow") => {
    const container = containerRef.current
    if (!container) return
    const ema = emaByTimeRef.current.get(bar.t)
    const containerWidth = container.clientWidth || 360
    const containerHeight = container.clientHeight || 560
    const lines = [
      `#${index + 1}  ${formatBarTime(bar.t, displayTimezoneRef.current)}`,
      `O ${formatPrice(bar.o)}  H ${formatPrice(bar.h)}`,
      `L ${formatPrice(bar.l)}  C ${formatPrice(bar.c)}`,
      `${chartEmaLabel} ${formatPrice(ema)}`,
    ]
    if (mode === "corner") {
      setCrosshairReadout({ x: 12, y: Math.max(72, containerHeight - 110), lines })
      return
    }
    setCrosshairReadout({
      x: Math.min(Math.max(x + 12, 8), Math.max(8, containerWidth - 180)),
      y: Math.min(Math.max(y - 54, 84), Math.max(84, containerHeight - 92)),
      lines,
    })
  }, [chartEmaLabel])

  const handleTouchStart = useCallback((event: TouchEvent<HTMLDivElement>) => {
    const target = event.target
    if (target instanceof Element && target.closest("button")) return
    if (event.touches.length !== 1) {
      tapStartRef.current = null
      return
    }
    const touch = event.touches[0]
    const container = containerRef.current
    const chart = chartRef.current
    if (container && chart) {
      const rect = container.getBoundingClientRect()
      const x = touch.clientX - rect.left
      const priceScaleWidth = chart.priceScale("right").width() || 58
      if (x >= container.clientWidth - priceScaleWidth - 10) {
        const range = chart.priceScale("right").getVisibleRange()
        if (range) {
          chart.priceScale("right").applyOptions({ autoScale: false })
          priceScaleDragRef.current = { startY: touch.clientY, from: range.from, to: range.to }
        }
      }
    }
    tapStartRef.current = { x: touch.clientX, y: touch.clientY, moved: false }

    // Long-press (500ms, no movement) → drop a horizontal line at the
    // tap price. If the tap is within ~0.1% of an existing line the
    // parent handler removes it instead.
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current)
    }
    const startX = touch.clientX
    const startY = touch.clientY
    longPressTimerRef.current = window.setTimeout(() => {
      longPressTimerRef.current = null
      const candles = candlesRef.current
      const containerNow = containerRef.current
      const startState = tapStartRef.current
      if (!candles || !containerNow || !startState || startState.moved) return
      const rect = containerNow.getBoundingClientRect()
      const yCoord = startY - rect.top
      const price = candles.coordinateToPrice(yCoord)
      if (price == null || !Number.isFinite(price)) return
      onAddDrawnLine(Number(price))
      void startX
    }, 500)
  }, [onAddDrawnLine])

  const handleTouchMove = useCallback((event: TouchEvent<HTMLDivElement>) => {
    const start = tapStartRef.current
    const touch = event.touches[0]
    if (!start || !touch) return
    const priceScaleDrag = priceScaleDragRef.current
    if (priceScaleDrag) {
      const chart = chartRef.current
      if (!chart) return
      start.moved = true
      const center = (priceScaleDrag.from + priceScaleDrag.to) / 2
      const initialHalfRange = Math.max((priceScaleDrag.to - priceScaleDrag.from) / 2, 0.01)
      const scale = Math.exp((touch.clientY - priceScaleDrag.startY) / 240)
      const nextHalfRange = Math.max(initialHalfRange * scale, 0.01)
      chart.priceScale("right").setVisibleRange({
        from: center - nextHalfRange,
        to: center + nextHalfRange,
      })
      scheduleLabelsRef.current()
      return
    }
    if (Math.abs(touch.clientX - start.x) > 12 || Math.abs(touch.clientY - start.y) > 12) {
      start.moved = true
      if (longPressTimerRef.current !== null) {
        window.clearTimeout(longPressTimerRef.current)
        longPressTimerRef.current = null
      }
    }
    const container = containerRef.current
    const chart = chartRef.current
    if (!container || !chart) return
    const rect = container.getBoundingClientRect()
    const x = touch.clientX - rect.left
    const y = touch.clientY - rect.top
    const logical = chart.timeScale().coordinateToLogical(x)
    if (logical == null) return
    const index = Math.min(Math.max(Math.round(logical), 0), barsRef.current.length - 1)
    const bar = barsRef.current[index]
    if (!bar) return
    showReadoutForBar(bar, index, x, y, "corner")
  }, [showReadoutForBar])

  const handleTouchEnd = useCallback(() => {
    priceScaleDragRef.current = null
    tapStartRef.current = null
  }, [])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const height = Math.max(200, Math.floor(container.clientHeight || 680))
    const width = Math.max(280, Math.floor(container.clientWidth))
    const chart = createChart(container, {
      width,
      height,
      autoSize: false,
      layout: {
        background: { type: ColorType.Solid, color: BG },
        textColor: TEXT,
        fontSize: 11,
        fontFamily: "var(--font-sans), system-ui, sans-serif",
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: GRID },
        horzLines: { color: GRID },
      },
      rightPriceScale: {
        borderVisible: true,
        borderColor: AXIS,
        // Bottom margin = 0.22 keeps price action above the volume
        // histogram (which lives at top: 0.82 on its own scale).
        scaleMargins: { top: 0.08, bottom: 0.22 },
      },
      timeScale: {
        borderVisible: true,
        borderColor: AXIS,
        timeVisible: true,
        secondsVisible: false,
        tickMarkFormatter: (time: Time) =>
          typeof time === "number" ? formatBarTime(time, displayTimezoneRef.current) : String(time),
      },
      localization: {
        timeFormatter: (time: Time) =>
          typeof time === "number" ? formatBarTime(time, displayTimezoneRef.current) : String(time),
      },
      crosshair: {
        mode: 1,
        vertLine: { color: "#555", width: 1, style: LineStyle.Dotted },
        horzLine: { color: "#555", width: 1, style: LineStyle.Dotted },
      },
      handleScroll: { vertTouchDrag: false },
      handleScale: true,
    })
    chartRef.current = chart

    candlesRef.current = chart.addSeries(CandlestickSeries, {
      upColor: TEAL,
      downColor: RED,
      borderUpColor: TEAL,
      borderDownColor: RED,
      wickUpColor: TEAL,
      wickDownColor: RED,
      priceLineVisible: false,
      lastValueVisible: false,
    })

    averageRef.current = chart.addSeries(LineSeries, {
      color: "rgba(91, 168, 230, 0.45)",
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    })

    // Higher-timeframe EMA20 overlays — one series per HTF spec. Each
    // is its own line on the chart with a distinct hue so traders can
    // stack 15m / 1h / Daily / Weekly references and still tell them
    // apart at a glance.
    htfSeriesRef.current = {}
    for (const spec of HTF_SPECS) {
      htfSeriesRef.current[spec.key] = chart.addSeries(LineSeries, {
        color: spec.color,
        lineWidth: spec.lineWidth,
        lineStyle: spec.lineStyle,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
        autoscaleInfoProvider: () => null,
        title: spec.chipLabel,
      })
    }

    // Per-session VWAP — dashed purple line so it reads as distinct
    // from the EMA and from the Brooks level lines.
    vwapRef.current = chart.addSeries(LineSeries, {
      color: "rgba(180, 130, 230, 0.65)",
      lineWidth: 2,
      lineStyle: LineStyle.Dashed,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    })

    // Volume histogram sits on its own overlay price scale at the
    // bottom of the chart. Bars are colored by candle direction (teal
    // for closing up, red for down).
    volumeRef.current = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "volume",
      priceLineVisible: false,
      lastValueVisible: false,
    })
    chart.priceScale("volume").applyOptions({
      scaleMargins: { top: 0.82, bottom: 0 },
      borderVisible: false,
    })

    // Comparison overlay lives on its own price scale so its %-change
    // units never warp the primary candles. Created up front and just
    // toggled visible / fed data by the comparison effect below.
    compareSeriesRef.current = chart.addSeries(LineSeries, {
      priceScaleId: "compare",
      color: "rgba(245, 166, 35, 0.9)",
      lineWidth: 2,
      lastValueVisible: false,
      priceLineVisible: false,
      crosshairMarkerVisible: false,
      visible: false,
    })
    chart.priceScale("compare").applyOptions({
      visible: false,
      scaleMargins: { top: 0.08, bottom: 0.22 },
      borderVisible: false,
    })

    let labelFrame: number | null = null
    const updateBarNumberLabels = () => {
      const candles = candlesRef.current
      if (!candles) return
      const currentBars = barsRef.current
      if (currentBars.length === 0) {
        setBarNumberLabels([])
        setSessionDividers([])
        setZoneOverlays([])
        setHtfContextOverlays([])
        return
      }
      setZoneOverlays(buildZoneOverlays({
        chart,
        candles,
        bars: currentBars,
        microGapsVisible: microGapsVisibleRef.current,
        microGapsMaxActive: microGapsMaxActiveRef.current,
        fvgVisible: fvgVisibleRef.current,
        fvgMaxActive: fvgMaxActiveRef.current,
      }))
      setHtfContextOverlays(htfContextVisibleRef.current
        ? buildHtfContextOverlays({
          candles,
          containerWidth: container.clientWidth,
          contextBars: htfContextBarsRef.current,
          label: htfContextLabelRef.current,
        })
        : [])
      // Brooks bar numbers are an intraday concept. On daily/weekly
      // every bar is its own date, which would collapse the per-session
      // counter to "1" on every bar. Detect that case and skip labels.
      const firstDate = etDateForTimestamp(currentBars[0].t)
      const lastDate = etDateForTimestamp(currentBars[currentBars.length - 1].t)
      const nonIntraday =
        firstDate !== lastDate &&
        currentBars.length >= 2 &&
        etDateForTimestamp(currentBars[1].t) !== firstDate
      if (nonIntraday) {
        // Adjacent bars have distinct ET dates ⇒ daily or weekly.
        setBarNumberLabels([])
        setSessionDividers([])
        return
      }
      let minPrice = Infinity
      let maxPrice = -Infinity
      for (const bar of currentBars) {
        if (bar.l < minPrice) minPrice = bar.l
        if (bar.h > maxPrice) maxPrice = bar.h
      }
      const minY = candles.priceToCoordinate(minPrice)
      if (minY == null) {
        setBarNumberLabels([])
        setSessionDividers([])
        return
      }
      const labelY = Number(minY) + 14
      // Brooks bar numbering resets every session — bar #1 is the first
      // RTH bar of each day. Label step thins out as bar density grows
      // so dense 1m × 3D charts don't get ~290 overlapping labels.
      const totalBars = currentBars.length
      const labelStep = totalBars > 500 ? 24 : totalBars > 250 ? 12 : totalBars > 130 ? 8 : 4
      const nextLabels: BarNumberLabel[] = []
      const nextDividers: { id: string; x: number }[] = []
      let prevDate: string | null = null
      let dayCount = 0
      let isFirstSession = true
      for (const bar of currentBars) {
        const date = etDateForTimestamp(bar.t)
        if (date !== prevDate) {
          // Capture a vertical divider at every session-open EXCEPT the
          // first one (it sits at the chart's left edge and would just
          // look like a redundant chart border).
          if (!isFirstSession) {
            const dividerX = chart.timeScale().timeToCoordinate(bar.t as UTCTimestamp)
            if (dividerX != null) {
              nextDividers.push({ id: date, x: Number(dividerX) })
            }
          }
          prevDate = date
          dayCount = 0
          isFirstSession = false
        }
        dayCount += 1
        if (dayCount !== 1 && dayCount % labelStep !== 0) continue
        const x = chart.timeScale().timeToCoordinate(bar.t as UTCTimestamp)
        if (x == null) continue
        nextLabels.push({
          id: `${bar.t}-${dayCount}`,
          x: Number(x),
          y: labelY,
          text: String(dayCount),
          tone: bar.c >= bar.o ? "bull" : "bear",
        })
      }
      setSessionDividers(nextDividers)
      setBarNumberLabels(nextLabels)
    }
    const scheduleLabels = () => {
      if (labelFrame !== null) window.cancelAnimationFrame(labelFrame)
      labelFrame = window.requestAnimationFrame(() => {
        labelFrame = null
        updateBarNumberLabels()
      })
    }
    const gestureTimers: number[] = []
    const scheduleGestureLabels = () => {
      scheduleLabels()
      gestureTimers.push(window.setTimeout(scheduleLabels, 80), window.setTimeout(scheduleLabels, 180))
    }
    scheduleLabelsRef.current = scheduleLabels
    const rangeChangeHandler = (range: LogicalRange | null) => {
      scheduleLabels()
      if (!range) return
      const visibleBars = Math.max(1, Math.round(range.to - range.from))
      const targetVisibleBars = visibleBarCountRef.current || barsRef.current.length || 1
      const targetVisibleBarsWithPadding = targetVisibleBars + 12
      const zoomedAwayFromWindow = Math.abs(visibleBars - targetVisibleBarsWithPadding) > 8
      const shiftedAwayFromWindow = range.from > 4 || range.to < targetVisibleBars - 4
      const offDefault = zoomedAwayFromWindow || shiftedAwayFromWindow
      setViewState({ visibleBars, offDefault })
    }
    chart.timeScale().subscribeVisibleLogicalRangeChange(rangeChangeHandler)

    const crosshairHandler = (param: MouseEventParams<Time>) => {
      if (!param.point || param.time == null || typeof param.time !== "number") {
        setCrosshairReadout(null)
        return
      }
      const currentBars = barsRef.current
      const index = currentBars.findIndex((bar) => bar.t === param.time)
      const bar = currentBars[index]
      if (!bar) {
        setCrosshairReadout(null)
        return
      }
      showReadoutForBar(bar, index, param.point.x, param.point.y)
    }
    chart.subscribeCrosshairMove(crosshairHandler)

    const gestureEvents = ["pointerdown", "pointermove", "pointerup", "wheel", "touchstart", "touchmove", "touchend"] as const
    for (const eventName of gestureEvents) {
      container.addEventListener(eventName, scheduleGestureLabels, { passive: true })
    }

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const nextWidth = Math.max(280, Math.floor(entry.contentRect.width))
        const nextHeight = Math.max(200, Math.floor(entry.contentRect.height))
        chart.applyOptions({ width: nextWidth, height: nextHeight })
        scheduleLabels()
      }
    })
    ro.observe(container)

    return () => {
      if (labelFrame !== null) window.cancelAnimationFrame(labelFrame)
      for (const timer of gestureTimers) window.clearTimeout(timer)
      chart.unsubscribeCrosshairMove(crosshairHandler)
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(rangeChangeHandler)
      for (const eventName of gestureEvents) {
        container.removeEventListener(eventName, scheduleGestureLabels)
      }
      ro.disconnect()
      chart.remove()
      chartRef.current = null
      candlesRef.current = null
      averageRef.current = null
      htfSeriesRef.current = {}
      vwapRef.current = null
      volumeRef.current = null
      compareSeriesRef.current = null
      priceLinesRef.current = []
      levelSeriesRef.current = []
      drawnLineHandlesRef.current = []
      if (longPressTimerRef.current !== null) {
        window.clearTimeout(longPressTimerRef.current)
        longPressTimerRef.current = null
      }
      scheduleLabelsRef.current = () => {}
    }
  }, [showReadoutForBar])

  useEffect(() => {
    const chart = chartRef.current
    const candles = candlesRef.current
    const average = averageRef.current
    const vwap = vwapRef.current
    const volume = volumeRef.current
    if (!chart || !candles || !average) return

    candles.setData(
      bars.map((bar) => {
        const base = {
          time: bar.t as UTCTimestamp,
          open: bar.o,
          high: bar.h,
          low: bar.l,
          close: bar.c,
        }
        // In EXT mode, fade pre-market (4:00–9:30 ET) and post-market
        // (16:00–20:00 ET) bars so the RTH session reads as the
        // primary one at a glance. In RTH mode every bar is RTH so
        // there's nothing to fade.
        if (sessionMode === "all" && !isRthBar(bar)) {
          const isUp = bar.c >= bar.o
          const faded = isUp ? "rgba(0, 200, 150, 0.4)" : "rgba(239, 83, 80, 0.4)"
          return {
            ...base,
            color: faded,
            borderColor: faded,
            wickColor: faded,
          }
        }
        return base
      }),
    )
    average.setData(emaLineData(bars, emaPeriod, emaSeed))
    average.applyOptions({ visible: emaVisible })
    const availableHtfKeys = new Set(availableHtfsFor(timeframe).map((spec) => spec.key))
    for (const spec of HTF_SPECS) {
      const series = htfSeriesRef.current[spec.key]
      if (!series) continue
      const active = htfEmaVisibility[spec.key] && availableHtfKeys.has(spec.key)
      const sourceBars = htfBars[spec.key]
      if (active && sourceBars.length > 0 && bars.length > 0) {
        const htfEma = emaLineData(sourceBars, htfEmaPeriods[spec.key] ?? emaPeriod).map((p) => ({ time: Number(p.time), value: p.value }))
        series.setData(projectHtfEmaOntoLtfBars(htfEma, bars, spec.projection))
        series.applyOptions({ visible: true })
      } else {
        series.setData([])
        series.applyOptions({ visible: false })
      }
    }
    if (vwap) {
      vwap.setData(vwapVisible ? vwapLineData(bars) : [])
      vwap.applyOptions({ visible: vwapVisible })
    }
    if (volume) {
      volume.setData(
        bars.map((bar) => ({
          time: bar.t as UTCTimestamp,
          value: bar.v ?? 0,
          // Subtle teal/red tint — strong enough to read direction at
          // a glance, faint enough to keep volume secondary to price.
          color: bar.c >= bar.o ? "rgba(0, 200, 150, 0.45)" : "rgba(239, 83, 80, 0.45)",
        })),
      )
      volume.applyOptions({ visible: volumeVisible })
      chart.priceScale("volume").applyOptions({
        // Collapse the volume scale entirely when hidden so the price
        // action reclaims the bottom 18%.
        scaleMargins: volumeVisible ? { top: 0.82, bottom: 0 } : { top: 1, bottom: 0 },
      })
      chart.priceScale("right").applyOptions({
        scaleMargins: { top: 0.08, bottom: volumeVisible ? 0.22 : 0.08 },
      })
    }

    const compareSeries = compareSeriesRef.current
    if (compareSeries) {
      const show = !!compareSymbol && compareBars.length > 1 && bars.length > 0
      if (show) {
        // Align comparison bars to the primary chart's visible time
        // window so the two lines move in lockstep. We baseline both
        // series at their first overlapping bar (% change since that
        // bar) so the y-axis tells a "who's leading?" story rather than
        // dollar prices.
        const primaryStart = bars[0].t
        const primaryEnd = bars[bars.length - 1].t
        const inRange = compareBars.filter((bar) => bar.t >= primaryStart && bar.t <= primaryEnd)
        const baseline = inRange[0]?.c
        if (baseline && baseline > 0) {
          compareSeries.setData(
            inRange.map((bar) => ({
              time: bar.t as UTCTimestamp,
              value: ((bar.c - baseline) / baseline) * 100,
            })),
          )
          compareSeries.applyOptions({ visible: true })
          chart.priceScale("compare").applyOptions({ visible: true })
        } else {
          compareSeries.setData([])
          compareSeries.applyOptions({ visible: false })
          chart.priceScale("compare").applyOptions({ visible: false })
        }
      } else {
        compareSeries.setData([])
        compareSeries.applyOptions({ visible: false })
        chart.priceScale("compare").applyOptions({ visible: false })
      }
    }

    // Drop the previous render's level segments before drawing this
    // render's. Brooks levels are computed for the latest session only
    // (see buildBrooksLevels) so each line should only span that
    // session's bar range, not the whole multi-day chart.
    for (const series of levelSeriesRef.current) {
      try {
        chart.removeSeries(series)
      } catch {
        // Series was already removed during chart teardown.
      }
    }
    levelSeriesRef.current = []

    const latestBar = bars.at(-1)
    if (latestBar && levels.length > 0) {
      const lastDate = etDateForTimestamp(latestBar.t)
      const sessionBars = bars.filter((b) => etDateForTimestamp(b.t) === lastDate)
      const sessionStart = sessionBars[0]?.t
      const sessionEnd = sessionBars.at(-1)?.t
      if (sessionStart != null && sessionEnd != null) {
        for (const level of levels) {
          const series = chart.addSeries(LineSeries, {
            color: level.color,
            lineWidth: 1,
            lineStyle: level.style,
            priceLineVisible: false,
            lastValueVisible: true,
            crosshairMarkerVisible: false,
            title: level.title,
          })
          series.setData([
            { time: sessionStart as UTCTimestamp, value: level.price },
            { time: sessionEnd as UTCTimestamp, value: level.price },
          ])
          levelSeriesRef.current.push(series)
        }
      }
    }

    // Gray dotted "current price" line stays as a price line attached
    // to the candle series — it's a horizontal reference for the whole
    // chart, not a session-bounded level.
    for (const priceLine of priceLinesRef.current) {
      candles.removePriceLine(priceLine)
    }
    const nextPriceLines: IPriceLine[] = []
    if (latestBar) {
      nextPriceLines.push(candles.createPriceLine({
        price: latestBar.c,
        color: "#9CA0A6",
        lineWidth: 1,
        lineStyle: LineStyle.Dotted,
        axisLabelVisible: true,
        title: "",
      }))
    }
    priceLinesRef.current = nextPriceLines

    // User-drawn S/R lines. Re-add on every render so additions /
    // removals from the parent flow through. Solid white-ish line so
    // they're distinct from the Brooks level palette.
    for (const handle of drawnLineHandlesRef.current) {
      candles.removePriceLine(handle)
    }
    drawnLineHandlesRef.current = drawnLines.map((price) =>
      candles.createPriceLine({
        price,
        color: "rgba(232, 232, 232, 0.6)",
        lineWidth: 1,
        lineStyle: LineStyle.Solid,
        axisLabelVisible: true,
        title: "",
      }),
    )

    const nextRangeSignature = `${symbol}:${timeframe}:${barWindow}:${sessionMode}:${bars.length}`
    const shouldResetRange = bars.length > 0 && rangeSignatureRef.current !== nextRangeSignature
    if (bars.length > 0) {
      rangeSignatureRef.current = nextRangeSignature
    }

    const syncLabels = () => {
      if (shouldResetRange) {
        fitChartToBarWindow(bars.length)
      }
      scheduleLabelsRef.current()
    }

    syncLabels()
    const settleTimers = shouldResetRange
      ? [window.setTimeout(syncLabels, 80), window.setTimeout(syncLabels, 240), window.setTimeout(syncLabels, 600)]
      : [window.setTimeout(() => scheduleLabelsRef.current(), 80)]

    return () => {
      for (const timer of settleTimers) window.clearTimeout(timer)
    }
  }, [barWindow, bars, compareBars, compareSymbol, drawnLines, emaPeriod, emaSeed, emaVisible, fitChartToBarWindow, htfBars, htfEmaPeriods, htfEmaVisibility, levels, sessionMode, symbol, timeframe, volumeVisible, vwapVisible])

  useEffect(() => {
    if (bars.length === 0) return
    const timer = window.setTimeout(() => {
      fitChartToBarWindow(bars.length)
      scheduleLabelsRef.current()
    }, 120)
    return () => window.clearTimeout(timer)
  }, [bars.length, fitChartToBarWindow, sessionMode, symbol, timeframe])

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col gap-1 px-0 py-1 sm:px-3 sm:py-2">
      <div
        className="relative h-full min-h-0 flex-1 touch-none overscroll-contain overflow-hidden rounded-lg border border-border bg-[#1A1A1A]"
        onDoubleClick={(event) => {
          const target = event.target
          if (target instanceof Element && target.closest("button")) return
          resetView()
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div className="pointer-events-none absolute left-2 top-2 z-10 flex flex-col items-start gap-1.5 sm:left-4 sm:top-3 sm:gap-2">
          <div className="glass-chip inline-flex flex-col rounded-md px-2 py-1 sm:px-2.5 sm:py-1.5">
            <div className="flex items-center gap-1.5">
              <span
                title={liveStatusLabel(liveStatus, liveFresh, liveSubscribed)}
                aria-label={liveStatusLabel(liveStatus, liveFresh, liveSubscribed)}
                className={`pointer-events-auto h-1.5 w-1.5 rounded-full ${liveStatusColor(liveStatus, liveFresh, liveSubscribed)}`}
              />
              <span className="font-mono text-sm font-semibold leading-none tabular-nums text-text sm:text-lg">
                {formatPrice(latest?.c)}
              </span>
              {(() => {
                const badge = liveStatusBadgeText(liveStatus, liveFresh, liveSubscribed)
                if (!badge) return null
                const toneClass =
                  badge.tone === "teal"
                    ? "text-teal"
                    : badge.tone === "yellow"
                      ? "text-yellow"
                      : badge.tone === "red"
                        ? "text-red"
                        : "text-sub"
                return (
                  <span
                    title={liveStatusLabel(liveStatus, liveFresh, liveSubscribed)}
                    aria-label={liveStatusLabel(liveStatus, liveFresh, liveSubscribed)}
                    className={`pointer-events-auto ml-1 rounded-sm border border-border/40 px-1 py-px font-mono text-[9px] font-semibold uppercase tracking-[0.1em] leading-none ${toneClass}`}
                  >
                    {badge.label}
                  </span>
                )
              })()}
            </div>
            <span className={`mt-1 font-mono text-[10px] leading-none tabular-nums sm:text-[11px] ${(metrics.change ?? 0) >= 0 ? "text-teal" : "text-red"}`}>
              {(metrics.change ?? 0) >= 0 ? "▲" : "▼"} {signed(metrics.change)} ({signed(metrics.changePct, "%")})
            </span>
          </div>
          {/* Indicator strip. Toggle pills are tucked behind sm: so mobile
              users manage every overlay from the ƒx menu instead of fighting
              the canvas; active-mode chips below stay since they're already
              conditional and double as one-tap clears. */}
          <div className="pointer-events-auto flex flex-wrap items-center gap-1">
            <div className="hidden flex-wrap items-center gap-1 sm:flex">
              {isIntradayTimeframe(timeframe) ? (
                <LevelControls visibility={levelVisibility} onToggle={onToggleLevel} />
              ) : null}
              <IndicatorPill
                label="Vol"
                active={volumeVisible}
                swatchColor="rgba(0, 200, 150, 0.7)"
                onClick={onToggleVolume}
                ariaLabel={volumeVisible ? "Hide volume" : "Show volume"}
              />
              <EmaIndicatorControls
                timeframe={timeframe}
                availableHtfs={availableHtfsFor(timeframe)}
                emaVisible={emaVisible}
                htfEmaVisibility={htfEmaVisibility}
                emaPeriod={emaPeriod}
                htfEmaPeriods={htfEmaPeriods}
                onToggleEma={onToggleEma}
                onToggleHtfEma={onToggleHtfEma}
              />
              <IndicatorPill
                label="VWAP"
                active={vwapVisible}
                swatchColor="rgba(180, 130, 230, 0.85)"
                onClick={onToggleVwap}
                ariaLabel={vwapVisible ? "Hide VWAP" : "Show VWAP"}
              />
              <IndicatorPill
                label="MG"
                active={microGapsVisible}
                swatchColor="rgba(180, 130, 230, 0.85)"
                onClick={onToggleMicroGaps}
                ariaLabel={microGapsVisible ? "Hide micro gaps" : "Show micro gaps"}
                title="Python micro gaps"
              />
              <IndicatorPill
                label="FVG"
                active={fvgVisible}
                swatchColor="rgba(245, 166, 35, 0.85)"
                onClick={onToggleFvg}
                ariaLabel={fvgVisible ? "Hide fair value gaps" : "Show fair value gaps"}
                title="Python fair value gaps"
              />
              {htfContextLabel ? (
                <IndicatorPill
                  label={htfContextLabel}
                  active={htfContextVisible}
                  swatchColor="rgba(232, 232, 232, 0.85)"
                  onClick={onToggleHtfContext}
                  ariaLabel={htfContextVisible ? "Hide HTF context bars" : "Show HTF context bars"}
                  title="Python HTF context bars"
                />
              ) : null}
              {isIntradayTimeframe(timeframe) ? (
                <IndicatorPill
                  label="Bar#"
                  active={barNumbersVisible}
                  swatchColor="rgba(155, 161, 166, 0.85)"
                  onClick={onToggleBarNumbers}
                  ariaLabel={barNumbersVisible ? "Hide bar numbers" : "Show bar numbers"}
                />
              ) : null}
            </div>
            {drawnLines.length > 0 ? (
              <button
                type="button"
                aria-label="Clear drawn lines"
                onClick={onClearDrawnLines}
                title="Tap to clear all drawn lines"
                className="glass-chip pointer-events-auto inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-semibold tabular-nums text-text outline-none focus-visible:ring-2 focus-visible:ring-teal/70 focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
              >
                <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-text/70" />
                S/R · {drawnLines.length} <span className="text-sub/60">×</span>
              </button>
            ) : null}
            {compareSymbol ? (
              <button
                type="button"
                onClick={onClearCompare}
                aria-label={`Comparison symbol: ${compareSymbol}. Tap to clear.`}
                title={`Comparing vs ${compareSymbol} (% change). Tap to clear.`}
                className="glass-chip pointer-events-auto inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-semibold tabular-nums text-orange outline-none focus-visible:ring-2 focus-visible:ring-teal/70 focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
              >
                <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-orange" />
                vs {compareSymbol} <span className="text-sub/60">×</span>
              </button>
            ) : null}
            {replayActive ? (
              <button
                type="button"
                onClick={onExitReplay}
                aria-label="Exit replay mode"
                title="Replay mode active — tap to exit, ← / → to step"
                className="glass-chip pointer-events-auto inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-semibold tabular-nums text-yellow outline-none focus-visible:ring-2 focus-visible:ring-teal/70 focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
              >
                <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-yellow" />
                REPLAY {bars.at(-1) ? formatBarTime(bars[bars.length - 1].t, displayTimezone) : ""}{" "}
                <span className="text-sub/60">×</span>
              </button>
            ) : null}
          </div>
        </div>

        <div className="pointer-events-none absolute right-2 top-2 z-10 flex flex-col items-end gap-1.5 sm:right-3 sm:top-3">
          {/* Always-in: Brooks long/short/mixed classification.
              Intraday only — daily/weekly bars don't carry the concept. */}
          {isIntradayTimeframe(timeframe) ? (
            <span
              className={`glass-chip pointer-events-auto inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em] ${
                alwaysIn === "long"
                  ? "text-teal"
                  : alwaysIn === "short"
                    ? "text-red"
                    : "text-sub"
              }`}
              title={
                alwaysIn === "long"
                  ? `Always-in: Long (close above ${emaLabelShort} and ${emaLabelShort} rising)`
                  : alwaysIn === "short"
                    ? `Always-in: Short (close below ${emaLabelShort} and ${emaLabelShort} falling)`
                    : `Always-in: Mixed signal (close and ${emaLabelShort} slope disagree)`
              }
            >
              <span
                aria-hidden="true"
                className={`h-1.5 w-1.5 rounded-full ${
                  alwaysIn === "long" ? "bg-teal" : alwaysIn === "short" ? "bg-red" : "bg-sub"
                }`}
              />
              {alwaysIn === "long" ? "Long" : alwaysIn === "short" ? "Short" : "Mixed"}
            </span>
          ) : null}
          {sessionRangeStripVisible && sessionRange > 0 ? (
            <div className="glass-chip pointer-events-auto flex flex-wrap items-center justify-end gap-x-2 gap-y-0.5 rounded-md px-2 py-1 font-mono text-[10px] tabular-nums text-sub/90 sm:text-[11px]">
              <span className="sm:hidden"><span className="text-sub/60">R</span> {sessionRange.toFixed(2)}</span>
              <span className="hidden sm:inline"><span className="text-sub/60">SR</span> {sessionRange.toFixed(2)}</span>
              <span className="hidden text-sub/40 sm:inline">·</span>
              <span className="hidden sm:inline"><span className="text-sub/60">scalp</span> {(sessionRange * 0.07).toFixed(2)}</span>
              <span className="hidden text-sub/40 sm:inline">·</span>
              <span className="hidden sm:inline"><span className="text-sub/60">swing</span> {(sessionRange * 0.55).toFixed(2)}-{(sessionRange * 0.85).toFixed(2)}</span>
              <span className="hidden text-sub/40 sm:inline">·</span>
              <span className="hidden sm:inline"><span className="text-sub/60">stop</span> {(sessionRange * 0.22).toFixed(2)}-{(sessionRange * 0.44).toFixed(2)}</span>
            </div>
          ) : null}
        </div>

        <div ref={containerRef} className="h-full w-full" />

        <div className="pointer-events-none absolute inset-0 z-[5]">
          {zoneOverlays.map((zone) => {
            const isMicro = zone.kind === "micro"
            const isBull = zone.direction === "bull"
            const backgroundColor = isMicro
              ? "rgba(180, 130, 230, 0.14)"
              : isBull
                ? "rgba(245, 166, 35, 0.12)"
                : "rgba(91, 168, 230, 0.12)"
            const borderColor = isMicro
              ? "rgba(180, 130, 230, 0.55)"
              : isBull
                ? "rgba(245, 166, 35, 0.55)"
                : "rgba(91, 168, 230, 0.55)"
            return (
              <span
                key={zone.id}
                aria-hidden="true"
                data-testid={`python-zone-${zone.kind}`}
                className="absolute rounded-[2px] border"
                style={{
                  left: zone.left,
                  top: zone.top,
                  width: zone.width,
                  height: zone.height,
                  backgroundColor,
                  borderColor,
                  borderStyle: zone.filled ? "dashed" : "solid",
                }}
              />
            )
          })}
          {htfContextOverlays.map((candle) => (
            <span
              key={candle.id}
              aria-hidden="true"
              data-testid="python-htf-context"
              title={`${candle.label} O ${formatPrice(candle.open)} H ${formatPrice(candle.high)} L ${formatPrice(candle.low)} C ${formatPrice(candle.close)}`}
              className="absolute"
              style={{
                left: candle.left,
                top: candle.wickTop,
                width: candle.bodyWidth,
                height: candle.wickHeight,
              }}
            >
              <span
                className="absolute w-px bg-text/55"
                style={{
                  left: candle.bodyWidth / 2,
                  top: 0,
                  height: candle.wickHeight,
                }}
              />
              <span
                className="absolute rounded-[1px] border"
                style={{
                  left: 0,
                  top: candle.bodyTop - candle.wickTop,
                  width: candle.bodyWidth,
                  height: candle.bodyHeight,
                  backgroundColor: candle.color,
                  borderColor: candle.color,
                }}
              />
              {candle.label ? (
                <span
                  className="absolute left-1/2 -translate-x-1/2 font-mono text-[9px] font-semibold text-text/80"
                  style={{ top: -14 }}
                >
                  {candle.label}
                </span>
              ) : null}
            </span>
          ))}
          {sessionDividers.map((divider) => (
            <span
              key={`divider-${divider.id}`}
              aria-hidden="true"
              data-testid="session-divider"
              className="absolute top-0 bottom-0 w-px bg-border/30"
              style={{ left: divider.x - 0.5 }}
            />
          ))}
          {barNumbersVisible && barNumberLabels.map((label) => (
            <span
              key={label.id}
              data-testid="bar-number-label"
              aria-hidden="true"
              className={`absolute -translate-x-1/2 font-mono text-[9px] font-semibold leading-none tabular-nums ${
                label.tone === "bull" ? "text-[#62ad61]" : "text-[#ff535d]"
              }`}
              style={{ left: label.x, top: label.y }}
            >
              {label.text}
            </span>
          ))}
        </div>

        {crosshairReadout && (
          <div
            className="glass-chip pointer-events-none absolute z-20 rounded-md px-2.5 py-2 font-mono text-[11px] leading-[1.35] text-text/90 sm:text-[10px] sm:leading-4"
            style={{ left: crosshairReadout.x, top: crosshairReadout.y }}
          >
            {crosshairReadout.lines.map((line) => (
              <div key={line}>{line}</div>
            ))}
          </div>
        )}

        {viewState.offDefault && (
          <button
            type="button"
            aria-label="Reset chart view"
            onClick={resetView}
            className="glass-chip absolute bottom-12 right-3 z-20 flex min-h-7 items-center gap-1 rounded-md px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-sub outline-none hover:text-text focus-visible:ring-2 focus-visible:ring-teal/70 focus-visible:ring-offset-2 focus-visible:ring-offset-bg sm:right-4"
          >
            <span aria-hidden="true" className="text-[12px] leading-none">⟲</span>
            Reset
          </button>
        )}

      </div>

      {/* Chrome row sits below the chart frame (and the time axis), in
          its own flex track. Toolbar on the left, symbol scroller on
          the right. Both are static now — no absolute overlays inside
          the chart canvas. */}
      <div className="relative flex items-center gap-2 px-3 pb-[env(safe-area-inset-bottom,0px)] sm:px-4">
        <div
          data-testid="chart-bottom-toolbar"
          className="glass-chip flex min-w-0 flex-1 items-center overflow-x-auto scrollbar-none rounded-md p-0.5"
        >
          {isIntradayTimeframe(timeframe) ? (
            <>
              <Segment
                bare
                value={String(barWindow)}
                options={BAR_WINDOW_CHOICES.map(({ value, label }) => ({ value: String(value), label }))}
                onChange={(next) => onSelectBarWindow(Number(next))}
              />
              <span aria-hidden="true" className="mx-1 h-4 w-px shrink-0 bg-border/40" />
            </>
          ) : null}
          <Segment
            bare
            value={timeframe}
            options={TIMEFRAMES.map(({ value, label }) => ({ value, label }))}
            onChange={onSelectTimeframe}
          />
          {isIntradayTimeframe(timeframe) ? (
            <>
              <span aria-hidden="true" className="mx-1 h-4 w-px shrink-0 bg-border/40" />
              <Segment<SessionMode>
                bare
                value={sessionMode}
                options={[
                  { value: "rth", label: "RTH" },
                  { value: "all", label: "EXT" },
                ]}
                onChange={onSelectSessionMode}
              />
            </>
          ) : null}
        </div>

        <SymbolScroller symbol={symbol} symbols={symbols} onSelect={onSelectSymbol} onPrefetch={onPrefetchSymbol} onAdd={onAddSymbol} />
      </div>
    </section>
  )
}

function Watchlist({
  symbols,
  selected,
  quotes,
  onSelect,
  onPrefetch,
}: {
  symbols: string[]
  selected: string
  quotes: Record<string, Quote>
  onSelect: (symbol: string) => void
  onPrefetch?: (symbol: string) => void
}) {
  return (
    <div className="rounded-md border border-border bg-surface">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-sub">Watchlist</h2>
        <span className="text-[10px] text-sub">1m cache</span>
      </div>
      <div className="max-h-[300px] overflow-y-auto">
        {symbols.map((symbol) => {
          const quote = quotes[symbol]
          const active = symbol === selected
          const positive = (quote?.changePct ?? 0) >= 0
          return (
            <button
              key={symbol}
              type="button"
              onPointerEnter={onPrefetch ? () => onPrefetch(symbol) : undefined}
              onFocus={onPrefetch ? () => onPrefetch(symbol) : undefined}
              onClick={() => onSelect(symbol)}
              className={`grid min-h-11 w-full grid-cols-[minmax(58px,1fr)_auto_auto] items-center gap-3 border-b border-border px-3 py-2 text-left last:border-b-0 sm:min-h-0 ${
                active ? "bg-surface-hover" : "hover:bg-surface-hover"
              }`}
            >
              <span className="flex items-center gap-2 text-xs font-semibold text-text">
                <SymbolIcon active={active} />
                {symbol}
              </span>
              <span className="text-right font-mono text-xs tabular-nums text-text">{formatPrice(quote?.last)}</span>
              <span className={`text-right font-mono text-[11px] tabular-nums ${positive ? "text-teal" : "text-red"}`}>
                {quote?.changePct == null ? "-" : signed(quote.changePct, "%")}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function SidePanel({
  symbol,
  bars,
  quotes,
  symbols,
  selectedSymbol,
  onSelectSymbol,
  onPrefetchSymbol,
}: {
  symbol: string
  bars: Bar[]
  quotes: Record<string, Quote>
  symbols: string[]
  selectedSymbol: string
  onSelectSymbol: (symbol: string) => void
  onPrefetchSymbol?: (symbol: string) => void
}) {
  const metrics = metricsFor(bars)
  const positive = (metrics.change ?? 0) >= 0

  return (
    <aside className="flex min-h-0 flex-col gap-3 overflow-y-auto bg-bg p-3 xl:w-[320px] xl:border-l xl:border-border">
      <div className="rounded-md border border-border bg-surface p-3">
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <h2 className="text-sm font-bold tracking-tight">{symbol}</h2>
          <span className={`font-mono text-xs tabular-nums ${positive ? "text-teal" : "text-red"}`}>
            {signed(metrics.change)} / {signed(metrics.changePct, "%")}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2 text-[11px]">
          <Stat label="Last" value={formatPrice(metrics.latest?.c)} />
          <Stat label="Volume" value={formatVolume(metrics.volume)} />
          <Stat label="High" value={formatPrice(metrics.high)} />
          <Stat label="Low" value={formatPrice(metrics.low)} />
        </div>
      </div>

      <Watchlist symbols={symbols} selected={selectedSymbol} quotes={quotes} onSelect={onSelectSymbol} onPrefetch={onPrefetchSymbol} />
    </aside>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-bg px-2 py-2">
      <div className="mb-1 text-[10px] uppercase tracking-[0.12em] text-sub">{label}</div>
      <div className="font-mono text-xs tabular-nums text-text">{value}</div>
    </div>
  )
}

// Top-right gear menu housing common settings (display TZ, comparison
// symbol, refresh). Anchored under its trigger button. Closes on
// outside click and on Esc so it never traps the user.
function SettingsMenu({
  displayTimezone,
  onSelectTimezone,
  compareSymbol,
  onSetCompare,
  onClearCompare,
  onRefresh,
}: {
  displayTimezone: DisplayTimezone
  onSelectTimezone: (tz: DisplayTimezone) => void
  compareSymbol: string | null
  onSetCompare: (symbol: string) => void
  onClearCompare: () => void
  onRefresh: () => void
}) {
  const [open, setOpen] = useState(false)
  const [compareDraft, setCompareDraft] = useState(compareSymbol ?? "")
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onClick = (event: MouseEvent) => {
      if (!containerRef.current) return
      if (event.target instanceof Node && !containerRef.current.contains(event.target)) {
        setOpen(false)
      }
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false)
    }
    document.addEventListener("mousedown", onClick)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onClick)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  const submitCompare = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const clean = compareDraft.trim().toUpperCase()
    if (!clean) {
      onClearCompare()
      return
    }
    onSetCompare(clean)
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-label="Chart settings"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => {
          const nextOpen = !open
          if (nextOpen) setCompareDraft(compareSymbol ?? "")
          setOpen(nextOpen)
        }}
        className={`min-h-7 rounded-md border px-2 py-0.5 text-[11px] font-semibold outline-none hover:border-border-hover hover:text-text focus-visible:ring-2 focus-visible:ring-teal/70 focus-visible:ring-offset-2 focus-visible:ring-offset-bg ${
          open ? "border-teal/60 bg-surface-hover text-text" : "border-border/60 bg-surface text-sub"
        }`}
        title="Chart settings"
      >
        <span aria-hidden="true" className="inline-block leading-none">⚙</span>
      </button>

      {open && (
        <div
          role="menu"
          className="glass-panel absolute left-0 top-[calc(100%+6px)] z-30 w-64 max-w-[calc(100vw-1rem)] rounded-md p-3 text-[12px] text-text sm:left-auto sm:right-0"
        >
          <div className="mb-3">
            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-sub">
              Display timezone
            </div>
            <div className="flex gap-1">
              {(["ET", "UTC", "local"] as const).map((tz) => (
                <button
                  key={tz}
                  type="button"
                  onClick={() => onSelectTimezone(tz)}
                  aria-pressed={displayTimezone === tz}
                  className={`flex-1 rounded-md border px-2 py-1 text-[11px] font-semibold tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-teal/70 focus-visible:ring-offset-2 focus-visible:ring-offset-bg ${
                    displayTimezone === tz
                      ? "border-teal/60 bg-teal/15 text-teal"
                      : "border-border/60 bg-surface text-sub hover:text-text"
                  }`}
                >
                  {tz === "local" ? "Local" : tz}
                </button>
              ))}
            </div>
          </div>

          <div className="mb-3">
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-sub">
                Compare with
              </span>
              {compareSymbol && (
                <button
                  type="button"
                  onClick={() => {
                    onClearCompare()
                    setCompareDraft("")
                  }}
                  className="text-[10px] font-semibold text-sub hover:text-text"
                >
                  Clear
                </button>
              )}
            </div>
            <form onSubmit={submitCompare} className="flex gap-1">
              <input
                type="text"
                value={compareDraft}
                onChange={(event) => setCompareDraft(event.target.value.toUpperCase())}
                placeholder="e.g. QQQ"
                spellCheck={false}
                autoCapitalize="characters"
                autoCorrect="off"
                className="min-w-0 flex-1 rounded-md border border-border/60 bg-surface px-2 py-1 font-mono text-[12px] uppercase text-text outline-none focus-visible:ring-2 focus-visible:ring-teal/70"
              />
              <button
                type="submit"
                className="rounded-md border border-border/60 bg-surface px-2 py-1 text-[11px] font-semibold text-text outline-none hover:border-border-hover focus-visible:ring-2 focus-visible:ring-teal/70 focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
              >
                Set
              </button>
            </form>
            {compareSymbol && (
              <div className="mt-1 font-mono text-[10px] tabular-nums text-orange/90">
                Active: vs {compareSymbol}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => {
              onRefresh()
              setOpen(false)
            }}
            className="w-full rounded-md border border-border/60 bg-surface px-2 py-1 text-[11px] font-semibold text-sub outline-none hover:border-border-hover hover:text-text focus-visible:ring-2 focus-visible:ring-teal/70 focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
          >
            Refresh data
          </button>
        </div>
      )}
    </div>
  )
}

// Header-anchored indicator picker. Lists every chart overlay with a
// switch row so the user can add/remove them in one place instead of
// hunting the small pills on the chart canvas. The chart pills stay
// active as quick-toggles for the indicators that are currently on.
//
// Each row also exposes a ⚙ that expands an inline panel for that
// indicator's tunable parameters (count, max-active caps, etc).
// Indicators that don't have parameters yet show a "no options"
// placeholder so the affordance is uniform across the menu.
type IndicatorRow = {
  key: string
  label: string
  active: boolean
  swatch: string
  onToggle: () => void
  settings: ReactNode | null
}

function NumberSettingRow({
  label,
  value,
  min,
  max,
  step = 1,
  hint,
  onChange,
  onReset,
  resetLabel,
}: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  hint?: string
  onChange: (next: number) => void
  onReset?: () => void
  resetLabel?: string
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-sub">{label}</span>
        <input
          type="number"
          inputMode="numeric"
          aria-label={label}
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(event) => {
            const next = Number(event.target.value)
            if (Number.isFinite(next)) onChange(clampInt(next, min, max))
          }}
          className="h-7 w-16 rounded-md border border-border/60 bg-bg px-1.5 text-right font-mono text-[12px] text-text outline-none focus-visible:ring-2 focus-visible:ring-teal/70"
        />
      </label>
      {(hint || onReset) && (
        <div className="flex items-center justify-between gap-2 text-[10px] text-sub/80">
          <span>{hint ?? ""}</span>
          {onReset && (
            <button
              type="button"
              onClick={onReset}
              className="rounded border border-border/40 px-1.5 py-0.5 font-semibold text-sub outline-none hover:border-border-hover hover:text-text focus-visible:ring-2 focus-visible:ring-teal/70"
            >
              {resetLabel ?? "Reset"}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function NoOptionsRow() {
  return (
    <div className="text-[10px] text-sub/70">No options yet.</div>
  )
}

function IndicatorsMenu({
  intraday,
  timeframe,
  availableHtfs,
  volumeVisible,
  sessionRangeStripVisible,
  emaVisible,
  emaPeriod,
  htfEmaPeriods,
  htfEmaVisibility,
  vwapVisible,
  barNumbersVisible,
  microGapsVisible,
  microGapsMaxActive,
  fvgVisible,
  fvgMaxActive,
  htfContextVisible,
  htfContextLabel,
  htfContextCount,
  barWindow,
  levelVisibility,
  drawnLinesCount,
  compareSymbol,
  replayActive,
  onToggleVolume,
  onToggleSessionRangeStrip,
  onToggleEma,
  onToggleHtfEma,
  onToggleVwap,
  onToggleBarNumbers,
  onToggleMicroGaps,
  onToggleFvg,
  onToggleHtfContext,
  onToggleLevel,
  onSetEmaPeriod,
  onSetHtfEmaPeriod,
  onSetHtfContextCount,
  onSetMicroGapsMaxActive,
  onSetFvgMaxActive,
  onClearDrawnLines,
  onClearCompare,
  onExitReplay,
}: {
  intraday: boolean
  timeframe: ChartViewTimeframe
  availableHtfs: typeof HTF_SPECS
  volumeVisible: boolean
  sessionRangeStripVisible: boolean
  emaVisible: boolean
  emaPeriod: number
  htfEmaPeriods: Record<HtfKey, number>
  htfEmaVisibility: HtfVisibility
  vwapVisible: boolean
  barNumbersVisible: boolean
  microGapsVisible: boolean
  microGapsMaxActive: number
  fvgVisible: boolean
  fvgMaxActive: number
  htfContextVisible: boolean
  htfContextLabel: string
  htfContextCount: number | null
  barWindow: number
  levelVisibility: LevelVisibility
  drawnLinesCount: number
  compareSymbol: string | null
  replayActive: boolean
  onToggleVolume: () => void
  onToggleSessionRangeStrip: () => void
  onToggleEma: () => void
  onToggleHtfEma: (key: HtfKey) => void
  onToggleVwap: () => void
  onToggleBarNumbers: () => void
  onToggleMicroGaps: () => void
  onToggleFvg: () => void
  onToggleHtfContext: () => void
  onToggleLevel: (group: LevelGroup) => void
  onSetEmaPeriod: (next: number) => void
  onSetHtfEmaPeriod: (key: HtfKey, next: number) => void
  onSetHtfContextCount: (next: number | null) => void
  onSetMicroGapsMaxActive: (next: number) => void
  onSetFvgMaxActive: (next: number) => void
  onClearDrawnLines: () => void
  onClearCompare: () => void
  onExitReplay: () => void
}) {
  const [open, setOpen] = useState(false)
  const [expandedKey, setExpandedKey] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const closeMenu = useCallback(() => {
    setOpen(false)
    setExpandedKey(null)
  }, [])

  useEffect(() => {
    if (!open) return
    const onClick = (event: MouseEvent) => {
      if (!containerRef.current) return
      if (event.target instanceof Node && !containerRef.current.contains(event.target)) {
        closeMenu()
      }
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMenu()
    }
    document.addEventListener("mousedown", onClick)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onClick)
      document.removeEventListener("keydown", onKey)
    }
  }, [open, closeMenu])

  const baseEmaLabel = `${timeframeLabel(timeframe)} ${formatEmaLabel(emaPeriod)}`
  const emaOverlays: IndicatorRow[] = [
    {
      key: "ema",
      label: baseEmaLabel,
      active: emaVisible,
      swatch: "rgba(91, 168, 230, 0.85)",
      onToggle: onToggleEma,
      // Base EMA period — independent from HTF EMA periods so a user
      // can run, e.g., 9 on the chart's own timeframe and keep 20 on
      // the Daily HTF.
      settings: (
        <NumberSettingRow
          label="Period"
          value={emaPeriod}
          min={EMA_PERIOD_MIN}
          max={EMA_PERIOD_MAX}
          hint={`Base EMA · default ${EMA_PERIOD_DEFAULT}`}
          onChange={onSetEmaPeriod}
          onReset={emaPeriod === EMA_PERIOD_DEFAULT ? undefined : () => onSetEmaPeriod(EMA_PERIOD_DEFAULT)}
        />
      ),
    },
    ...availableHtfs.map((spec) => {
      const period = htfEmaPeriods[spec.key]
      return {
        key: `htf-${spec.key}`,
        label: formatHtfEmaLabel(spec, period),
        active: htfEmaVisibility[spec.key],
        swatch: spec.color,
        onToggle: () => onToggleHtfEma(spec.key),
        settings: (
          <NumberSettingRow
            label="Period"
            value={period}
            min={EMA_PERIOD_MIN}
            max={EMA_PERIOD_MAX}
            hint={`${spec.label.replace(/EMA\d+/, "EMA")} period · default ${EMA_PERIOD_DEFAULT}`}
            onChange={(next) => onSetHtfEmaPeriod(spec.key, next)}
            onReset={period === EMA_PERIOD_DEFAULT
              ? undefined
              : () => onSetHtfEmaPeriod(spec.key, EMA_PERIOD_DEFAULT)}
          />
        ),
      }
    }),
  ]
  const chartOverlays: IndicatorRow[] = [
    { key: "vol", label: "Volume", active: volumeVisible, swatch: "rgba(0, 200, 150, 0.7)", onToggle: onToggleVolume, settings: null },
    { key: "sr-strip", label: "Session range strip", active: sessionRangeStripVisible, swatch: "rgba(180, 180, 180, 0.85)", onToggle: onToggleSessionRangeStrip, settings: null },
    { key: "vwap", label: "VWAP", active: vwapVisible, swatch: "rgba(180, 130, 230, 0.85)", onToggle: onToggleVwap, settings: null },
    {
      key: "micro",
      label: "Micro gaps",
      active: microGapsVisible,
      swatch: "rgba(180, 130, 230, 0.85)",
      onToggle: onToggleMicroGaps,
      settings: (
        <NumberSettingRow
          label="Max active zones"
          value={microGapsMaxActive}
          min={ZONE_MAX_ACTIVE_MIN}
          max={ZONE_MAX_ACTIVE_MAX}
          hint={`Default ${MICRO_GAPS_MAX_ACTIVE_DEFAULT}`}
          onChange={onSetMicroGapsMaxActive}
          onReset={
            microGapsMaxActive === MICRO_GAPS_MAX_ACTIVE_DEFAULT
              ? undefined
              : () => onSetMicroGapsMaxActive(MICRO_GAPS_MAX_ACTIVE_DEFAULT)
          }
        />
      ),
    },
    {
      key: "fvg",
      label: "Fair value gaps",
      active: fvgVisible,
      swatch: "rgba(245, 166, 35, 0.85)",
      onToggle: onToggleFvg,
      settings: (
        <NumberSettingRow
          label="Max active zones"
          value={fvgMaxActive}
          min={ZONE_MAX_ACTIVE_MIN}
          max={ZONE_MAX_ACTIVE_MAX}
          hint={`Default ${FVG_MAX_ACTIVE_DEFAULT}`}
          onChange={onSetFvgMaxActive}
          onReset={
            fvgMaxActive === FVG_MAX_ACTIVE_DEFAULT
              ? undefined
              : () => onSetFvgMaxActive(FVG_MAX_ACTIVE_DEFAULT)
          }
        />
      ),
    },
    ...(htfContextLabel
      ? [{
          key: "htf-context",
          label: `${htfContextLabel} context bars`,
          active: htfContextVisible,
          swatch: "rgba(232, 232, 232, 0.85)",
          onToggle: onToggleHtfContext,
          settings: (
            <NumberSettingRow
              label="Bar count"
              value={htfContextCount ?? barWindow}
              min={HTF_CONTEXT_COUNT_MIN}
              max={HTF_CONTEXT_COUNT_MAX}
              hint={htfContextCount == null
                ? `Following bar window (${barWindow})`
                : `Manual · default follows bar window (${barWindow})`}
              onChange={(next) => onSetHtfContextCount(next)}
              onReset={htfContextCount == null ? undefined : () => onSetHtfContextCount(null)}
              resetLabel="Use default"
            />
          ),
        } as IndicatorRow]
      : []),
    ...(intraday
      ? [{ key: "bn", label: "Bar numbers", active: barNumbersVisible, swatch: "rgba(155, 161, 166, 0.85)", onToggle: onToggleBarNumbers, settings: null } as IndicatorRow]
      : []),
  ]
  const renderOverlayRow = (overlay: IndicatorRow) => {
    const isExpanded = expandedKey === overlay.key
    return (
      <div key={overlay.key} className="flex flex-col gap-1">
        <div
          className={`flex items-stretch overflow-hidden rounded-md border ${
            overlay.active
              ? "border-border bg-surface"
              : "border-border/40 bg-bg hover:border-border-hover"
          }`}
        >
          <button
            type="button"
            onClick={overlay.onToggle}
            aria-pressed={overlay.active}
            className={`flex flex-1 items-center justify-between gap-2 px-2 py-1.5 text-left text-[12px] outline-none focus-visible:ring-2 focus-visible:ring-teal/70 focus-visible:ring-inset ${
              overlay.active ? "text-text" : "text-sub hover:text-text"
            }`}
          >
            <span className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="h-1.5 w-1.5 rounded-full"
                style={{
                  backgroundColor: overlay.active ? overlay.swatch : "transparent",
                  boxShadow: overlay.active ? "none" : `inset 0 0 0 1px ${overlay.swatch}80`,
                }}
              />
              {overlay.label}
            </span>
            <span className={`text-[10px] font-semibold uppercase ${overlay.active ? "text-teal" : "text-sub"}`}>
              {overlay.active ? "On" : "Off"}
            </span>
          </button>
          <button
            type="button"
            aria-label={`${overlay.label} settings`}
            aria-expanded={isExpanded}
            onClick={() => setExpandedKey((current) => (current === overlay.key ? null : overlay.key))}
            title={`${overlay.label} settings`}
            className={`flex w-7 items-center justify-center border-l text-[12px] outline-none focus-visible:ring-2 focus-visible:ring-teal/70 focus-visible:ring-inset ${
              isExpanded
                ? "border-border bg-surface-hover text-text"
                : "border-border/40 text-sub hover:bg-surface-hover hover:text-text"
            }`}
          >
            <span aria-hidden="true">⚙</span>
          </button>
        </div>
        {isExpanded && (
          <div className="ml-2 rounded-md border border-border/40 bg-bg/60 px-2 py-1.5">
            {overlay.settings ?? <NoOptionsRow />}
          </div>
        )}
      </div>
    )
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-label="Indicators"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => {
          if (open) {
            closeMenu()
          } else {
            setOpen(true)
          }
        }}
        className={`min-h-7 rounded-md border px-2 py-0.5 text-[11px] font-semibold outline-none hover:border-border-hover hover:text-text focus-visible:ring-2 focus-visible:ring-teal/70 focus-visible:ring-offset-2 focus-visible:ring-offset-bg ${
          open ? "border-teal/60 bg-surface-hover text-text" : "border-border/60 bg-surface text-sub"
        }`}
        title="Indicators"
      >
        ƒx
      </button>

      {open && (
        <div
          role="menu"
          className="glass-panel absolute left-0 top-[calc(100%+6px)] z-30 w-64 max-w-[calc(100vw-1rem)] rounded-md p-3 text-[12px] text-text sm:left-auto sm:right-0"
        >
          <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-sub">
            EMA overlays
          </div>
          <div className="flex flex-col gap-1">
            {emaOverlays.map(renderOverlayRow)}
          </div>

          <div className="mb-1.5 mt-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-sub">
            Chart overlays
          </div>
          <div className="flex flex-col gap-1">
            {chartOverlays.map(renderOverlayRow)}
          </div>

          {intraday && (
            <>
              <div className="mb-1.5 mt-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-sub">
                Brooks levels
              </div>
              <div className="grid grid-cols-2 gap-1">
                {LEVEL_GROUPS.map((group) => {
                  const active = levelVisibility[group.key]
                  return (
                    <button
                      key={group.key}
                      type="button"
                      onClick={() => onToggleLevel(group.key)}
                      aria-pressed={active}
                      className={`flex items-center gap-2 rounded-md border px-2 py-1.5 text-left text-[12px] outline-none focus-visible:ring-2 focus-visible:ring-teal/70 focus-visible:ring-offset-2 focus-visible:ring-offset-bg ${
                        active
                          ? "border-border bg-surface text-text"
                          : "border-border/40 bg-bg text-sub hover:border-border-hover hover:text-text"
                      }`}
                    >
                      <span
                        aria-hidden="true"
                        className="h-1.5 w-1.5 rounded-full"
                        style={{
                          backgroundColor: active ? group.swatch : "transparent",
                          boxShadow: active ? "none" : `inset 0 0 0 1px ${group.swatch}99`,
                        }}
                      />
                      {group.label}
                    </button>
                  )
                })}
              </div>
            </>
          )}

          {(compareSymbol || replayActive || drawnLinesCount > 0) && (
            <div className="mt-3 flex flex-col gap-1">
              {compareSymbol && (
                <button
                  type="button"
                  onClick={() => {
                    onClearCompare()
                    setOpen(false)
                  }}
                  className="w-full rounded-md border border-border/60 bg-surface px-2 py-1 text-left text-[11px] font-semibold text-orange outline-none hover:border-border-hover focus-visible:ring-2 focus-visible:ring-teal/70 focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
                >
                  Clear comparison · vs {compareSymbol}
                </button>
              )}
              {replayActive && (
                <button
                  type="button"
                  onClick={() => {
                    onExitReplay()
                    setOpen(false)
                  }}
                  className="w-full rounded-md border border-border/60 bg-surface px-2 py-1 text-left text-[11px] font-semibold text-yellow outline-none hover:border-border-hover focus-visible:ring-2 focus-visible:ring-teal/70 focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
                >
                  Exit replay mode
                </button>
              )}
              {drawnLinesCount > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    onClearDrawnLines()
                    setOpen(false)
                  }}
                  className="w-full rounded-md border border-border/60 bg-surface px-2 py-1 text-left text-[11px] font-semibold text-sub outline-none hover:border-border-hover hover:text-text focus-visible:ring-2 focus-visible:ring-teal/70 focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
                >
                  Clear drawn S/R · {drawnLinesCount}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

interface TradingViewTerminalProps {
  /**
   * Symbol passed in by the route via `?symbol=` URL param. When provided
   * it seeds the chart on mount, overriding the persisted default. Once
   * the chart has booted, in-app symbol changes still write through to
   * the persisted prefs as before — we don't re-read this on every render.
   */
  initialSymbolOverride?: string
}

export function TradingViewTerminal({ initialSymbolOverride }: TradingViewTerminalProps = {}) {
  const [symbols, setSymbols] = useState<string[]>(() => {
    const customs = readCustomSymbols()
    return Array.from(new Set([...DEFAULT_SYMBOLS, ...customs]))
  })
  // Subset of `symbols` that the Fly aggregator actually subscribes to
  // — populated from /api/bars/live/symbols. Used to distinguish
  // "waiting for first bar" (legitimate subscribed symbol) from
  // "not subscribed for this ticker" in the live status tooltip.
  const [liveSubscribedSet, setLiveSubscribedSet] = useState<Set<string>>(() => new Set(DEFAULT_SYMBOLS))
  const [dataset, setDataset] = useState<string | null>(null)
  const [schema, setSchema] = useState<string | null>(null)
  // Hydrate initial symbol from global prefs, then layer the symbol-
  // specific overrides on top for the rest of the state. selectSymbol
  // is responsible for saving/loading these on subsequent switches.
  const initialSymbol = initialSymbolOverride ?? storedSymbol()
  const [selectedSymbol, setSelectedSymbol] = useState(initialSymbol)
  const [symbolDraft, setSymbolDraft] = useState(storedSymbol)
  const [timeframe, setTimeframe] = useState<ChartViewTimeframe>(() => symbolTimeframe(initialSymbol))
  const [barWindow, setBarWindow] = useState(() => symbolBarWindow(initialSymbol))
  const [sessionMode, setSessionMode] = useState<SessionMode>(() => symbolSessionMode(initialSymbol))
  const [refreshNonce, setRefreshNonce] = useState(0)
  const [historyBars, setHistoryBars] = useState<Bar[]>([])
  const [liveBars, setLiveBars] = useState<Bar[]>([])
  const [liveStatus, setLiveStatus] = useState<LiveStatus>("unknown")
  const [contextBars, setContextBars] = useState<Bar[]>([])
  const [priorRthBars, setPriorRthBars] = useState<Bar[]>([])
  const [historyError, setHistoryError] = useState<string | null>(null)
  const [liveError, setLiveError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [lastFetchedAt, setLastFetchedAt] = useState<Date | null>(null)
  const [quotes, setQuotes] = useState<Record<string, Quote>>({})
  const [watchlistVisible, setWatchlistVisible] = useState(storedWatchlistVisible)
  const [mobileWatchlistOpen, setMobileWatchlistOpen] = useState(false)
  const [levelVisibility, setLevelVisibility] = useState<LevelVisibility>(() => symbolLevelVisibility(initialSymbol))
  const [volumeVisible, setVolumeVisible] = useState(() => symbolVolumeVisible(initialSymbol))
  // Session-range / scalp / swing / stop strip on the chart. Global pref
  // (not per-symbol) since it's a chart-wide overlay preference.
  const [sessionRangeStripVisible, setSessionRangeStripVisible] = useState(storedSessionRangeStripVisible)
  const [emaVisible, setEmaVisible] = useState(() => symbolEmaVisible(initialSymbol))
  const [vwapVisible, setVwapVisible] = useState(() => symbolVwapVisible(initialSymbol))
  const [htfEmaVisibility, setHtfEmaVisibility] = useState<HtfVisibility>(() => symbolHtfEmaVisibility(initialSymbol))
  const [htfBars, setHtfBars] = useState<Record<HtfKey, Bar[]>>(() => emptyHtfBars())
  const [barNumbersVisible, setBarNumbersVisible] = useState(() => symbolBarNumbersVisible(initialSymbol))
  const [microGapsVisible, setMicroGapsVisible] = useState(() => symbolMicroGapsVisible(initialSymbol))
  const [fvgVisible, setFvgVisible] = useState(() => symbolFvgVisible(initialSymbol))
  const [htfContextVisible, setHtfContextVisible] = useState(() => symbolHtfContextVisible(initialSymbol))
  // Per-indicator settings overrides. `htfContextCount === null` means
  // "follow the bar window" (1D→1 bar, 2D→2, etc); a number is a manual
  // override. Other settings store the raw value clamped on read.
  const [htfContextCount, setHtfContextCount] = useState<number | null>(() => symbolHtfContextCount(initialSymbol))
  const [microGapsMaxActive, setMicroGapsMaxActive] = useState<number>(() => symbolMicroGapsMaxActive(initialSymbol))
  const [fvgMaxActive, setFvgMaxActive] = useState<number>(() => symbolFvgMaxActive(initialSymbol))
  const [emaPeriod, setEmaPeriod] = useState<number>(() => symbolEmaPeriod(initialSymbol))
  const [htfEmaPeriods, setHtfEmaPeriods] = useState<Record<HtfKey, number>>(() => symbolHtfEmaPeriods(initialSymbol))
  const [drawnLines, setDrawnLines] = useState<number[]>(() => readDrawnLines(initialSymbol))
  // Replay mode. null = normal (live tail). A number freezes the chart
  // to that bar index in displayBars; [/] keys step forward/back.
  const [replayIndex, setReplayIndex] = useState<number | null>(null)
  const [displayTimezone, setDisplayTimezone] = useState<DisplayTimezone>(storedDisplayTimezone)
  // Optional comparison overlay. When set, fetches the other ticker on
  // the same range and renders it as a normalized %-change line on a
  // secondary left price scale.
  const [compareSymbol, setCompareSymbol] = useState<string | null>(storedCompareSymbol)
  const [compareBars, setCompareBars] = useState<Bar[]>([])
  const barsCacheRef = useRef<Map<string, { payload: BarsPayload; fetchedAt: number }>>(new Map())
  // Tracks fetches that have been kicked off but not yet resolved. When a
  // second caller asks for the same URL while the first is still in flight
  // (e.g. a 1Hz silent-poll against a slow non-subscribed ticker), it
  // joins the existing Promise instead of firing a duplicate request.
  // Eliminates the thundering-herd pile-up that made AVGO feel even
  // slower than its already-slow Databento Historical path.
  const barsInflightRef = useRef<Map<string, Promise<BarsPayload>>>(new Map())

  useEffect(() => {
    // Global prefs still hold the last-used symbol + the global
    // defaults (used as the fallback when a never-viewed symbol is
    // selected). Per-symbol overrides live in PER_SYMBOL_PREFS_KEY.
    writeChartPrefs({
      symbol: selectedSymbol,
      timeframe,
      barWindow,
      sessionMode,
      watchlistVisible,
      levelVisibility,
      volumeVisible,
      sessionRangeStripVisible,
      microGapsVisible,
      fvgVisible,
      htfContextVisible,
      displayTimezone,
      compareSymbol,
    })
  }, [barWindow, compareSymbol, displayTimezone, fvgVisible, htfContextVisible, levelVisibility, microGapsVisible, selectedSymbol, sessionMode, sessionRangeStripVisible, timeframe, volumeVisible, watchlistVisible])

  useEffect(() => {
    // Per-symbol overrides — written on every state change so the
    // current symbol's prefs reflect the latest state at all times.
    // selectSymbol also writes the previous symbol's bucket as part of
    // its switch logic, so this effect's first-firing-after-switch
    // duplicates that save harmlessly.
    writeSymbolPrefs(selectedSymbol, {
      timeframe,
      barWindow,
      sessionMode,
      levelVisibility,
      volumeVisible,
      emaVisible,
      vwapVisible,
      htfEmaVisibility,
      barNumbersVisible,
      microGapsVisible,
      fvgVisible,
      htfContextVisible,
      htfContextCount,
      microGapsMaxActive,
      fvgMaxActive,
      emaPeriod,
      htfEmaPeriods,
    })
  }, [barNumbersVisible, barWindow, emaPeriod, emaVisible, fvgMaxActive, fvgVisible, htfContextCount, htfContextVisible, htfEmaPeriods, htfEmaVisibility, levelVisibility, microGapsMaxActive, microGapsVisible, selectedSymbol, sessionMode, timeframe, volumeVisible, vwapVisible])

  const toggleVolume = useCallback(() => {
    setVolumeVisible((v) => !v)
  }, [])
  const addDrawnLine = useCallback((price: number) => {
    if (!Number.isFinite(price)) return
    setDrawnLines((current) => {
      // Hit-test: if a long-press lands within 0.1% of an existing
      // line's price, treat it as a *remove* instead of a duplicate
      // add. Tolerance scales with price so $5 stocks and $500 stocks
      // both feel right.
      const tolerance = Math.max(price * 0.001, 0.01)
      const existingIdx = current.findIndex((p) => Math.abs(p - price) < tolerance)
      const next = existingIdx >= 0
        ? current.filter((_, i) => i !== existingIdx)
        : [...current, price]
      writeDrawnLines(selectedSymbol, next)
      return next
    })
  }, [selectedSymbol])

  const clearDrawnLines = useCallback(() => {
    setDrawnLines([])
    writeDrawnLines(selectedSymbol, [])
  }, [selectedSymbol])

  const addSymbol = useCallback((symbol: string) => {
    const clean = symbol.trim().toUpperCase()
    if (!clean || !/^[A-Z][A-Z0-9.\-]{0,9}$/.test(clean)) return
    setSymbols((prev) => {
      if (prev.includes(clean)) return prev
      const next = [...prev, clean]
      // Persist anything that's not in the live aggregator's default
      // list. The live route may include extras (LIVE_SYMBOLS env var);
      // we only persist user-added entries to keep the storage clean.
      if (!DEFAULT_SYMBOLS.includes(clean)) {
        const customs = readCustomSymbols()
        if (!customs.includes(clean)) {
          writeCustomSymbols([...customs, clean])
        }
      }
      return next
    })
  }, [])
  const toggleEma = useCallback(() => {
    setEmaVisible((v) => !v)
  }, [])
  const toggleVwap = useCallback(() => {
    setVwapVisible((v) => !v)
  }, [])
  const toggleHtfEma = useCallback((key: HtfKey) => {
    if (key === "weekly") markWeeklyHtfEmaOptIn(selectedSymbol)
    setHtfEmaVisibility((current) => ({ ...current, [key]: !current[key] }))
  }, [selectedSymbol])
  const setHtfEmaPeriod = useCallback((key: HtfKey, next: number) => {
    const clamped = clampInt(next, EMA_PERIOD_MIN, EMA_PERIOD_MAX)
    setHtfEmaPeriods((current) => ({ ...current, [key]: clamped }))
  }, [])
  const toggleBarNumbers = useCallback(() => {
    setBarNumbersVisible((v) => !v)
  }, [])
  const toggleMicroGaps = useCallback(() => {
    setMicroGapsVisible((v) => !v)
  }, [])
  const toggleFvg = useCallback(() => {
    setFvgVisible((v) => !v)
  }, [])
  const toggleHtfContext = useCallback(() => {
    setHtfContextVisible((v) => !v)
  }, [])
  const setCompareSymbolSafely = useCallback((value: string | null) => {
    if (value == null) {
      setCompareSymbol(null)
      setCompareBars([])
      return
    }
    const clean = value.trim().toUpperCase()
    if (!clean || !/^[A-Z][A-Z0-9.\-]{0,9}$/.test(clean)) return
    setCompareSymbol(clean)
    setCompareBars([])
  }, [])
  const clearCompareSymbol = useCallback(() => {
    setCompareSymbolSafely(null)
  }, [setCompareSymbolSafely])

  const fetchBarsWithMemory = useCallback(async (url: string, maxAgeMs: number): Promise<BarsPayload> => {
    const cached = barsCacheRef.current.get(url)
    const now = Date.now()
    if (cached && maxAgeMs > 0 && now - cached.fetchedAt <= maxAgeMs) {
      return cached.payload
    }
    const existing = barsInflightRef.current.get(url)
    if (existing) return existing
    const promise = fetchJson<BarsPayload>(url)
      .then((payload) => {
        barsCacheRef.current.set(url, { payload, fetchedAt: Date.now() })
        return payload
      })
      .finally(() => {
        // Only clear when this is still the in-flight entry for the URL;
        // a later overlapping call may have replaced it (it cannot — we
        // return the existing Promise above — but be defensive).
        if (barsInflightRef.current.get(url) === promise) {
          barsInflightRef.current.delete(url)
        }
      })
    barsInflightRef.current.set(url, promise)
    return promise
  }, [])
  const htfContextSpec = useMemo(() => htfContextSpecFor(timeframe), [timeframe])

  useEffect(() => {
    let cancelled = false
    fetchJson<SymbolsPayload>("/api/bars/live/symbols")
      .then((payload) => {
        if (cancelled) return
        const base = payload.symbols.length > 0 ? payload.symbols : DEFAULT_SYMBOLS
        const customs = readCustomSymbols()
        // Keep the user's currently-selected symbol in the list even if
        // the live aggregator isn't subscribed to it yet. /api/bars and
        // /api/bars/live both serve any ticker, so the chart can still
        // paint; the dynamic-subscribe effect below will ask the
        // aggregator to pick it up in the background.
        const merged = Array.from(new Set([...base, ...customs, selectedSymbol]))
        setSymbols(merged)
        setLiveSubscribedSet(new Set(base))
        setDataset(payload.dataset)
        setSchema(payload.schema)
      })
      .catch(() => {
        if (cancelled) return
        const customs = readCustomSymbols()
        setSymbols(Array.from(new Set([...DEFAULT_SYMBOLS, ...customs, selectedSymbol])))
        setLiveSubscribedSet(new Set(DEFAULT_SYMBOLS))
      })
    return () => {
      cancelled = true
    }
  }, [selectedSymbol])

  // If the user lands on a symbol the live aggregator isn't watching,
  // ask it to dynamically subscribe so we escape the ~35-min Databento
  // Historical publish lag. The aggregator persists the subscription to
  // Redis so /api/bars/live/symbols will surface it on the next poll.
  // Best-effort: 503/error silently degrades to historical-only.
  useEffect(() => {
    if (!selectedSymbol) return
    if (liveSubscribedSet.has(selectedSymbol)) return
    let cancelled = false
    fetch(`/api/bars/live/subscribe?ticker=${encodeURIComponent(selectedSymbol)}`, {
      method: "POST",
    })
      .then((resp) => {
        if (cancelled || !resp.ok) return
        setLiveSubscribedSet((prev) => {
          const next = new Set(prev)
          next.add(selectedSymbol)
          return next
        })
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [liveSubscribedSet, selectedSymbol])

  useEffect(() => {
    let cancelled = false

    fetchPriorRthBars(selectedSymbol, todayEt())
      .then((bars) => {
        if (!cancelled) setPriorRthBars(bars)
      })
      .catch(() => {
        if (!cancelled) setPriorRthBars([])
      })

    return () => {
      cancelled = true
    }
  }, [selectedSymbol, refreshNonce])

  useEffect(() => {
    let cancelled = false

    async function load(silent: boolean) {
      if (!silent) setLoading(true)
      const sessionDate = todayEt()

      // Daily / weekly take a totally different path: single /api/bars
      // request over a wide calendar range, no live merge, no session
      // filter, no Brooks levels. Polling stops — these bars only
      // update once a day at most.
      if (!isIntradayTimeframe(timeframe)) {
        const lookbackDays = NON_INTRADAY_FETCH_DAYS[timeframe]
        const fromCandidates = previousEtDates(sessionDate, lookbackDays)
        const fromDate = fromCandidates[fromCandidates.length - 1] ?? sessionDate
        const qs = new URLSearchParams({
          ticker: selectedSymbol,
          from: fromDate,
          to: sessionDate,
          tf: timeframe,
          limit: "1000",
        })
        const url = `/api/bars?${qs}`
        try {
          const payload = await fetchBarsWithMemory(url, 300_000)
          if (cancelled) return
          setHistoryBars(payload.bars)
          setHistoryError(null)
        } catch (error) {
          if (cancelled) return
          setHistoryBars([])
          setHistoryError(error instanceof Error ? error.message : String(error))
        }
        setLiveBars([])
        setContextBars([])
        setLiveStatus("ok")
        setLastFetchedAt(new Date())
        setLoading(false)
        return
      }

      const fetchDays = fetchDaysForBarWindow(barWindow, timeframe)
      const historyFrom = earliestFetchDate(sessionDate, fetchDays)
      const sessionFilter: "rth" | "all" = sessionMode === "rth" ? "rth" : "all"
      const limit = rawLimitFor(timeframe, barWindow, fetchDays)
      // Today is fetched fresh on every poll; prior days are cached
      // forever in localStorage. Split the historical request into the
      // two so cached prior-day bars don't refetch on symbol/scope
      // changes.
      const yesterdayDate = previousEtDates(sessionDate, 1)[0] ?? sessionDate
      const hasPriorDays = historyFrom < sessionDate
      const todayQs = new URLSearchParams({
        ticker: selectedSymbol,
        from: sessionDate,
        to: sessionDate,
        tf: "1min",
        session: sessionFilter,
        limit: String(limit),
      })
      const contextQs = new URLSearchParams({
        ticker: selectedSymbol,
        from: sessionDate,
        to: sessionDate,
        tf: "1min",
        session: "all",
        limit: "1000",
      })
      const liveQs = new URLSearchParams({ ticker: selectedSymbol, minutes: "720" })
      const todayUrl = `/api/bars?${todayQs}`
      const contextUrl = `/api/bars?${contextQs}`
      const liveUrl = `/api/bars/live?${liveQs}`

      const contextPromise = !silent
        ? fetchBarsWithMemory(contextUrl, 120_000)
          .then((payload) => ({ status: "fulfilled" as const, payload }))
          .catch(() => ({ status: "rejected" as const }))
        : null

      if (silent) {
        // Silent polls: always re-fetch the live feed (most recent
        // partial bar) and also re-fetch today's historical at a
        // throttled cadence. The historical refresh matters for
        // symbols where the live aggregator isn't subscribed — without
        // it those charts would freeze at the initial historical fetch.
        const [liveResult, todayResult] = await Promise.allSettled([
          fetchBarsWithMemory(liveUrl, 0),
          fetchBarsWithMemory(todayUrl, 30_000),
        ])
        if (cancelled) return
        if (liveResult.status === "fulfilled") {
          setLiveBars(liveResult.value.bars)
          setLiveStatus(liveResult.value.liveStatus ?? "unknown")
          setLiveError(null)
        } else {
          setLiveError(liveResult.reason instanceof Error ? liveResult.reason.message : String(liveResult.reason))
        }
        if (todayResult.status === "fulfilled") {
          // Reuse existing historyBars' prior-day prefix; only swap
          // today's bars. Prior days don't change so re-fetching them
          // would be wasted; the silent path doesn't touch the
          // localStorage prior-day cache.
          setHistoryBars((prev) => {
            const yesterday = previousEtDates(sessionDate, 1)[0] ?? sessionDate
            const prior = prev.filter((bar) => etDateForTimestamp(bar.t) <= yesterday)
            return [...prior, ...todayResult.value.bars]
          })
        }
        setLastFetchedAt(new Date())
        return
      }

      // Stream each fetch into state independently so the skeleton
      // disappears as soon as ANY useful bars arrive — instead of
      // blocking on the slowest of the three. Today and live both
      // reveal price action; the prior-day cache fetch is only needed
      // for EMA warmup and 2D/3D scope and can fold in later.
      const yesterdayCutoff = previousEtDates(sessionDate, 1)[0] ?? sessionDate
      const revealChart = () => {
        if (cancelled) return
        setLoading(false)
        setLastFetchedAt(new Date())
      }

      const todayFetch = fetchBarsWithMemory(todayUrl, 30_000)
        .then((payload) => {
          if (cancelled) return
          // Replace just today's slice of historyBars; keep whatever
          // prior days have already streamed in (if any).
          setHistoryBars((prev) => {
            const prior = prev.filter((bar) => etDateForTimestamp(bar.t) <= yesterdayCutoff)
            return [...prior, ...payload.bars]
          })
          setHistoryError(null)
          revealChart()
        })
        .catch((reason) => {
          if (cancelled) return
          setHistoryError(reason instanceof Error ? reason.message : String(reason))
          // Live may still be useful on its own — surface the chart.
          revealChart()
        })

      const liveFetch = fetchBarsWithMemory(liveUrl, 0)
        .then((payload) => {
          if (cancelled) return
          setLiveBars(payload.bars)
          setLiveStatus(payload.liveStatus ?? "unknown")
          setLiveError(null)
          revealChart()
        })
        .catch((reason) => {
          if (cancelled) return
          setLiveBars([])
          setLiveStatus("unknown")
          setLiveError(reason instanceof Error ? reason.message : String(reason))
        })

      const priorFetch: Promise<unknown> = hasPriorDays
        ? fetchPriorDayBars({
            ticker: selectedSymbol,
            from: historyFrom,
            to: yesterdayDate,
            tf: "1min",
            session: sessionFilter,
            limit,
          })
            .then((priorBars) => {
              if (cancelled) return
              setHistoryBars((prev) => {
                // Splice the prior days in front of whatever today
                // section has already landed.
                const today = prev.filter((bar) => etDateForTimestamp(bar.t) > yesterdayCutoff)
                return [...priorBars, ...today]
              })
            })
            .catch(() => {
              // Best-effort — chart can still render with today only.
            })
        : Promise.resolve()

      await Promise.allSettled([todayFetch, liveFetch, priorFetch])
      if (cancelled) return
      // Safety net: if every fetch failed and revealChart was never
      // called, drop the skeleton anyway so the error state can show.
      setLoading(false)

      if (contextPromise) {
        const contextResult = await contextPromise
        if (cancelled) return
        if (contextResult.status === "fulfilled") {
          setContextBars(contextResult.payload.bars)
        } else {
          setContextBars([])
        }
      }
    }

    load(false)
    // Silent poll cadence — the live route blends closed bars with an
    // in-progress partial bar that the Fly aggregator updates every
    // ~500ms. Polling at 1s gives the chart's last candle a near-live
    // feel without hammering Upstash.
    //
    // Skip when (a) on daily/weekly (no intraday data to refresh) and
    // (b) when the tab is in the background — Visibility API. Resume
    // on visibilitychange. Halves Vercel/Upstash usage for the common
    // "chart left open in a tab" case.
    let interval: number | null = null
    const startPolling = () => {
      if (interval !== null) return
      if (!isIntradayTimeframe(timeframe)) return
      interval = window.setInterval(() => load(true), liveTickIntervalMs(timeframe))
    }
    const stopPolling = () => {
      if (interval !== null) {
        window.clearInterval(interval)
        interval = null
      }
    }
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        // Immediate refresh on tab focus so the chart isn't stale.
        load(true)
        startPolling()
      } else {
        stopPolling()
      }
    }
    if (typeof document !== "undefined" && document.visibilityState === "visible") {
      startPolling()
    }
    document.addEventListener("visibilitychange", onVisibility)
    return () => {
      cancelled = true
      document.removeEventListener("visibilitychange", onVisibility)
      stopPolling()
    }
  }, [barWindow, fetchBarsWithMemory, refreshNonce, selectedSymbol, sessionMode, timeframe])

  // Higher-timeframe EMA20 fetch — for each enabled HTF, request enough
  // history that EMA20 has a real warmup period. Daily / weekly aren't
  // covered by the chart's main intraday fetch, and 1h needs more than
  // the 1-3 day intraday window to settle, so each HTF fetches its own
  // bars from /api/bars at its native timeframe.
  useEffect(() => {
    let cancelled = false
    const sessionDate = todayEt()

    const fetchOne = async (spec: typeof HTF_SPECS[number]) => {
      const neededForContext = htfContextVisible && htfContextSpec?.key === spec.key
      if (!htfEmaVisibility[spec.key] && !neededForContext) return
      const fromCandidates = previousEtDates(sessionDate, spec.lookbackDays)
      const fromDate = fromCandidates[fromCandidates.length - 1] ?? sessionDate
      const qs = new URLSearchParams({
        ticker: selectedSymbol,
        from: fromDate,
        to: sessionDate,
        tf: spec.tf,
        limit: "500",
      })
      if (spec.session) qs.set("session", spec.session)
      const url = `/api/bars?${qs}`
      try {
        const payload = await fetchBarsWithMemory(url, 300_000)
        if (cancelled) return
        setHtfBars((current) => ({ ...current, [spec.key]: payload.bars }))
      } catch {
        if (cancelled) return
        setHtfBars((current) => ({ ...current, [spec.key]: [] }))
      }
    }

    for (const spec of HTF_SPECS) void fetchOne(spec)

    return () => {
      cancelled = true
    }
  }, [fetchBarsWithMemory, htfContextSpec, htfContextVisible, htfEmaVisibility, refreshNonce, selectedSymbol])

  useEffect(() => {
    const currentIndex = symbols.indexOf(selectedSymbol)
    if (currentIndex === -1 || symbols.length < 2) return
    const adjacentSymbols = Array.from(new Set([
      symbols[(currentIndex - 1 + symbols.length) % symbols.length],
      symbols[(currentIndex + 1) % symbols.length],
    ])).filter((symbol) => symbol !== selectedSymbol)

    const timer = window.setTimeout(() => {
      const sessionDate = todayEt()
      const fetchDays = fetchDaysForBarWindow(barWindow, timeframe)
      const historyFrom = earliestFetchDate(sessionDate, fetchDays)
      const yesterdayDate = previousEtDates(sessionDate, 1)[0] ?? sessionDate
      const sessionFilter: "rth" | "all" = sessionMode === "rth" ? "rth" : "all"
      const limit = rawLimitFor(timeframe, barWindow, fetchDays)
      for (const symbol of adjacentSymbols) {
        // Warm the localStorage prior-day cache + the in-memory today cache
        // so flipping to an adjacent symbol is instant.
        if (historyFrom < sessionDate) {
          void fetchPriorDayBars({
            ticker: symbol,
            from: historyFrom,
            to: yesterdayDate,
            tf: "1min",
            session: sessionFilter,
            limit,
          }).catch(() => undefined)
        }
        const todayQs = new URLSearchParams({
          ticker: symbol,
          from: sessionDate,
          to: sessionDate,
          tf: "1min",
          session: sessionFilter,
          limit: String(limit),
        })
        const liveQs = new URLSearchParams({ ticker: symbol, minutes: "720" })
        void fetchBarsWithMemory(`/api/bars?${todayQs}`, 120_000).catch(() => undefined)
        void fetchBarsWithMemory(`/api/bars/live?${liveQs}`, 15_000).catch(() => undefined)
      }
    }, 350)

    return () => {
      window.clearTimeout(timer)
    }
  }, [barWindow, fetchBarsWithMemory, selectedSymbol, sessionMode, symbols, timeframe])

  useEffect(() => {
    let cancelled = false

    async function loadQuotes() {
      const trackedSymbols = symbols.slice(0, 18)
      try {
        const qs = new URLSearchParams({ symbols: trackedSymbols.join(","), minutes: "360" })
        const payload = await fetchJson<QuotesPayload>(`/api/bars/live/quotes?${qs}`)
        const next: Record<string, Quote> = Object.fromEntries(payload.quotes.map((quote) => [quote.symbol, quote]))
        if (!cancelled) setQuotes(next)
      } catch {
        const next: Record<string, Quote> = Object.fromEntries(
          trackedSymbols.map((symbol) => [symbol, { symbol, last: null, changePct: null, volume: 0, stale: true }]),
        )
        if (!cancelled) setQuotes(next)
      }
    }

    loadQuotes()
    const interval = window.setInterval(loadQuotes, 20_000)
    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [symbols])

  // Comparison overlay fetch. Pulls the same range / timeframe as the
  // primary series but for a second ticker, and keeps it refreshing on
  // the same cadence so the two lines tick together. No live merge —
  // the comparison is contextual, not the trading focus.
  useEffect(() => {
    if (!compareSymbol) return
    let cancelled = false
    async function load() {
      const sessionDate = todayEt()
      const intradayNow = isIntradayTimeframe(timeframe)
      const fromDate = intradayNow
        ? earliestFetchDate(sessionDate, fetchDaysForBarWindow(barWindow, timeframe))
        : (() => {
            const lookback = NON_INTRADAY_FETCH_DAYS[timeframe as "daily" | "weekly"]
            const candidates = previousEtDates(sessionDate, lookback)
            return candidates[candidates.length - 1] ?? sessionDate
          })()
      const qs = new URLSearchParams({
        ticker: compareSymbol as string,
        from: fromDate,
        to: sessionDate,
        tf: intradayNow ? "1min" : timeframe,
        session: intradayNow ? (sessionMode === "rth" ? "rth" : "all") : "all",
        limit: String(intradayNow ? rawLimitFor(timeframe, barWindow, fetchDaysForBarWindow(barWindow, timeframe)) : 1000),
      })
      try {
        const payload = await fetchBarsWithMemory(`/api/bars?${qs}`, 30_000)
        if (!cancelled) setCompareBars(payload.bars)
      } catch {
        if (!cancelled) setCompareBars([])
      }
    }
    load()
    const interval = window.setInterval(load, 60_000)
    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [barWindow, compareSymbol, fetchBarsWithMemory, sessionMode, timeframe])

  const combinedBars = useMemo(() => mergeBars(historyBars, liveBars), [historyBars, liveBars])
  const visibleBaseBars = useMemo(() => {
    const rthBars = sessionMode === "rth" ? combinedBars.filter(isRthBar) : combinedBars
    const sessionBars = rthBars.length > 0 ? rthBars : combinedBars
    return sessionBars
  }, [combinedBars, sessionMode])

  // Aggregate every fetched bar at the current timeframe, then split into
  // the visible window (rendered on the chart) and the seed (used to warm
  // up the EMA so it doesn't restart at bar #1). The visible window is
  // the most recent `barWindow` *trading days* — e.g. barWindow=2 keeps
  // every bar whose ET date is in the last 2 unique dates present in
  // the aggregated series. Everything older becomes EMA seed.
  // For intraday timeframes we aggregate the fetched 1m bars to the
  // selected bucket then split into the visible window (rendered on
  // the chart) and the seed (used to warm up the EMA). Non-intraday
  // timeframes skip aggregation entirely — /api/bars returns bars
  // already at the daily/weekly cadence — and just slice off the last
  // ~60 bars with no EMA seed (the fetched range gives the indicator
  // plenty of natural warmup).
  const intraday = isIntradayTimeframe(timeframe)
  const aggregatedBars = useMemo(() => {
    if (!intraday) return historyBars
    const minutes = TIMEFRAMES.find((item) => item.value === timeframe)?.minutes ?? 1
    return aggregateBars(visibleBaseBars, minutes)
  }, [historyBars, intraday, timeframe, visibleBaseBars])
  const displayDateSet = useMemo(() => {
    if (!intraday || aggregatedBars.length === 0) return new Set<string>()
    const dates = new Set<string>()
    for (let i = aggregatedBars.length - 1; i >= 0; i--) {
      dates.add(etDateForTimestamp(aggregatedBars[i].t))
      if (dates.size >= barWindow) break
    }
    return dates
  }, [aggregatedBars, barWindow, intraday])
  const displayBars = useMemo(() => {
    if (!intraday) return aggregatedBars.slice(-NON_INTRADAY_DISPLAY_BARS)
    return aggregatedBars.filter((bar) => displayDateSet.has(etDateForTimestamp(bar.t)))
  }, [aggregatedBars, displayDateSet, intraday])
  const seedBars = useMemo(() => {
    if (!intraday) return [] as Bar[]
    return aggregatedBars.filter((bar) => !displayDateSet.has(etDateForTimestamp(bar.t)))
  }, [aggregatedBars, displayDateSet, intraday])

  // Match the comparison ticker's bars to the primary chart's timeframe
  // and visible date range so the two lines move bar-for-bar. We filter
  // by RTH / displayDateSet using the SAME set as the primary so a
  // comparison bar that doesn't exist (holiday, after-hours gap) drops
  // out instead of pushing the line out of sync.
  const displayCompareBars = useMemo(() => {
    if (!compareSymbol || compareBars.length === 0) return [] as Bar[]
    if (!intraday) return compareBars.slice(-NON_INTRADAY_DISPLAY_BARS)
    const rthFiltered = sessionMode === "rth" ? compareBars.filter(isRthBar) : compareBars
    const minutes = TIMEFRAMES.find((item) => item.value === timeframe)?.minutes ?? 1
    const aggregated = aggregateBars(rthFiltered, minutes)
    return aggregated.filter((bar) => displayDateSet.has(etDateForTimestamp(bar.t)))
  }, [compareBars, compareSymbol, displayDateSet, intraday, sessionMode, timeframe])

  // Replay mode slices displayBars down to the replay endpoint so the
  // chart renders as if "live" stopped at that bar. EMA seed stays on
  // the full seedBars so the indicator is correctly warmed up; only
  // the visible range freezes.
  const effectiveReplayIndex = useMemo(() => {
    if (replayIndex == null || displayBars.length === 0) return null
    return Math.max(0, Math.min(displayBars.length - 1, replayIndex))
  }, [displayBars.length, replayIndex])

  const renderBars = useMemo(() => {
    if (effectiveReplayIndex == null) return displayBars
    return displayBars.slice(0, effectiveReplayIndex + 1)
  }, [displayBars, effectiveReplayIndex])
  // Default: as many HTF context candles as trading days in the bar
  // window (1D shows 1, 2D shows 2, 3D shows 3). `htfContextCount` is a
  // manual override from the indicator settings; null means "follow the
  // bar window". Both paths clamp to the visual cap so the candles
  // don't overlap the price scale.
  const effectiveHtfContextCount = useMemo(
    () => clampInt(htfContextCount ?? barWindow, HTF_CONTEXT_COUNT_MIN, HTF_CONTEXT_COUNT_MAX),
    [htfContextCount, barWindow],
  )
  const htfContextCandles = useMemo(
    () => (htfContextSpec ? htfBars[htfContextSpec.key].slice(-effectiveHtfContextCount) : []),
    [htfBars, htfContextSpec, effectiveHtfContextCount],
  )
  const htfContextLabel = htfContextSpec?.key === "daily"
    ? "D"
    : htfContextSpec?.key === "weekly"
      ? "W"
      : ""
  const activeSessionDate = useMemo(() => {
    const latest = displayBars.at(-1) ?? combinedBars.at(-1)
    return latest ? etDateForTimestamp(latest.t) : todayEt()
  }, [combinedBars, displayBars])
  const combinedContextBars = useMemo(() => {
    const merged = mergeBars(contextBars, liveBars).filter((bar) => etDateForTimestamp(bar.t) === activeSessionDate)
    return merged.length > 0 ? merged : combinedBars.filter((bar) => etDateForTimestamp(bar.t) === activeSessionDate)
  }, [activeSessionDate, combinedBars, contextBars, liveBars])

  // Brooks intraday levels (HOD/LOD/HOY/LOY/etc.) don't apply on
  // daily/weekly charts — drop the level set so the chart doesn't try
  // to draw them across multi-month windows.
  const brooksLevels = useMemo(
    () => (intraday ? buildBrooksLevels(combinedContextBars, priorRthBars) : []),
    [combinedContextBars, intraday, priorRthBars],
  )
  const visibleBrooksLevels = useMemo(
    () => brooksLevels.filter((level) => levelVisibility[level.group]),
    [brooksLevels, levelVisibility],
  )
  const latestLive = liveBars.at(-1)
  const liveAgeSeconds = latestLive && lastFetchedAt ? Math.max(0, lastFetchedAt.getTime() / 1000 - latestLive.t) : null
  const liveFresh = liveAgeSeconds != null && liveAgeSeconds < 15 * 60
  const blockingError = displayBars.length === 0 ? historyError ?? liveError : null

  const selectSymbol = useCallback((symbol: string) => {
    const clean = symbol.trim().toUpperCase()
    if (!clean || clean === selectedSymbol) {
      setSymbolDraft(clean || selectedSymbol)
      return
    }
    // Save the OLD symbol's prefs before switching so its layout is
    // restored on return. Then load the NEW symbol's prefs (falling
    // back to global defaults if it's never been viewed) and apply.
    writeSymbolPrefs(selectedSymbol, {
      timeframe,
      barWindow,
      sessionMode,
      levelVisibility,
      volumeVisible,
      emaVisible,
      vwapVisible,
      htfEmaVisibility,
      barNumbersVisible,
      microGapsVisible,
      fvgVisible,
      htfContextVisible,
      htfContextCount,
      microGapsMaxActive,
      fvgMaxActive,
      emaPeriod,
      htfEmaPeriods,
    })
    setTimeframe(symbolTimeframe(clean))
    setBarWindow(symbolBarWindow(clean))
    setSessionMode(symbolSessionMode(clean))
    setLevelVisibility(symbolLevelVisibility(clean))
    setVolumeVisible(symbolVolumeVisible(clean))
    setEmaVisible(symbolEmaVisible(clean))
    setVwapVisible(symbolVwapVisible(clean))
    setHtfEmaVisibility(symbolHtfEmaVisibility(clean))
    setHtfBars(emptyHtfBars())
    setBarNumbersVisible(symbolBarNumbersVisible(clean))
    setMicroGapsVisible(symbolMicroGapsVisible(clean))
    setFvgVisible(symbolFvgVisible(clean))
    setHtfContextVisible(symbolHtfContextVisible(clean))
    setHtfContextCount(symbolHtfContextCount(clean))
    setMicroGapsMaxActive(symbolMicroGapsMaxActive(clean))
    setFvgMaxActive(symbolFvgMaxActive(clean))
    setEmaPeriod(symbolEmaPeriod(clean))
    setHtfEmaPeriods(symbolHtfEmaPeriods(clean))
    setDrawnLines(readDrawnLines(clean))
    setReplayIndex(null)
    setPriorRthBars([])
    setContextBars([])
    // Optimistic clear: drop the old symbol's bars immediately so the chart
    // doesn't sit with stale data + new header while the new fetch is in
    // flight (up to ~15s p95 for cold Databento tickers). The skeleton/empty
    // state shows until the next load() pushes new bars.
    setHistoryBars([])
    setLiveBars([])
    setSelectedSymbol(clean)
    setSymbolDraft(clean)
  }, [selectedSymbol, timeframe, barWindow, sessionMode, levelVisibility, volumeVisible, emaVisible, vwapVisible, htfEmaVisibility, barNumbersVisible, microGapsVisible, fvgVisible, htfContextVisible, htfContextCount, microGapsMaxActive, fvgMaxActive, emaPeriod, htfEmaPeriods])

  // Fired on pointer-enter / hover over a watchlist row. Warms the bars
  // memo cache so that when the user actually clicks, the historical fetch
  // is already a memo hit. fetchBarsWithMemory dedupes by URL, so firing
  // this repeatedly while the cursor drifts is cheap. Mirrors the URL
  // pattern of the main load effect — keep them in sync if either changes.
  const prefetchSymbol = useCallback((sym: string) => {
    const clean = sym.trim().toUpperCase()
    if (!clean || clean === selectedSymbol) return
    const sessionDate = todayEt()
    if (!isIntradayTimeframe(timeframe)) {
      const lookbackDays = NON_INTRADAY_FETCH_DAYS[timeframe]
      const fromCandidates = previousEtDates(sessionDate, lookbackDays)
      const fromDate = fromCandidates[fromCandidates.length - 1] ?? sessionDate
      const qs = new URLSearchParams({
        ticker: clean,
        from: fromDate,
        to: sessionDate,
        tf: timeframe,
        limit: "1000",
      })
      void fetchBarsWithMemory(`/api/bars?${qs}`, 300_000).catch(() => undefined)
      return
    }
    const fetchDays = fetchDaysForBarWindow(barWindow, timeframe)
    const sessionFilter: "rth" | "all" = sessionMode === "rth" ? "rth" : "all"
    const limit = rawLimitFor(timeframe, barWindow, fetchDays)
    const todayQs = new URLSearchParams({
      ticker: clean,
      from: sessionDate,
      to: sessionDate,
      tf: "1min",
      session: sessionFilter,
      limit: String(limit),
    })
    const liveQs = new URLSearchParams({ ticker: clean, minutes: "720" })
    void fetchBarsWithMemory(`/api/bars?${todayQs}`, 120_000).catch(() => undefined)
    void fetchBarsWithMemory(`/api/bars/live?${liveQs}`, 15_000).catch(() => undefined)
  }, [barWindow, fetchBarsWithMemory, selectedSymbol, sessionMode, timeframe])

  const toggleLevelGroup = useCallback((group: LevelGroup) => {
    setLevelVisibility((current) => ({ ...current, [group]: !current[group] }))
  }, [])

  const submitSymbol = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    selectSymbol(symbolDraft)
  }

  // Pre-warm the live subscribe as the user types a new symbol. Fires a
  // debounced POST so by the time they hit Enter, the Fly aggregator is
  // already (hopefully) subscribed and the first live bar shows up
  // sooner. The route memoizes positive results 10 minutes, so this is
  // idempotent — repeat keystrokes don't double-hit the upstream.
  useEffect(() => {
    const clean = symbolDraft.trim().toUpperCase()
    if (!clean || clean === selectedSymbol) return
    if (!/^[A-Z][A-Z0-9.\-]{0,9}$/.test(clean)) return
    if (liveSubscribedSet.has(clean)) return
    const timer = window.setTimeout(() => {
      fetch(`/api/bars/live/subscribe?ticker=${encodeURIComponent(clean)}`, {
        method: "POST",
      }).catch(() => {})
    }, 500)
    return () => window.clearTimeout(timer)
  }, [symbolDraft, selectedSymbol, liveSubscribedSet])

  // Keyboard shortcuts. Skip when focus is inside a text input / select
  // so typing into the symbol search doesn't toggle indicators. R is
  // handled by the chart itself (double-click on canvas) and we don't
  // need a global binding for it.
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target) {
        const tag = target.tagName
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable) {
          return
        }
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return

      const tfKeys: Record<string, ChartViewTimeframe> = {
        "1": "1min",
        "2": "5min",
        "3": "15min",
        "4": "1h",
        "5": "daily",
        "6": "weekly",
      }
      if (event.key in tfKeys) {
        setTimeframe(tfKeys[event.key])
        event.preventDefault()
        return
      }

      if (event.key === "j" || event.key === "k") {
        const direction = event.key === "k" ? 1 : -1
        const idx = symbols.indexOf(selectedSymbol)
        if (idx === -1 || symbols.length < 2) return
        const next = symbols[(idx + direction + symbols.length) % symbols.length]
        selectSymbol(next)
        event.preventDefault()
        return
      }

      if (event.key === "[" || event.key === "]") {
        if (!isIntradayTimeframe(timeframe)) return
        const choices = BAR_WINDOW_CHOICES.map((c) => c.value)
        const idx = choices.indexOf(barWindow)
        if (idx === -1) return
        const direction = event.key === "]" ? 1 : -1
        const nextIdx = Math.max(0, Math.min(choices.length - 1, idx + direction))
        setBarWindow(choices[nextIdx])
        event.preventDefault()
        return
      }

      // Replay mode: L enters/exits; ←/→ step backward/forward when
      // active. Step keys are no-ops outside replay mode so they don't
      // intercept user agent shortcuts.
      if (event.key === "l" || event.key === "L") {
        if (displayBars.length === 0) return
        setReplayIndex((current) => (current == null ? Math.max(0, displayBars.length - 1) : null))
        event.preventDefault()
        return
      }
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        setReplayIndex((current) => {
          if (current == null || displayBars.length === 0) return current
          const direction = event.key === "ArrowRight" ? 1 : -1
          return Math.max(0, Math.min(displayBars.length - 1, current + direction))
        })
        event.preventDefault()
        return
      }

      if (event.key === "v") {
        setVolumeVisible((v) => !v)
        event.preventDefault()
      } else if (event.key === "e") {
        setEmaVisible((v) => !v)
        event.preventDefault()
      } else if (event.key === "w") {
        setVwapVisible((v) => !v)
        event.preventDefault()
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [selectedSymbol, symbols, timeframe, barWindow, selectSymbol, displayBars.length])

  return (
    <div className="mx-auto flex h-[calc(100dvh-var(--nav-h))] max-w-[1600px] flex-col overflow-hidden bg-bg px-2 py-1 text-text sm:px-3 sm:py-3">
      <header className="mb-1 flex flex-wrap items-center gap-2 sm:mb-2 sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <form onSubmit={submitSymbol} className="flex min-h-7 items-center gap-2 rounded-md border border-border/60 bg-surface px-2 py-0.5">
            <label htmlFor="chart-symbol" className="hidden text-[10px] font-semibold uppercase tracking-[0.14em] text-sub sm:block">
              Symbol
            </label>
            <input
              id="chart-symbol"
              type="text"
              value={symbolDraft}
              onChange={(event) => setSymbolDraft(event.target.value.toUpperCase())}
              className="w-16 rounded-md bg-transparent font-mono text-base font-semibold uppercase text-text outline-none focus-visible:ring-2 focus-visible:ring-teal/70 sm:w-20 sm:text-sm"
              spellCheck={false}
              autoCapitalize="characters"
              autoCorrect="off"
            />
          </form>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-expanded={mobileWatchlistOpen}
            aria-controls="mobile-watchlist"
            onClick={() => setMobileWatchlistOpen(true)}
            className="inline-flex min-h-7 items-center rounded-md border border-border/60 bg-surface px-2 py-0.5 text-[11px] font-semibold text-sub outline-none hover:border-border-hover hover:text-text focus-visible:ring-2 focus-visible:ring-teal/70 focus-visible:ring-offset-2 focus-visible:ring-offset-bg xl:hidden"
          >
            List
          </button>
          <button
            type="button"
            aria-pressed={watchlistVisible}
            onClick={() => setWatchlistVisible((visible) => !visible)}
            className="hidden min-h-7 items-center rounded-md border border-border/60 bg-surface px-2 py-0.5 text-[11px] font-semibold text-sub outline-none hover:border-border-hover hover:text-text focus-visible:ring-2 focus-visible:ring-teal/70 focus-visible:ring-offset-2 focus-visible:ring-offset-bg xl:inline-flex"
          >
            {watchlistVisible ? "Hide list" : "Show list"}
          </button>
          <IndicatorsMenu
            intraday={isIntradayTimeframe(timeframe)}
            timeframe={timeframe}
            availableHtfs={availableHtfsFor(timeframe)}
            volumeVisible={volumeVisible}
            sessionRangeStripVisible={sessionRangeStripVisible}
            emaVisible={emaVisible}
            emaPeriod={emaPeriod}
            htfEmaPeriods={htfEmaPeriods}
            htfEmaVisibility={htfEmaVisibility}
            vwapVisible={vwapVisible}
            barNumbersVisible={barNumbersVisible}
            microGapsVisible={microGapsVisible}
            microGapsMaxActive={microGapsMaxActive}
            fvgVisible={fvgVisible}
            fvgMaxActive={fvgMaxActive}
            htfContextVisible={htfContextVisible}
            htfContextLabel={htfContextLabel}
            htfContextCount={htfContextCount}
            barWindow={barWindow}
            levelVisibility={levelVisibility}
            drawnLinesCount={drawnLines.length}
            compareSymbol={compareSymbol}
            replayActive={effectiveReplayIndex != null}
            onToggleVolume={toggleVolume}
            onToggleSessionRangeStrip={() => setSessionRangeStripVisible((v) => !v)}
            onToggleEma={toggleEma}
            onToggleHtfEma={toggleHtfEma}
            onToggleVwap={toggleVwap}
            onToggleBarNumbers={toggleBarNumbers}
            onToggleMicroGaps={toggleMicroGaps}
            onToggleFvg={toggleFvg}
            onToggleHtfContext={toggleHtfContext}
            onToggleLevel={toggleLevelGroup}
            onSetEmaPeriod={setEmaPeriod}
            onSetHtfEmaPeriod={setHtfEmaPeriod}
            onSetHtfContextCount={setHtfContextCount}
            onSetMicroGapsMaxActive={setMicroGapsMaxActive}
            onSetFvgMaxActive={setFvgMaxActive}
            onClearDrawnLines={clearDrawnLines}
            onClearCompare={clearCompareSymbol}
            onExitReplay={() => setReplayIndex(null)}
          />
          <SettingsMenu
            displayTimezone={displayTimezone}
            onSelectTimezone={setDisplayTimezone}
            compareSymbol={compareSymbol}
            onSetCompare={setCompareSymbolSafely}
            onClearCompare={clearCompareSymbol}
            onRefresh={() => setRefreshNonce((value) => value + 1)}
          />
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col xl:flex-row">
        <main className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="hidden flex-wrap items-center justify-between gap-2 border-b border-border bg-bg px-3 py-2 sm:flex">
            <div className="flex min-w-0 items-center gap-3">
              <h1 className="truncate text-base font-bold tracking-tight">{selectedSymbol}</h1>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-sub">
              <span>{dataset ?? "Databento"}</span>
              <span>{schema ?? "live"}</span>
              {latestLive && <span>last {formatBarTime(latestLive.t, displayTimezone)}</span>}
              {lastFetchedAt && <span>polled {lastFetchedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>}
            </div>
          </div>

          {loading ? (
            <div className="flex min-h-0 flex-1 items-center justify-center bg-bg">
              <div className="skeleton h-[420px] w-[92%] rounded-md" />
            </div>
          ) : blockingError ? (
            <div className="flex min-h-0 flex-1 items-center justify-center bg-bg px-6 text-center">
              <div>
                <div className="mb-2 text-sm font-semibold text-red">Chart unavailable</div>
                <div className="max-w-xl text-xs leading-5 text-sub">{blockingError}</div>
              </div>
            </div>
          ) : (
            <ChartSurface
              symbol={selectedSymbol}
              bars={renderBars}
              seedBars={seedBars}
              levels={visibleBrooksLevels}
              timeframe={timeframe}
              barWindow={barWindow}
              sessionMode={sessionMode}
              symbols={symbols}
              levelVisibility={levelVisibility}
              liveFresh={liveFresh}
              liveStatus={liveStatus}
              liveSubscribed={liveSubscribedSet.has(selectedSymbol)}
              volumeVisible={volumeVisible}
              sessionRangeStripVisible={sessionRangeStripVisible}
              emaVisible={emaVisible}
              emaPeriod={emaPeriod}
              htfEmaPeriods={htfEmaPeriods}
              vwapVisible={vwapVisible}
              htfEmaVisibility={htfEmaVisibility}
              htfBars={htfBars}
              barNumbersVisible={barNumbersVisible}
              microGapsVisible={microGapsVisible}
              microGapsMaxActive={microGapsMaxActive}
              fvgVisible={fvgVisible}
              fvgMaxActive={fvgMaxActive}
              htfContextVisible={htfContextVisible}
              htfContextBars={htfContextCandles}
              htfContextLabel={htfContextLabel}
              drawnLines={drawnLines}
              replayActive={effectiveReplayIndex != null}
              onExitReplay={() => setReplayIndex(null)}
              displayTimezone={displayTimezone}
              compareSymbol={compareSymbol}
              compareBars={displayCompareBars}
              onClearCompare={clearCompareSymbol}
              onSelectSymbol={selectSymbol}
              onPrefetchSymbol={prefetchSymbol}
              onAddSymbol={addSymbol}
              onSelectTimeframe={setTimeframe}
              onSelectBarWindow={setBarWindow}
              onSelectSessionMode={setSessionMode}
              onToggleLevel={toggleLevelGroup}
              onToggleVolume={toggleVolume}
              onToggleSessionRangeStrip={() => setSessionRangeStripVisible((v) => !v)}
              onToggleEma={toggleEma}
              onToggleVwap={toggleVwap}
              onToggleHtfEma={toggleHtfEma}
              onToggleBarNumbers={toggleBarNumbers}
              onToggleMicroGaps={toggleMicroGaps}
              onToggleFvg={toggleFvg}
              onToggleHtfContext={toggleHtfContext}
              onAddDrawnLine={addDrawnLine}
              onClearDrawnLines={clearDrawnLines}
            />
          )}
        </main>

        {watchlistVisible && (
          <div className="hidden xl:block">
            <SidePanel
              symbol={selectedSymbol}
              bars={displayBars}
              quotes={quotes}
              symbols={symbols}
              selectedSymbol={selectedSymbol}
              onSelectSymbol={selectSymbol}
              onPrefetchSymbol={prefetchSymbol}
            />
          </div>
        )}
      </div>

      {mobileWatchlistOpen && (
        <div id="mobile-watchlist" className="fixed inset-0 z-40 flex flex-col justify-end xl:hidden" role="dialog" aria-modal="true" aria-label="Watchlist">
          <button
            type="button"
            aria-label="Close watchlist"
            onClick={() => setMobileWatchlistOpen(false)}
            className="absolute inset-0 bg-black/55"
          />
          <div className="relative max-h-[78dvh] overflow-hidden rounded-t-2xl border-t border-border bg-bg pb-[env(safe-area-inset-bottom,0px)] shadow-[0_-12px_36px_rgba(0,0,0,0.45)]">
            <div aria-hidden="true" className="mx-auto mt-2 h-1 w-9 rounded-full bg-border" />
            <div className="flex items-center justify-between border-b border-border px-3 pt-2 pb-2">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-sub">Watchlist</span>
              <button
                type="button"
                onClick={() => setMobileWatchlistOpen(false)}
                className="-mr-2 flex h-11 min-w-11 items-center justify-center rounded-md px-3 text-sm font-semibold text-sub outline-none hover:text-text focus-visible:ring-2 focus-visible:ring-teal/70"
              >
                Done
              </button>
            </div>
            <div className="max-h-[calc(78dvh-3rem)] overflow-y-auto">
              <SidePanel
                symbol={selectedSymbol}
                bars={displayBars}
                quotes={quotes}
                symbols={symbols}
                selectedSymbol={selectedSymbol}
                onSelectSymbol={(symbol) => {
                  selectSymbol(symbol)
                  setMobileWatchlistOpen(false)
                }}
                onPrefetchSymbol={prefetchSymbol}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
