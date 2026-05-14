"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import {
  createChart,
  CandlestickSeries,
  LineSeries,
  ColorType,
  LineStyle,
  createSeriesMarkers,
  type IChartApi,
  type ISeriesApi,
  type IPriceLine,
  type UTCTimestamp,
  type Time,
  type SeriesMarker,
} from "lightweight-charts"
import { SignalBadge } from "@/components/scanner/SignalBadge"
import { ScoreBar } from "@/components/scanner/ScoreBar"
import type { Signal } from "@/lib/types"

/**
 * Featured setups currently use hand-crafted price paths (see pathToBars).
 *
 * To swap a slot for a real session from public/analogs/, replace the
 * `bars: pathToBars(...)` field with a build-time-resolved bar array from
 * `public/analogs/{date}_{ticker}/session.json`. Steps:
 *
 *   1. Pick a session that contains a clean Brooks setup of the desired
 *      type (eyeball the chart — corpus has no setup-quality index).
 *   2. Slice the bars array to the window you want to show (~30 bars).
 *   3. Hand-annotate signalBarIndex, phases[], stopPrice, targetPrice,
 *      adrMultiple, edge.eq, and the read text.
 *   4. The Brooks vocabulary stays in `read`; the corpus stays in `bars`.
 *
 * A small build-time helper would centralize step 2-3 (TODO).
 */

/* ---------- Hero-tape data model ------------------------------------------ */

export interface RawBar { o: number; h: number; l: number; c: number }
export interface SetupEdge { eq: number; note: string }
export interface PhaseAnchor { from: number; label: string }

export interface FeaturedSetup {
  symbol: string
  timeframe: string
  sessionLabel: string
  read: string
  direction: "long" | "short"
  signal: Signal
  urgency: number
  uncertainty: number
  edge: SetupEdge
  adrMultiple: number
  signalBarIndex: number
  entryPrice: number
  /** Optional — when undefined, no STOP price line is drawn. Live
   *  candidates often don't have a principled stop yet. */
  stopPrice?: number
  /** Optional — same as stopPrice. */
  targetPrice?: number
  phases: PhaseAnchor[]
  bars: RawBar[]
  /** Optional explicit destination for the "deep dive on $SYMBOL"
   *  link. When omitted, falls back to /symbol/{symbol}. Live
   *  candidates set this to /symbol/{symbol}?t=...&pattern=...&direction=...
   *  so the link lands on the chart-deep-link view with the fire bar. */
  deepDiveHref?: string
  /** Index (into `bars`) of the LOD (long) / HOD (short) pivot bar.
   *  When provided, the chart paints that bar cyan and switches the
   *  fire bar from an arrow marker to a body-painted gold candle —
   *  matching the deep-dive (/symbol) chart's visual language. */
  pivotBarIndex?: number
  /** Indices (into `bars`) of Brooks-strong confirming bars. When
   *  provided alongside `pivotBarIndex`, they paint purple. From
   *  setup_candidates.strong_bar_ts (the detector's source of truth),
   *  not re-derived in JS. */
  strongBarIndices?: number[]
}

