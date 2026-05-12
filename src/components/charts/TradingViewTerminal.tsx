"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { FormEvent, TouchEvent } from "react"
import {
  CandlestickSeries,
  ColorType,
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
type SessionMode = "rth" | "all"

interface BarsPayload {
  bars: Bar[]
  ticker: string
  source: string
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

const TIMEFRAMES: Array<{ value: IntradayTimeframe; label: string; minutes: number }> = [
  { value: "1min", label: "1m", minutes: 1 },
  { value: "5min", label: "5m", minutes: 5 },
  { value: "15min", label: "15m", minutes: 15 },
  { value: "30min", label: "30m", minutes: 30 },
  { value: "1h", label: "1H", minutes: 60 },
]

const DEFAULT_BAR_WINDOW = 78

const CHART_PREFS_KEY = "aiedge.chart.preferences.v1"

const DEFAULT_LEVEL_VISIBILITY: LevelVisibility = {
  current: true,
  prior: true,
  globex: true,
  opening: true,
}

const LEVEL_GROUPS: Array<{ key: LevelGroup; label: string }> = [
  { key: "current", label: "DAY" },
  { key: "prior", label: "YDAY" },
  { key: "globex", label: "GX" },
  { key: "opening", label: "18" },
]

const BAR_WINDOW_CHOICES = [
  { value: 78, label: "78B" },
  { value: 156, label: "156B" },
  { value: 390, label: "All" },
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

function rawLimitFor(timeframe: IntradayTimeframe, barWindow: number): number {
  const minutes = TIMEFRAMES.find((item) => item.value === timeframe)?.minutes ?? 1
  return Math.min(Math.max(barWindow * minutes, DEFAULT_BAR_WINDOW), 1000)
}

function emaLineData(bars: Bar[], period = 9) {
  if (bars.length === 0) return []
  const alpha = 2 / (period + 1)
  let ema = bars[0].c
  return bars.map((bar, index) => {
    ema = index === 0 ? bar.c : bar.c * alpha + ema * (1 - alpha)
    return { time: bar.t as UTCTimestamp, value: ema }
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

function storedSymbol(): string {
  const value = readChartPrefs().symbol
  return typeof value === "string" && value.trim() ? value.trim().toUpperCase() : "SPY"
}

function storedTimeframe(): IntradayTimeframe {
  const value = readChartPrefs().timeframe
  return TIMEFRAMES.some((item) => item.value === value) ? value as IntradayTimeframe : "5min"
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
}: {
  value: T
  options: Array<{ value: T; label: string }>
  onChange: (next: T) => void
}) {
  return (
    <div className="flex min-h-11 rounded border border-border bg-surface p-0.5 sm:min-h-0">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={`min-w-11 rounded px-2.5 py-1 text-[11px] font-semibold tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-teal/70 focus-visible:ring-offset-2 focus-visible:ring-offset-bg sm:min-w-0 ${
            value === option.value ? "bg-teal text-bg" : "text-sub hover:text-text"
          }`}
        >
          {option.label}
        </button>
      ))}
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
    <div className="flex min-h-11 rounded border border-border bg-surface p-0.5 sm:min-h-0" aria-label="Brooks level visibility" data-testid="chart-level-controls">
      {LEVEL_GROUPS.map((group) => {
        const active = visibility[group.key]
        return (
          <button
            key={group.key}
            type="button"
            aria-label={`Toggle ${group.label} Brooks levels`}
            aria-pressed={active}
            onClick={() => onToggle(group.key)}
            className={`min-w-11 rounded px-2.5 py-1 text-[11px] font-semibold tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-teal/70 focus-visible:ring-offset-2 focus-visible:ring-offset-bg sm:min-w-0 ${
              active ? "bg-surface-hover text-text" : "text-sub/45 hover:text-sub"
            }`}
          >
            {group.label}
          </button>
        )
      })}
    </div>
  )
}

function timeframeUnitLabel(timeframe: IntradayTimeframe): string {
  return TIMEFRAMES.find((item) => item.value === timeframe)?.label ?? timeframe
}

function SymbolScroller({
  symbol,
  symbols,
  onSelect,
}: {
  symbol: string
  symbols: string[]
  onSelect: (symbol: string) => void
}) {
  const [open, setOpen] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)
  const wheelLockedUntilRef = useRef(0)
  const touchYRef = useRef<number | null>(null)
  const currentIndex = Math.max(symbols.indexOf(symbol), 0)

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
    <div className="absolute bottom-[calc(0.875rem+env(safe-area-inset-bottom,0px))] right-3 z-20 font-mono sm:bottom-[calc(1rem+env(safe-area-inset-bottom,0px))] sm:right-4">
      {open && (
        <div
          ref={listRef}
          role="listbox"
          aria-label="Watchlist symbols"
          className="absolute bottom-[3.5rem] right-0 max-h-[230px] w-28 snap-y snap-mandatory overflow-y-auto rounded-lg border border-border bg-black/[0.86] py-2 shadow-[0_18px_48px_rgba(0,0,0,0.42)] backdrop-blur-md scrollbar-none sm:bottom-[3.75rem] sm:max-h-[260px] sm:w-36"
        >
          {symbols.map((item) => {
            const active = item === symbol
            return (
              <button
                key={item}
                type="button"
                role="option"
                aria-selected={active}
                data-symbol={item}
                onClick={() => {
                  onSelect(item)
                  setOpen(false)
                }}
                className={`block h-11 w-full snap-center px-4 text-center transition-none outline-none focus-visible:bg-surface-hover focus-visible:text-text ${
                  active ? "text-xl font-semibold tracking-[0.08em] text-text" : "text-sm font-medium tracking-[0.04em] text-sub/60"
                }`}
              >
                {item}
              </button>
            )
          })}
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
        className="flex min-h-11 min-w-[76px] flex-col items-center justify-center rounded border border-border/80 bg-black/[0.74] px-2.5 py-1 text-center shadow-[0_8px_22px_rgba(0,0,0,0.32)] outline-none backdrop-blur-sm focus-visible:ring-2 focus-visible:ring-teal/70 focus-visible:ring-offset-2 focus-visible:ring-offset-bg sm:min-w-[86px] sm:bg-black/[0.82] sm:px-3"
      >
        <span className="text-[8px] uppercase tracking-[0.14em] text-sub sm:text-[9px] sm:tracking-[0.16em]">symbol</span>
        <span className="text-[13px] font-semibold tracking-[0.1em] text-text sm:text-sm">{symbol}</span>
      </button>
    </div>
  )
}

function ChartSurface({
  symbol,
  bars,
  levels,
  timeframe,
  barWindow,
  sessionMode,
  symbols,
  onSelectSymbol,
  onResetBarWindow,
}: {
  symbol: string
  bars: Bar[]
  levels: BrooksLevel[]
  timeframe: IntradayTimeframe
  barWindow: number
  sessionMode: SessionMode
  symbols: string[]
  onSelectSymbol: (symbol: string) => void
  onResetBarWindow: () => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const candlesRef = useRef<ISeriesApi<"Candlestick"> | null>(null)
  const averageRef = useRef<ISeriesApi<"Line"> | null>(null)
  const priceLinesRef = useRef<IPriceLine[]>([])
  const scheduleLabelsRef = useRef<() => void>(() => {})
  const rangeSignatureRef = useRef("")
  const barsRef = useRef(bars)
  const barWindowRef = useRef(barWindow)
  const emaByTimeRef = useRef<Map<number, number>>(new Map())
  const lastTapAtRef = useRef(0)
  const tapStartRef = useRef<{ x: number; y: number; moved: boolean } | null>(null)
  const priceScaleDragRef = useRef<{ startY: number; from: number; to: number } | null>(null)
  const [barNumberLabels, setBarNumberLabels] = useState<BarNumberLabel[]>([])
  const [crosshairReadout, setCrosshairReadout] = useState<CrosshairReadout | null>(null)
  const [viewState, setViewState] = useState({ visibleBars: barWindow, offDefault: false })
  const title = `${barWindow}x${timeframeUnitLabel(timeframe)}`
  const sessionLabel = sessionMode === "rth" ? "9:30" : "EXT"
  const metrics = useMemo(() => metricsFor(bars), [bars])
  const latest = metrics.latest
  const sessionRange = metrics.high != null && metrics.low != null ? metrics.high - metrics.low : 0

  useEffect(() => {
    barsRef.current = bars
    emaByTimeRef.current = new Map(emaLineData(bars, 9).map((point) => [Number(point.time), point.value]))
  }, [bars])

  useEffect(() => {
    barWindowRef.current = barWindow
  }, [barWindow])

  const fitChartToBarWindow = useCallback((targetWindow: number) => {
    const chart = chartRef.current
    const container = containerRef.current
    if (!chart || !container) return
    chart.priceScale("right").applyOptions({ autoScale: true })
    const currentBars = barsRef.current
    const usableWidth = Math.max(240, container.clientWidth - 58)
    const barSpacing = Math.min(14, Math.max(2.4, usableWidth / (targetWindow + 12)))
    chart.applyOptions({ timeScale: { barSpacing, rightOffset: 2 } })
    chart.timeScale().applyOptions({ barSpacing, rightOffset: 2 })
    const first = currentBars[0]
    const last = currentBars.at(-1)
    if (!first || !last) {
      chart.timeScale().fitContent()
      return
    }
    const stepSeconds = currentBars[1] ? Math.max(60, currentBars[1].t - first.t) : 60
    chart.timeScale().setVisibleRange({
      from: (first.t - stepSeconds * 3) as UTCTimestamp,
      to: (last.t + stepSeconds * 3) as UTCTimestamp,
    })
    chart.timeScale().scrollToPosition(2, false)
  }, [])

  const resetViewTo78 = useCallback(() => {
    onResetBarWindow()
    fitChartToBarWindow(DEFAULT_BAR_WINDOW)
    scheduleLabelsRef.current()
    setViewState({ visibleBars: DEFAULT_BAR_WINDOW, offDefault: false })
  }, [fitChartToBarWindow, onResetBarWindow])

  const showReadoutForBar = useCallback((bar: Bar, index: number, x: number, y: number) => {
    const container = containerRef.current
    if (!container) return
    const ema = emaByTimeRef.current.get(bar.t)
    const containerWidth = container.clientWidth || 360
    const containerHeight = container.clientHeight || 560
    setCrosshairReadout({
      x: Math.min(Math.max(x + 12, 8), Math.max(8, containerWidth - 180)),
      y: Math.min(Math.max(y - 54, 84), Math.max(84, containerHeight - 92)),
      lines: [
        `#${index + 1}  ${formatEt(bar.t)}`,
        `O ${formatPrice(bar.o)}  H ${formatPrice(bar.h)}`,
        `L ${formatPrice(bar.l)}  C ${formatPrice(bar.c)}`,
        `EMA9 ${formatPrice(ema)}`,
      ],
    })
  }, [])

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
  }, [])

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
    showReadoutForBar(bar, index, x, y)
  }, [showReadoutForBar])

  const handleTouchEnd = useCallback((event: TouchEvent<HTMLDivElement>) => {
    const target = event.target
    const start = tapStartRef.current
    const hadPriceScaleDrag = priceScaleDragRef.current !== null
    priceScaleDragRef.current = null
    tapStartRef.current = null
    if (!start || start.moved || hadPriceScaleDrag) return
    if (target instanceof Element && target.closest("button")) return
    const now = Date.now()
    if (now - lastTapAtRef.current < 320) {
      resetViewTo78()
      lastTapAtRef.current = 0
      return
    }
    lastTapAtRef.current = now
  }, [resetViewTo78])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const height = Math.max(560, Math.floor(container.clientHeight || 680))
    const width = Math.max(320, Math.floor(container.clientWidth))
    const chart = createChart(container, {
      width,
      height,
      autoSize: false,
      layout: {
        background: { type: ColorType.Solid, color: BG },
        textColor: TEXT,
        fontSize: 11,
        fontFamily: "var(--font-geist-sans), system-ui, sans-serif",
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: GRID },
        horzLines: { color: GRID },
      },
      rightPriceScale: {
        borderVisible: true,
        borderColor: AXIS,
        scaleMargins: { top: 0.2, bottom: 0.08 },
      },
      timeScale: {
        borderVisible: true,
        borderColor: AXIS,
        timeVisible: true,
        secondsVisible: false,
        tickMarkFormatter: (time: Time) => (typeof time === "number" ? formatEt(time) : String(time)),
      },
      localization: {
        timeFormatter: (time: Time) => (typeof time === "number" ? formatEt(time) : String(time)),
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
      color: "rgba(91, 168, 230, 0.62)",
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    })

    let labelFrame: number | null = null
    const updateBarNumberLabels = () => {
      const candles = candlesRef.current
      if (!candles) return
      const nextLabels = barsRef.current
        .map((bar, index) => {
          const count = index + 1
          if (count !== 1 && count % 4 !== 0) return null
          const x = chart.timeScale().timeToCoordinate(bar.t as UTCTimestamp)
          const anchorPrice = bar.c >= bar.o ? bar.l : bar.h
          const y = candles.priceToCoordinate(anchorPrice)
          if (x == null || y == null) return null
          const belowBar = bar.c >= bar.o
          return {
            id: `${bar.t}-${count}`,
            x: Number(x),
            y: belowBar ? y + 16 : y - 14,
            text: String(count),
            tone: belowBar ? "bull" : "bear",
          } satisfies BarNumberLabel
        })
        .filter((label): label is BarNumberLabel => label !== null)
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
      const targetVisibleBars = Math.min(barWindowRef.current, barsRef.current.length || barWindowRef.current)
      const targetVisibleBarsWithPadding = targetVisibleBars + 12
      const zoomedAwayFromWindow = Math.abs(visibleBars - targetVisibleBarsWithPadding) > 8
      const shiftedAwayFromWindow = range.from > 4 || range.to < targetVisibleBars - 4
      const offDefault = zoomedAwayFromWindow || shiftedAwayFromWindow || barWindowRef.current !== DEFAULT_BAR_WINDOW
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
        const nextWidth = Math.max(320, Math.floor(entry.contentRect.width))
        const nextHeight = Math.max(560, Math.floor(entry.contentRect.height))
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
      priceLinesRef.current = []
      scheduleLabelsRef.current = () => {}
    }
  }, [showReadoutForBar])

  useEffect(() => {
    const chart = chartRef.current
    const candles = candlesRef.current
    const average = averageRef.current
    if (!chart || !candles || !average) return

    candles.setData(
      bars.map((bar) => ({
        time: bar.t as UTCTimestamp,
        open: bar.o,
        high: bar.h,
        low: bar.l,
        close: bar.c,
      })),
    )
    average.setData(emaLineData(bars, 9))

    for (const priceLine of priceLinesRef.current) {
      candles.removePriceLine(priceLine)
    }
    const nextPriceLines: IPriceLine[] = []
    for (const level of levels) {
      nextPriceLines.push(candles.createPriceLine({
        price: level.price,
        color: level.color,
        lineWidth: 1,
        lineStyle: level.style,
        axisLabelVisible: true,
        title: level.title,
      }))
    }

    const latestBar = bars.at(-1)
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

    const nextRangeSignature = `${symbol}:${timeframe}:${barWindow}:${sessionMode}:${bars.length}`
    const shouldResetRange = bars.length > 0 && rangeSignatureRef.current !== nextRangeSignature
    if (bars.length > 0) {
      rangeSignatureRef.current = nextRangeSignature
    }

    const syncLabels = () => {
      if (shouldResetRange) {
        fitChartToBarWindow(barWindow)
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
  }, [barWindow, bars, fitChartToBarWindow, levels, sessionMode, symbol, timeframe])

  useEffect(() => {
    if (bars.length === 0) return
    const timer = window.setTimeout(() => {
      fitChartToBarWindow(barWindow)
      scheduleLabelsRef.current()
    }, 120)
    return () => window.clearTimeout(timer)
  }, [barWindow, bars.length, fitChartToBarWindow, sessionMode, symbol, timeframe])

  return (
    <section className="flex min-h-0 min-w-0 flex-1 px-0 py-1 sm:px-3 sm:py-2">
      <div
        className="relative h-[calc(100dvh-var(--nav-h)-5.75rem)] min-h-[560px] flex-1 touch-none overscroll-contain overflow-hidden rounded border border-border bg-[#1A1A1A] sm:h-full sm:min-h-[560px] sm:rounded-lg"
        onDoubleClick={(event) => {
          const target = event.target
          if (target instanceof Element && target.closest("button")) return
          resetViewTo78()
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div className="pointer-events-none absolute left-3 top-3 z-10 sm:left-4">
          <div className="mb-1.5 flex items-center gap-1.5 sm:mb-2 sm:gap-2">
            <span className="rounded bg-black/75 px-2 py-0.5 font-mono text-[11px] font-semibold text-teal sm:px-2.5 sm:py-1 sm:text-sm">~</span>
            <span className="font-mono text-sm tracking-tight text-text sm:text-base">
              {formatPrice(latest?.c)} <span className={(metrics.change ?? 0) >= 0 ? "text-teal" : "text-red"}>{signed(metrics.change)} ({signed(metrics.changePct, "%")})</span>
            </span>
          </div>
          <div className="flex min-h-9 w-fit items-center gap-2 rounded border border-border bg-black/75 px-3 py-1.5 font-mono text-sm text-text sm:min-h-0 sm:gap-3 sm:px-4 sm:py-2 sm:text-base">
            <span className="text-xs leading-none sm:text-sm">v</span>
            <span>9</span>
          </div>
        </div>

        <div className="pointer-events-none absolute right-[132px] top-4 z-10 hidden min-w-[230px] text-right lg:block">
          <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.12em] text-sub">
            <div>{title}</div>
            <div>{symbol} / {sessionLabel}</div>
          </div>
          <div className="grid grid-cols-[1fr_auto] gap-x-5 gap-y-1.5 text-[13px] leading-none text-sub/65 xl:text-sm">
            <span>session range</span>
            <span className="font-mono tabular-nums">{sessionRange.toFixed(2)}</span>
            <span>bar window</span>
            <span className="font-mono tabular-nums">{bars.length}/{barWindow}</span>
            <span>scalp</span>
            <span className="font-mono tabular-nums">{(sessionRange * 0.07).toFixed(2)}</span>
            <span>swing</span>
            <span className="font-mono tabular-nums">{(sessionRange * 0.55).toFixed(2)}-{(sessionRange * 0.85).toFixed(2)}</span>
            <span>stop</span>
            <span className="font-mono tabular-nums">{(sessionRange * 0.22).toFixed(2)}-{(sessionRange * 0.44).toFixed(2)}</span>
          </div>
        </div>

        <div className="pointer-events-none absolute right-3 top-3 z-10 text-right font-mono text-[10px] uppercase tracking-[0.1em] text-sub sm:right-4 sm:text-[11px] sm:tracking-[0.12em] lg:hidden">
          <div>{title}</div>
          <div>{symbol} / {sessionLabel}</div>
        </div>

        <div ref={containerRef} className="h-full min-h-[560px] w-full" />

        <div className="pointer-events-none absolute inset-0 z-[5]">
          {barNumberLabels.map((label) => (
            <span
              key={label.id}
              data-testid="bar-number-label"
              aria-hidden="true"
              className={`absolute -translate-x-1/2 font-mono font-semibold leading-none tabular-nums ${
                label.tone === "bull" ? "text-[11px] text-[#62ad61]" : "-translate-y-full text-[9px] text-[#ff535d]"
              }`}
              style={{ left: label.x, top: label.y }}
            >
              {label.text}
            </span>
          ))}
        </div>

        {crosshairReadout && (
          <div
            className="pointer-events-none absolute z-20 rounded border border-border/80 bg-black/[0.78] px-2.5 py-2 font-mono text-[10px] leading-4 text-text/90 shadow-[0_8px_24px_rgba(0,0,0,0.3)] backdrop-blur-sm"
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
            onClick={resetViewTo78}
            className="absolute bottom-[calc(4.35rem+env(safe-area-inset-bottom,0px))] right-3 z-20 rounded border border-border/80 bg-black/[0.72] px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-sub shadow-[0_8px_22px_rgba(0,0,0,0.28)] outline-none backdrop-blur-sm hover:text-text focus-visible:ring-2 focus-visible:ring-teal/70 focus-visible:ring-offset-2 focus-visible:ring-offset-bg sm:right-4"
          >
            view {viewState.visibleBars} · reset 78
          </button>
        )}

        <SymbolScroller symbol={symbol} symbols={symbols} onSelect={onSelectSymbol} />

        <div
          aria-hidden="true"
          data-testid="chart-mobile-toolbar"
          className="pointer-events-none absolute bottom-[calc(0.875rem+env(safe-area-inset-bottom,0px))] left-3 z-10 flex max-w-[calc(100%-6.5rem)] rounded-lg border border-border/70 bg-black/[0.58] px-2.5 py-1.5 shadow-[0_8px_22px_rgba(0,0,0,0.24)] backdrop-blur-sm lg:hidden"
        >
          <div className="flex min-h-8 items-center gap-3.5 text-text/62">
            <span className="h-3.5 w-8 border-y-2 border-current" />
            <span className="h-6 w-6 rotate-45 border-b-2 border-l-2 border-current" />
            <span className="h-6 w-6 border-2 border-current" />
            <span className="h-px w-8 bg-current" />
            <span className="h-5 w-8 border-y-2 border-current" />
          </div>
        </div>
      </div>
    </section>
  )
}

function Watchlist({
  symbols,
  selected,
  quotes,
  onSelect,
}: {
  symbols: string[]
  selected: string
  quotes: Record<string, Quote>
  onSelect: (symbol: string) => void
}) {
  return (
    <div className="rounded border border-border bg-surface">
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
              onClick={() => onSelect(symbol)}
              className={`grid w-full grid-cols-[minmax(58px,1fr)_auto_auto] items-center gap-3 border-b border-border px-3 py-2 text-left last:border-b-0 ${
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
}: {
  symbol: string
  bars: Bar[]
  quotes: Record<string, Quote>
  symbols: string[]
  selectedSymbol: string
  onSelectSymbol: (symbol: string) => void
}) {
  const metrics = metricsFor(bars)
  const positive = (metrics.change ?? 0) >= 0

  return (
    <aside className="flex min-h-0 flex-col gap-3 overflow-y-auto bg-bg p-3 xl:w-[320px] xl:border-l xl:border-border">
      <div className="rounded border border-border bg-surface p-3">
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

      <Watchlist symbols={symbols} selected={selectedSymbol} quotes={quotes} onSelect={onSelectSymbol} />
    </aside>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-border bg-bg px-2 py-2">
      <div className="mb-1 text-[10px] uppercase tracking-[0.12em] text-sub">{label}</div>
      <div className="font-mono text-xs tabular-nums text-text">{value}</div>
    </div>
  )
}

export function TradingViewTerminal() {
  const [symbols, setSymbols] = useState(DEFAULT_SYMBOLS)
  const [dataset, setDataset] = useState<string | null>(null)
  const [schema, setSchema] = useState<string | null>(null)
  const [selectedSymbol, setSelectedSymbol] = useState(storedSymbol)
  const [symbolDraft, setSymbolDraft] = useState(storedSymbol)
  const [timeframe, setTimeframe] = useState<IntradayTimeframe>(storedTimeframe)
  const [barWindow, setBarWindow] = useState(storedBarWindow)
  const [sessionMode, setSessionMode] = useState<SessionMode>(storedSessionMode)
  const [refreshNonce, setRefreshNonce] = useState(0)
  const [historyBars, setHistoryBars] = useState<Bar[]>([])
  const [liveBars, setLiveBars] = useState<Bar[]>([])
  const [contextBars, setContextBars] = useState<Bar[]>([])
  const [priorRthBars, setPriorRthBars] = useState<Bar[]>([])
  const [historyError, setHistoryError] = useState<string | null>(null)
  const [liveError, setLiveError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [lastFetchedAt, setLastFetchedAt] = useState<Date | null>(null)
  const [quotes, setQuotes] = useState<Record<string, Quote>>({})
  const [watchlistVisible, setWatchlistVisible] = useState(storedWatchlistVisible)
  const [levelVisibility, setLevelVisibility] = useState<LevelVisibility>(storedLevelVisibility)
  const barsCacheRef = useRef<Map<string, { payload: BarsPayload; fetchedAt: number }>>(new Map())

  useEffect(() => {
    writeChartPrefs({
      symbol: selectedSymbol,
      timeframe,
      barWindow,
      sessionMode,
      watchlistVisible,
      levelVisibility,
    })
  }, [barWindow, levelVisibility, selectedSymbol, sessionMode, timeframe, watchlistVisible])

  const fetchBarsWithMemory = useCallback(async (url: string, maxAgeMs: number): Promise<BarsPayload> => {
    const cached = barsCacheRef.current.get(url)
    const now = Date.now()
    if (cached && maxAgeMs > 0 && now - cached.fetchedAt <= maxAgeMs) {
      return cached.payload
    }
    const payload = await fetchJson<BarsPayload>(url)
    barsCacheRef.current.set(url, { payload, fetchedAt: now })
    return payload
  }, [])

  useEffect(() => {
    let cancelled = false
    fetchJson<SymbolsPayload>("/api/bars/live/symbols")
      .then((payload) => {
        if (cancelled) return
        const nextSymbols = payload.symbols.length > 0 ? payload.symbols : DEFAULT_SYMBOLS
        setSymbols(nextSymbols)
        setDataset(payload.dataset)
        setSchema(payload.schema)
        if (!nextSymbols.includes(selectedSymbol)) {
          setSelectedSymbol(nextSymbols[0])
          setSymbolDraft(nextSymbols[0])
        }
      })
      .catch(() => {
        if (!cancelled) setSymbols(DEFAULT_SYMBOLS)
      })
    return () => {
      cancelled = true
    }
  }, [selectedSymbol])

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
      const historyQs = new URLSearchParams({
        ticker: selectedSymbol,
        from: sessionDate,
        to: sessionDate,
        tf: "1min",
        session: sessionMode === "rth" ? "rth" : "all",
        limit: String(rawLimitFor(timeframe, barWindow)),
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
      const historyUrl = `/api/bars?${historyQs}`
      const contextUrl = `/api/bars?${contextQs}`
      const liveUrl = `/api/bars/live?${liveQs}`

      const contextPromise = !silent
        ? fetchBarsWithMemory(contextUrl, 120_000)
          .then((payload) => ({ status: "fulfilled" as const, payload }))
          .catch(() => ({ status: "rejected" as const }))
        : null

      if (silent) {
        const liveResult = await Promise.allSettled([fetchBarsWithMemory(liveUrl, 0)])
        if (cancelled) return
        const [result] = liveResult
        if (result.status === "fulfilled") {
          setLiveBars(result.value.bars)
          setLiveError(null)
        } else {
          setLiveError(result.reason instanceof Error ? result.reason.message : String(result.reason))
        }
        setLastFetchedAt(new Date())
        return
      }

      const [historyResult, liveResult] = await Promise.allSettled([
        fetchBarsWithMemory(historyUrl, 120_000),
        fetchBarsWithMemory(liveUrl, 15_000),
      ])

      if (cancelled) return

      if (historyResult.status === "fulfilled") {
        setHistoryBars(historyResult.value.bars)
        setHistoryError(null)
      } else {
        setHistoryError(historyResult.reason instanceof Error ? historyResult.reason.message : String(historyResult.reason))
      }

      if (liveResult.status === "fulfilled") {
        setLiveBars(liveResult.value.bars)
        setLiveError(null)
      } else {
        setLiveBars([])
        setLiveError(liveResult.reason instanceof Error ? liveResult.reason.message : String(liveResult.reason))
      }

      setLastFetchedAt(new Date())
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
    const interval = window.setInterval(() => load(true), 10_000)
    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [barWindow, fetchBarsWithMemory, refreshNonce, selectedSymbol, sessionMode, timeframe])

  useEffect(() => {
    const currentIndex = symbols.indexOf(selectedSymbol)
    if (currentIndex === -1 || symbols.length < 2) return
    const adjacentSymbols = Array.from(new Set([
      symbols[(currentIndex - 1 + symbols.length) % symbols.length],
      symbols[(currentIndex + 1) % symbols.length],
    ])).filter((symbol) => symbol !== selectedSymbol)

    const timer = window.setTimeout(() => {
      const sessionDate = todayEt()
      for (const symbol of adjacentSymbols) {
        const historyQs = new URLSearchParams({
          ticker: symbol,
          from: sessionDate,
          to: sessionDate,
          tf: "1min",
          session: sessionMode === "rth" ? "rth" : "all",
          limit: String(rawLimitFor(timeframe, barWindow)),
        })
        const liveQs = new URLSearchParams({ ticker: symbol, minutes: "720" })
        void fetchBarsWithMemory(`/api/bars?${historyQs}`, 120_000).catch(() => undefined)
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

  const combinedBars = useMemo(() => mergeBars(historyBars, liveBars), [historyBars, liveBars])
  const visibleBaseBars = useMemo(() => {
    const rthBars = sessionMode === "rth" ? combinedBars.filter(isRthBar) : combinedBars
    const sessionBars = rthBars.length > 0 ? rthBars : combinedBars
    return sessionBars
  }, [combinedBars, sessionMode])

  const displayBars = useMemo(() => {
    const minutes = TIMEFRAMES.find((item) => item.value === timeframe)?.minutes ?? 1
    return aggregateBars(visibleBaseBars, minutes).slice(-barWindow)
  }, [barWindow, timeframe, visibleBaseBars])
  const activeSessionDate = useMemo(() => {
    const latest = displayBars.at(-1) ?? combinedBars.at(-1)
    return latest ? etDateForTimestamp(latest.t) : todayEt()
  }, [combinedBars, displayBars])
  const combinedContextBars = useMemo(() => {
    const merged = mergeBars(contextBars, liveBars).filter((bar) => etDateForTimestamp(bar.t) === activeSessionDate)
    return merged.length > 0 ? merged : combinedBars.filter((bar) => etDateForTimestamp(bar.t) === activeSessionDate)
  }, [activeSessionDate, combinedBars, contextBars, liveBars])

  const brooksLevels = useMemo(() => buildBrooksLevels(combinedContextBars, priorRthBars), [combinedContextBars, priorRthBars])
  const visibleBrooksLevels = useMemo(
    () => brooksLevels.filter((level) => levelVisibility[level.group]),
    [brooksLevels, levelVisibility],
  )
  const latestLive = liveBars.at(-1)
  const liveAgeSeconds = latestLive && lastFetchedAt ? Math.max(0, lastFetchedAt.getTime() / 1000 - latestLive.t) : null
  const liveFresh = liveAgeSeconds != null && liveAgeSeconds < 15 * 60
  const statusText = liveFresh ? "Live" : liveBars.length > 0 ? "Cached" : "No live cache"
  const statusTone = liveFresh ? "text-teal" : liveBars.length > 0 ? "text-yellow" : "text-red"
  const blockingError = displayBars.length === 0 ? historyError ?? liveError : null

  const selectSymbol = useCallback((symbol: string) => {
    const clean = symbol.trim().toUpperCase()
    if (!clean) return
    setPriorRthBars([])
    setContextBars([])
    setSelectedSymbol(clean)
    setSymbolDraft(clean)
  }, [])

  const toggleLevelGroup = useCallback((group: LevelGroup) => {
    setLevelVisibility((current) => ({ ...current, [group]: !current[group] }))
  }, [])

  const resetBarWindow = useCallback(() => {
    setBarWindow(DEFAULT_BAR_WINDOW)
  }, [])

  const submitSymbol = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    selectSymbol(symbolDraft)
  }

  return (
    <div className="mx-auto flex h-auto min-h-[calc(100dvh-var(--nav-h))] max-w-[1600px] flex-col bg-bg px-2 py-1 text-text sm:px-3 sm:py-3 xl:h-[calc(100dvh-var(--nav-h))] xl:overflow-hidden">
      <header className="mb-1 flex gap-2 overflow-x-auto border-b border-border pb-1 scrollbar-none sm:mb-2 sm:flex-row sm:items-center sm:justify-between sm:overflow-visible sm:pb-2">
        <div className="flex min-w-max items-center gap-2 sm:min-w-0 sm:flex-wrap">
          <form onSubmit={submitSymbol} className="flex min-h-11 items-center gap-2 rounded border border-border bg-surface px-2 py-1.5 sm:min-h-0">
            <label htmlFor="chart-symbol" className="text-[10px] font-semibold uppercase tracking-[0.14em] text-sub">
              Symbol
            </label>
            <input
              id="chart-symbol"
              value={symbolDraft}
              onChange={(event) => setSymbolDraft(event.target.value.toUpperCase())}
              className="w-20 rounded bg-transparent font-mono text-sm font-semibold uppercase text-text outline-none focus-visible:ring-2 focus-visible:ring-teal/70"
              spellCheck={false}
            />
          </form>

          <Segment
            value={timeframe}
            options={TIMEFRAMES.map(({ value, label }) => ({ value, label }))}
            onChange={setTimeframe}
          />

          <Segment
            value={String(barWindow)}
            options={BAR_WINDOW_CHOICES.map(({ value, label }) => ({ value: String(value), label }))}
            onChange={(next) => setBarWindow(Number(next))}
          />

          <Segment<SessionMode>
            value={sessionMode}
            options={[
              { value: "rth", label: "RTH" },
              { value: "all", label: "EXT" },
            ]}
            onChange={setSessionMode}
          />

          <LevelControls visibility={levelVisibility} onToggle={toggleLevelGroup} />
        </div>

        <div className="flex min-w-max items-center gap-2">
          <button
            type="button"
            aria-pressed={watchlistVisible}
            onClick={() => setWatchlistVisible((visible) => !visible)}
            className="min-h-11 rounded border border-border bg-surface px-3 py-1 text-[11px] font-semibold text-sub outline-none hover:border-border-hover hover:text-text focus-visible:ring-2 focus-visible:ring-teal/70 focus-visible:ring-offset-2 focus-visible:ring-offset-bg sm:min-h-0"
          >
            {watchlistVisible ? "Hide list" : "Show list"}
          </button>
          <button
            type="button"
            onClick={() => setRefreshNonce((value) => value + 1)}
            className="min-h-11 rounded border border-border bg-surface px-3 py-1 text-[11px] font-semibold text-sub outline-none hover:border-border-hover hover:text-text focus-visible:ring-2 focus-visible:ring-teal/70 focus-visible:ring-offset-2 focus-visible:ring-offset-bg sm:min-h-0"
          >
            Refresh
          </button>
          <div className={`flex min-h-11 items-center gap-1.5 rounded border border-border bg-surface px-2.5 py-1 text-[11px] font-semibold sm:min-h-0 ${statusTone}`}>
            <SymbolIcon active={liveFresh} />
            {statusText}
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col xl:flex-row">
        <main className="flex min-h-[560px] min-w-0 flex-1 flex-col">
          <div className="hidden flex-wrap items-center justify-between gap-2 border-b border-border bg-bg px-3 py-2 sm:flex">
            <div className="flex min-w-0 items-center gap-3">
              <h1 className="truncate text-base font-bold tracking-tight">{selectedSymbol}</h1>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-sub">
              <span>{dataset ?? "Databento"}</span>
              <span>{schema ?? "live"}</span>
              {latestLive && <span>last {formatEt(latestLive.t)}</span>}
              {lastFetchedAt && <span>polled {lastFetchedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>}
            </div>
          </div>

          {loading ? (
            <div className="flex min-h-[520px] flex-1 items-center justify-center bg-bg">
              <div className="skeleton h-[420px] w-[92%] rounded" />
            </div>
          ) : blockingError ? (
            <div className="flex min-h-[520px] flex-1 items-center justify-center bg-bg px-6 text-center">
              <div>
                <div className="mb-2 text-sm font-semibold text-red">Chart unavailable</div>
                <div className="max-w-xl text-xs leading-5 text-sub">{blockingError}</div>
              </div>
            </div>
          ) : (
            <ChartSurface
              symbol={selectedSymbol}
              bars={displayBars}
              levels={visibleBrooksLevels}
              timeframe={timeframe}
              barWindow={barWindow}
              sessionMode={sessionMode}
              symbols={symbols}
              onSelectSymbol={selectSymbol}
              onResetBarWindow={resetBarWindow}
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
            />
          </div>
        )}
      </div>

      {watchlistVisible && (
        <div className="xl:hidden">
          <SidePanel
            symbol={selectedSymbol}
            bars={displayBars}
            quotes={quotes}
            symbols={symbols}
            selectedSymbol={selectedSymbol}
            onSelectSymbol={selectSymbol}
          />
        </div>
      )}
    </div>
  )
}