function mulberry32(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function pathToBars(path: number[], seed: number, atrFraction: number): RawBar[] {
  const rng = mulberry32(seed)
  const out: RawBar[] = []
  for (let i = 0; i < path.length - 1; i++) {
    const open = path[i]
    const close = path[i + 1]
    const body = Math.abs(close - open)
    const tick = atrFraction * (0.5 + body / Math.max(1, body))
    const wickUp = tick * (0.35 + rng() * 0.9)
    const wickDown = tick * (0.35 + rng() * 0.9)
    out.push({
      o: open,
      c: close,
      h: Math.max(open, close) + wickUp,
      l: Math.min(open, close) - wickDown,
    })
  }
  return out
}

function computeEma(bars: RawBar[], period = 20): number[] {
  const alpha = 2 / (period + 1)
  const out = new Array<number>(bars.length)
  let ema = bars[0].c
  for (let i = 0; i < bars.length; i++) {
    ema = bars[i].c * alpha + ema * (1 - alpha)
    out[i] = ema
  }
  return out
}

function phaseAt(phases: PhaseAnchor[], barIdx: number): string {
  let current = phases[0].label
  for (const p of phases) {
    if (p.from <= barIdx) current = p.label
    else break
  }
  return current
}

/* ---------- Featured setups ----------------------------------------------- */

const SETUPS: FeaturedSetup[] = [
  {
    symbol: "QQQ", timeframe: "5m", sessionLabel: "Tue · RTH session",
    read: "H2 long off EMA · spike-and-channel base",
    direction: "long", signal: "BUY",
    urgency: 8.2, uncertainty: 2.1,
    edge: { eq: 0.78, note: "p 0.65 · 1.7R win · 1R stop" },
    adrMultiple: 1.4,
    signalBarIndex: 23,
    entryPrice: 515.40, stopPrice: 514.85, targetPrice: 516.40,
    phases: [
      { from: 0, label: "trading_range" },
      { from: 4, label: "bull_spike" },
      { from: 9, label: "bull_channel" },
      { from: 13, label: "pullback" },
      { from: 18, label: "micro_double_bottom" },
      { from: 23, label: "bull_spike" },
    ],
    bars: pathToBars(
      [
        513.20, 513.10, 513.05, 513.10, 513.05,
        513.55, 514.15, 514.50, 514.90, 515.10,
        514.95, 515.20, 515.35, 515.40,
        515.10, 514.95, 514.90,
        515.10, 515.25, 515.35,
        515.10, 514.95, 514.85, 514.95,
        515.40,
        515.75, 516.10, 516.45, 516.80, 517.05, 517.30,
      ],
      1337,
      0.09,
    ),
  },
  {
    symbol: "SPY", timeframe: "5m", sessionLabel: "Wed · post-FOMC",
    read: "M2S short · failed breakout · lower-high pullback",
    direction: "short", signal: "SELL",
    urgency: 7.4, uncertainty: 2.8,
    edge: { eq: 0.62, note: "p 0.58 · 1.6R win · 1R stop" },
    adrMultiple: 1.7,
    signalBarIndex: 26,
    entryPrice: 578.50, stopPrice: 579.15, targetPrice: 577.46,
    phases: [
      { from: 0, label: "trend_from_open" },
      { from: 8, label: "final_flag" },
      { from: 13, label: "failed_breakout" },
      { from: 15, label: "bear_spike" },
      { from: 19, label: "bear_channel" },
      { from: 22, label: "lower_high" },
      { from: 26, label: "bear_spike" },
    ],
    bars: pathToBars(
      [
        580.20, 580.40, 580.55, 580.65, 580.80,
        581.05, 581.25, 581.45, 581.55,
        581.40, 581.60, 581.80, 581.95,
        581.85, 581.50,
        581.10, 580.65, 580.20, 579.80,
        579.45, 579.10, 578.85,
        579.15, 579.35, 579.45,
        579.20, 579.00,
        578.50,
        578.05, 577.55, 577.10, 576.65,
      ],
      7717,
      0.32,
    ),
  },
  {
    symbol: "TSLA", timeframe: "5m", sessionLabel: "Mon · midday",
    read: "wedge reversal long · three-push exhaustion · bull bar back through prior lows",
    direction: "long", signal: "BUY",
    urgency: 7.6, uncertainty: 3.4,
    edge: { eq: 0.48, note: "p 0.54 · 1.6R win · 1R stop · countertrend" },
    adrMultiple: 1.1,
    signalBarIndex: 26,
    entryPrice: 278.85, stopPrice: 278.05, targetPrice: 280.13,
    phases: [
      { from: 0, label: "bear_channel" },
      { from: 8, label: "push_2_low" },
      { from: 13, label: "wedge_bottom" },
      { from: 19, label: "micro_double_bottom" },
      { from: 26, label: "bull_spike" },
    ],
    bars: pathToBars(
      [
        280.40, 280.10, 279.75, 279.40,
        279.15, 278.85, 278.95, 278.65,
        278.95, 279.20, 279.05, 278.75,
        278.55, 278.30, 278.45, 278.20,
        278.30, 278.15, 278.25,
        278.45, 278.65, 278.50,
        278.30, 278.10, 278.20, 278.30,
        278.85,
        279.20, 279.65, 280.15, 280.60,
      ],
      4241,
      0.28,
    ),
  },
  {
    symbol: "NVDA", timeframe: "5m", sessionLabel: "Thu · post-earnings drift",
    read: "failed final flag · bull channel exhaustion · M1S short below flag low",
    direction: "short", signal: "SELL",
    urgency: 8.0, uncertainty: 2.4,
    edge: { eq: 0.72, note: "p 0.62 · 1.7R win · 1R stop" },
    adrMultiple: 1.3,
    signalBarIndex: 27,
    entryPrice: 924.45, stopPrice: 926.10, targetPrice: 921.65,
    phases: [
      { from: 0, label: "bull_spike" },
      { from: 8, label: "bull_channel" },
      { from: 14, label: "final_flag" },
      { from: 18, label: "failed_breakout" },
      { from: 22, label: "lower_high" },
      { from: 27, label: "bear_spike" },
    ],
    bars: pathToBars(
      [
        920.50, 921.20, 921.85, 922.30,
        922.95, 923.60, 924.10, 924.55,
        924.30, 924.65, 924.90, 925.20,
        925.50, 925.85, 926.10,
        925.85, 925.60, 925.80,
        926.40, 926.65,
        926.20, 925.85, 925.45,
        925.20, 924.85, 924.55, 924.95,
        924.45,
        923.95, 923.40, 922.85,
      ],
      9091,
      0.55,
    ),
  },
  {
    symbol: "META", timeframe: "5m", sessionLabel: "Fri · trend-from-open",
    read: "trend-from-open long · bull spike continuation · shallow micro-pullbacks only",
    direction: "long", signal: "BUY",
    urgency: 8.5, uncertainty: 1.8,
    edge: { eq: 0.84, note: "p 0.68 · 1.8R win · 1R stop · highest-prob bucket" },
    adrMultiple: 1.9,
    signalBarIndex: 21,
    entryPrice: 604.20, stopPrice: 603.00, targetPrice: 606.36,
    phases: [
      { from: 0, label: "opening_drive" },
      { from: 2, label: "bull_channel" },
      { from: 10, label: "micro_pullback" },
      { from: 13, label: "bull_channel" },
      { from: 16, label: "micro_consolidation" },
      { from: 21, label: "bull_spike" },
    ],
    bars: pathToBars(
      [
        595.20, 597.40,
        598.10, 598.65, 599.30, 599.85,
        600.40, 600.95, 601.50, 602.00,
        601.85, 601.65, 601.90,
        602.40, 602.85, 603.25,
        603.05, 602.85, 603.05,
        603.40, 603.75,
        604.20,
        604.55, 604.90, 605.35, 605.85, 606.30, 606.75, 607.20, 607.70, 608.10,
      ],
      6505,
      0.42,
    ),
  },
  {
    symbol: "GOOGL", timeframe: "5m", sessionLabel: "Tue · range day",
    read: "trading range short · third failed test of highs · bear bar through midrange",
    direction: "short", signal: "SELL",
    urgency: 6.8, uncertainty: 4.2,
    edge: { eq: 0.32, note: "p 0.55 · 1.3R win · 1R stop · range = low edge" },
    adrMultiple: 0.7,
    signalBarIndex: 26,
    entryPrice: 175.20, stopPrice: 175.88, targetPrice: 174.32,
    phases: [
      { from: 0, label: "trading_range" },
      { from: 8, label: "range_top_test" },
      { from: 12, label: "trading_range" },
      { from: 15, label: "range_top_test_2" },
      { from: 18, label: "trading_range" },
      { from: 21, label: "range_top_test_3" },
      { from: 26, label: "bear_spike" },
    ],
    bars: pathToBars(
      [
        175.20, 175.45, 175.30, 175.10,
        175.35, 175.55, 175.40, 175.25,
        175.45, 175.65, 175.80, 175.60,
        175.40, 175.30, 175.45,
        175.60, 175.75, 175.85,
        175.70, 175.55, 175.40,
        175.55, 175.70, 175.80,
        175.65, 175.50,
        175.20,
        174.95, 174.70, 174.50, 174.30,
      ],
      3132,
      0.15,
    ),
  },
]

/* ---------- Visual constants --------------------------------------------- */

const PALETTE = {
  bg: "#141414",
  grid: "#1c1c1c",
  axis: "#2a2a2a",
  text: "#9a9a9a",
  teal: "#00c896",
  red: "#e05555",
  // Match the deep-dive (/symbol) chart's body-painting palette so a
  // user comparing the two views sees the same colors:
  //   gold   #fbbf24 — fire bar
  //   purple #a78bfa — Brooks-strong confirming bars
  //   cyan   #38bdf8 — LOD/HOD pivot bar
  signalGold: "#fbbf24",
  strongPurple: "#a78bfa",
  pivotCyan: "#38bdf8",
  phaseGold: "#e6c14a",
  ema: "#5a5a5a",
}

const BAR_SECONDS = 5 * 60
const BASE_REVEAL_MS = 145
const REVEAL_HOLD_MS = 10000
const ENTRY_FADE_MS = 600

function revealDelay(barIdx: number, signalIdx: number): number {
  const since = barIdx - signalIdx - 1
  if (since < 0) return BASE_REVEAL_MS
  if (since === 0) return 175
  if (since === 1) return 210
  if (since === 2) return 250
  if (since === 3) return 280
  return 300
}

/* ---------- Component ----------------------------------------------------- */

/**
 * `setups` overrides the hand-crafted hero reel above. When provided,
 * the component cycles through those instead — used by /setups when
 * URL params point at a live scanner candidate.
 */
export function HeroSetupTape({ setups: setupsProp }: { setups?: FeaturedSetup[] } = {}) {
  const setups = setupsProp ?? SETUPS
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const candleRef = useRef<ISeriesApi<"Candlestick"> | null>(null)
  const emaRef = useRef<ISeriesApi<"Line"> | null>(null)
  const stopLineRef = useRef<IPriceLine | null>(null)
  const targetLineRef = useRef<IPriceLine | null>(null)
  const chainTimersRef = useRef<number[]>([])
  const cycleTimerRef = useRef<number | null>(null)
  const markersPlacedRef = useRef(false)
  const levelsPlacedRef = useRef(false)

  const [setupIdx, setSetupIdx] = useState(0)
  const [revealedCount, setRevealedCount] = useState(0)
  const [phase, setPhase] = useState<"playing" | "revealed">("playing")
  const [reducedMotion, setReducedMotion] = useState(false)
  const [currentPhaseLabel, setCurrentPhaseLabel] = useState("")
  const [adrVisible, setAdrVisible] = useState(false)

  // Clamp the index in case the parent swaps `setups` to a shorter list
  // mid-render (e.g. switching between live and hero modes).
  const setup = setups[Math.min(setupIdx, setups.length - 1)] ?? setups[0]

  // When a setup ships index-based highlights (pivot / strong / fire),
  // we body-paint the candles to match the deep-dive (/symbol) chart's
  // language instead of layering an arrow marker. Hero-reel setups
  // without indices keep their original arrow-marker rendering.
  const bodyPaintMode =
    setup.pivotBarIndex != null || (setup.strongBarIndices?.length ?? 0) > 0

  const { chartBars, emaSeriesData, colorByIndex } = useMemo(() => {
    const t0 = Math.floor(Date.UTC(2025, 0, 6, 14, 30) / 1000)
    const cb = setup.bars.map((b, i) => ({
      time: (t0 + i * BAR_SECONDS) as UTCTimestamp,
      open: b.o,
      high: b.h,
      low: b.l,
      close: b.c,
    }))
    const ema = computeEma(setup.bars, 20)
    const es = cb.map((b, i) => ({ time: b.time, value: ema[i] }))
    // Precedence: cyan (pivot) → purple (strong) → gold (fire). Map.set
    // semantics match the deep-dive chart's LightweightChart.
    const colorMap = new Map<number, string>()
    if (setup.pivotBarIndex != null) {
      colorMap.set(setup.pivotBarIndex, PALETTE.pivotCyan)
    }
    if (setup.strongBarIndices) {
      for (const idx of setup.strongBarIndices) {
        colorMap.set(idx, PALETTE.strongPurple)
      }
    }
    colorMap.set(setup.signalBarIndex, PALETTE.signalGold)
    return { chartBars: cb, emaSeriesData: es, colorByIndex: colorMap }
  }, [setup])

  // Helper: reveal a sliced prefix of the candle data with body-paint
  // overrides applied. Used by the initial render (reduced-motion path)
  // and the per-bar reveal chain below.
  const paintedSlice = useCallback(
    (count: number) =>
      bodyPaintMode
        ? chartBars.slice(0, count).map((b, i) => {
            const hl = colorByIndex.get(i)
            return hl
              ? { ...b, color: hl, borderColor: hl, wickColor: hl }
              : b
          })
        : chartBars.slice(0, count),
    [bodyPaintMode, chartBars, colorByIndex],
  )

  useEffect(() => {
    if (typeof window === "undefined") return
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)")
    setReducedMotion(mql.matches)
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches)
    mql.addEventListener?.("change", handler)
    return () => mql.removeEventListener?.("change", handler)
  }, [])

  const clearAllTimers = useCallback(() => {
    for (const t of chainTimersRef.current) window.clearTimeout(t)
    chainTimersRef.current = []
    if (cycleTimerRef.current !== null) {
      window.clearTimeout(cycleTimerRef.current)
      cycleTimerRef.current = null
    }
  }, [])

  const placeStopAndTargetLines = useCallback(() => {
    const candle = candleRef.current
    if (!candle || levelsPlacedRef.current) return
    // Skip silently when the setup has no principled stop/target —
    // typical for live candidates without explicit risk-frame data.
    if (setup.stopPrice == null || setup.targetPrice == null) return
    stopLineRef.current = candle.createPriceLine({
      price: setup.stopPrice,
      color: PALETTE.red,
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      axisLabelVisible: true,
      title: "STOP",
    })
    targetLineRef.current = candle.createPriceLine({
      price: setup.targetPrice,
      color: PALETTE.teal,
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      axisLabelVisible: true,
      title: "TGT",
    })
    levelsPlacedRef.current = true
  }, [setup.stopPrice, setup.targetPrice])

  /* Build the chart for the current setup. */
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const api = createChart(container, {
      autoSize: false,
      width: container.clientWidth,
      height: container.clientHeight,
      layout: {
        background: { type: ColorType.Solid, color: "rgba(0,0,0,0)" },
        textColor: PALETTE.text,
        fontSize: 11,
        fontFamily:
          'var(--font-geist-mono), ui-monospace, "SF Mono", Menlo, monospace',
        attributionLogo: false,
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { color: PALETTE.grid, style: LineStyle.Solid },
      },
      rightPriceScale: {
        borderColor: PALETTE.axis,
        scaleMargins: { top: 0.12, bottom: 0.12 },
      },
      timeScale: {
        borderColor: PALETTE.axis,
        timeVisible: true,
        secondsVisible: false,
      },
      crosshair: { mode: 0 },
      handleScroll: false,
      handleScale: false,
    })
    chartRef.current = api

    const ema = api.addSeries(LineSeries, {
      color: PALETTE.ema,
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    })
    emaRef.current = ema

    const candle = api.addSeries(CandlestickSeries, {
      upColor: PALETTE.teal,
      downColor: PALETTE.red,
      borderUpColor: PALETTE.teal,
      borderDownColor: PALETTE.red,
      wickUpColor: PALETTE.teal,
      wickDownColor: PALETTE.red,
      priceLineVisible: false,
      lastValueVisible: false,
    })
    candleRef.current = candle

    const fullRange = { from: -0.5, to: chartBars.length - 0.5 }
    const applyFullRange = () =>
      api.timeScale().setVisibleLogicalRange(fullRange)

    candle.setData(paintedSlice(1))
    ema.setData([emaSeriesData[0]])
    applyFullRange()

    markersPlacedRef.current = false
    levelsPlacedRef.current = false
    stopLineRef.current = null
    targetLineRef.current = null

    setCurrentPhaseLabel(phaseAt(setup.phases, 0))
    setAdrVisible(false)
    window.setTimeout(() => setAdrVisible(true), 80)

    if (reducedMotion) {
      candle.setData(paintedSlice(chartBars.length))
      ema.setData(emaSeriesData)
      applyFullRange()
      setRevealedCount(chartBars.length)
      setPhase("revealed")
      setCurrentPhaseLabel(phaseAt(setup.phases, chartBars.length - 1))
      // In body-paint mode the fire bar is its own gold candle; no
      // arrow marker layered on top.
      if (!bodyPaintMode) {
        const sig = chartBars[setup.signalBarIndex]
        createSeriesMarkers(candle, [
          {
            time: sig.time,
            position: setup.direction === "long" ? "belowBar" : "aboveBar",
            color: PALETTE.signalGold,
            shape: setup.direction === "long" ? "arrowUp" : "arrowDown",
            text: "signal",
          } as SeriesMarker<Time>,
        ])
      }
      markersPlacedRef.current = true
      placeStopAndTargetLines()
    } else {
      setPhase("playing")
      setRevealedCount(1)
    }

    const ro = new ResizeObserver(() => {
      api.applyOptions({
        width: container.clientWidth,
        height: container.clientHeight,
      })
      applyFullRange()
    })
    ro.observe(container)

    return () => {
      ro.disconnect()
      clearAllTimers()
      api.remove()
      chartRef.current = null
      candleRef.current = null
      emaRef.current = null
      stopLineRef.current = null
      targetLineRef.current = null
    }
  }, [bodyPaintMode, chartBars, clearAllTimers, emaSeriesData, paintedSlice, placeStopAndTargetLines, reducedMotion, setup])

  /* Bar-by-bar reveal — setTimeout chain with deceleration. */
  useEffect(() => {
    if (reducedMotion) return
    if (phase !== "playing") return
    const candle = candleRef.current
    const ema = emaRef.current
    if (!candle || !ema) return

    const fullRange = { from: -0.5, to: chartBars.length - 0.5 }

    let cumulative = 0
    for (let i = 2; i <= chartBars.length; i++) {
      cumulative += revealDelay(i - 1, setup.signalBarIndex)
      const target = i
      const id = window.setTimeout(() => {
        candle.setData(paintedSlice(target))
        ema.setData(emaSeriesData.slice(0, target))
        chartRef.current?.timeScale().setVisibleLogicalRange(fullRange)
        setRevealedCount(target)
        setCurrentPhaseLabel(phaseAt(setup.phases, target - 1))

        // Arrow marker is only used for legacy (hand-crafted) setups
        // without index-based highlights. Body-paint mode shows the
        // fire bar as a gold candle instead, matching the deep-dive.
        if (
          !bodyPaintMode &&
          !markersPlacedRef.current &&
          target >= setup.signalBarIndex + 1
        ) {
          const sig = chartBars[setup.signalBarIndex]
          createSeriesMarkers(candle, [
            {
              time: sig.time,
              position: setup.direction === "long" ? "belowBar" : "aboveBar",
              color: PALETTE.signalGold,
              shape: setup.direction === "long" ? "arrowUp" : "arrowDown",
              text: "signal",
            } as SeriesMarker<Time>,
          ])
          markersPlacedRef.current = true
        }

        // Stop/target lines fade in two bars after the signal triangle.
        if (target >= setup.signalBarIndex + 2) {
          placeStopAndTargetLines()
        }

        if (target === chartBars.length) {
          setPhase("revealed")
        }
      }, cumulative) as unknown as number
      chainTimersRef.current.push(id)
    }

    return () => {
      for (const t of chainTimersRef.current) window.clearTimeout(t)
      chainTimersRef.current = []
    }
  }, [phase, chartBars, emaSeriesData, paintedSlice, placeStopAndTargetLines, setup, reducedMotion, bodyPaintMode])

  /* Cycle to next setup after the dwell window. Single-setup mode
     (live candidate) skips cycling entirely. */
  useEffect(() => {
    if (phase !== "revealed") return
    if (reducedMotion) return
    if (setups.length < 2) return
    cycleTimerRef.current = window.setTimeout(() => {
      setSetupIdx((i) => (i + 1) % setups.length)
      setRevealedCount(0)
      setPhase("playing")
    }, REVEAL_HOLD_MS) as unknown as number
    return () => {
      if (cycleTimerRef.current !== null) {
        window.clearTimeout(cycleTimerRef.current)
        cycleTimerRef.current = null
      }
    }
  }, [phase, reducedMotion, setups.length])

  /* ---------- render ---------- */

  const statusLine =
    phase === "playing"
      ? `bar ${String(revealedCount).padStart(2, "0")} / ${String(chartBars.length).padStart(2, "0")}`
      : "setup complete"

  const eqValue = setup.edge.eq
  const eqStrong = eqValue >= 0.5

  return (
    <section
      aria-label="Featured Brooks Price Action setup"
      className="relative w-full bg-bg border-b border-border"
    >
      <div className="mx-auto max-w-[1400px] px-4 sm:px-6 lg:px-10 py-6 sm:py-8 lg:py-10">
        {/* Top strip */}
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
          <div className="font-mono text-[12px] sm:text-[13px] tabular-nums tracking-tight flex items-baseline gap-2">
            <span className="text-text font-semibold">{setup.symbol}</span>
            <span className="text-sub">·</span>
            <span className="text-sub">{setup.timeframe}</span>
            <span className="text-sub">·</span>
            <span className="text-sub">{setup.sessionLabel}</span>
          </div>
          <div className="flex items-center gap-3">
            {/* Cycle dots — hidden when only one setup is in rotation. */}
            {setups.length > 1 && (
              <div className="flex items-center gap-[5px]" aria-hidden>
                {setups.map((_, i) => (
                  <span
                    key={i}
                    className={[
                      "w-[5px] h-[5px] rounded-full transition-all duration-300 ease-out",
                      i === setupIdx
                        ? "bg-teal scale-[1.15]"
                        : "bg-border scale-100",
                    ].join(" ")}
                  />
                ))}
              </div>
            )}
            <div
              aria-live="polite"
              className="font-mono text-[10px] uppercase tracking-[0.14em] text-sub tabular-nums"
            >
              {statusLine}
            </div>
          </div>
        </div>

        {/* Chart with overlays */}
        <div className="relative">
          <div
            ref={containerRef}
            className="relative w-full h-[260px] sm:h-[360px] lg:h-[420px] bg-bg rounded-md border border-border overflow-hidden"
          />
          {/* Phase label — top-left */}
          <div
            className={[
              "absolute top-2 left-2 z-10 bg-black/[.78] border border-border rounded px-2 py-[3px]",
              "font-mono text-[10px] leading-[1.2] font-semibold tracking-[0.04em] tabular-nums",
              "transition-opacity duration-200 ease-out",
              currentPhaseLabel ? "opacity-100" : "opacity-0",
            ].join(" ")}
            style={{ color: PALETTE.phaseGold }}
          >
            {currentPhaseLabel || "—"}
          </div>
          {/* ADR badge — top-right */}
          <div
            className={[
              "absolute top-2 right-2 z-10 bg-black/[.78] border border-border rounded px-2 py-[3px]",
              "font-mono text-[10px] leading-[1.2] tabular-nums text-teal",
              "transition-opacity duration-250 ease-out",
              adrVisible ? "opacity-100" : "opacity-0",
            ].join(" ")}
          >
            {setup.adrMultiple.toFixed(2)}× ADR
          </div>
        </div>

        {/* Reveal panel */}
        <div
          aria-hidden={phase !== "revealed"}
          className={[
            "mt-4 grid grid-cols-1 sm:grid-cols-[1fr_auto] items-center gap-3 sm:gap-6",
            "transition-opacity ease-out",
            phase === "revealed"
              ? "opacity-100"
              : "opacity-0 pointer-events-none",
          ].join(" ")}
          style={{
            transitionDuration: `${ENTRY_FADE_MS}ms`,
            transitionDelay: phase === "revealed" ? "120ms" : "0ms",
          }}
        >
          <div className="flex flex-col gap-1">
            <div className="font-mono text-[13px] sm:text-[14px] leading-snug text-text">
              <span className="text-sub uppercase tracking-[0.12em] text-[10px] mr-2 align-middle">
                read
              </span>
              <span className="align-middle">{setup.read}</span>
            </div>
            <div
              className={[
                "font-mono text-[11px] text-sub tabular-nums",
                "transition-opacity ease-out",
                phase === "revealed" ? "opacity-100" : "opacity-0",
              ].join(" ")}
              style={{
                transitionDuration: "400ms",
                transitionDelay: phase === "revealed" ? "600ms" : "0ms",
              }}
            >
              <span className="uppercase tracking-[0.12em] text-[10px] mr-1.5">
                trader&apos;s eq
              </span>
              <span
                className={`font-semibold ${eqStrong ? "text-teal" : "text-sub"}`}
              >
                {eqValue >= 0 ? "+" : ""}
                {eqValue.toFixed(2)}R
              </span>
              <span className="text-sub ml-1.5">· {setup.edge.note}</span>
              <Link
                href={setup.deepDiveHref ?? `/symbol/${encodeURIComponent(setup.symbol)}`}
                className={[
                  "group inline-flex items-baseline gap-1 ml-3",
                  "text-teal hover:text-text",
                  "border-b border-transparent hover:border-teal pb-px",
                  "transition-colors duration-200 ease-out",
                  phase === "revealed" ? "opacity-100" : "opacity-0",
                ].join(" ")}
                style={{
                  transition:
                    phase === "revealed"
                      ? "opacity 400ms ease-out 800ms, color 200ms ease-out, border-color 200ms ease-out"
                      : undefined,
                }}
                tabIndex={phase === "revealed" ? 0 : -1}
                aria-hidden={phase !== "revealed"}
              >
                <span>deep dive on ${setup.symbol}</span>
                <span className="transition-transform duration-200 ease-out group-hover:translate-x-[2px]">
                  →
                </span>
              </Link>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 sm:gap-4">
            <SignalBadge signal={setup.signal} />
            <ScoreBar label="URG" value={setup.urgency} variant="urgency" />
            <ScoreBar
              label="UNC"
              value={setup.uncertainty}
              variant="uncertainty"
            />
          </div>
        </div>
      </div>
    </section>
  )
}
