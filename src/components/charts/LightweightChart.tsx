'use client'

import { useEffect, useRef, useState } from 'react'
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  createSeriesMarkers,
  ColorType,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
  type SeriesMarker,
  type Time,
  type LogicalRange,
} from 'lightweight-charts'
import type { ChartData, SignalDirection } from '@/lib/types'

interface Props {
  chart?: ChartData
  height?: number
  compact?: boolean           // hide volume + badges (used on ScannerCard)
  hideScales?: boolean
  fitContent?: boolean
  logicalRange?: { from: number; to: number }
  interactive?: boolean
  /** Overlay a 20-period EMA on the candles (matches /chart default). */
  showEma?: boolean
}

const EMA_COLOR = '#E6C14A'
const EMA_PERIOD = 20

function computeEma(values: { time: UTCTimestamp; close: number }[], period: number) {
  if (values.length === 0) return []
  const k = 2 / (period + 1)
  const out: { time: UTCTimestamp; value: number }[] = []
  let ema = values[0].close
  for (let i = 0; i < values.length; i++) {
    ema = i === 0 ? values[i].close : values[i].close * k + ema * (1 - k)
    if (i >= period - 1) out.push({ time: values[i].time, value: ema })
  }
  return out
}

const TEAL = '#00C896'
const TEAL_VOL = 'rgba(0,200,150,0.42)'
const RED = '#EF5350'
const RED_VOL = 'rgba(239,83,80,0.42)'
const GRID = '#252525'
const AXIS = '#333333'
const TEXT = '#9BA1A6'
const BG = '#1A1A1A'

const LEVEL_COLORS = {
  priorClose: '#888888',
  priorDayHigh: '#C9A227',
  priorDayLow: '#C9A227',
  overnightHigh: '#6E737A',
  overnightLow: '#6E737A',
  premarketHigh: '#5BA8E6',
  premarketLow: '#5BA8E6',
}

const LEVEL_LABELS: Record<keyof typeof LEVEL_COLORS, string> = {
  priorClose: 'PDC',
  priorDayHigh: 'PDH',
  priorDayLow: 'PDL',
  overnightHigh: 'ONH',
  overnightLow: 'ONL',
  premarketHigh: 'PMH',
  premarketLow: 'PML',
}

const ET_TIME_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  hour: 'numeric',
  minute: '2-digit',
  hour12: false,
})

const ET_DATE_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  month: 'short',
  day: 'numeric',
})

function formatEtTime(time: Time): string | null {
  if (typeof time === 'number') {
    return ET_TIME_FORMATTER.format(new Date(time * 1000))
  }
  if (typeof time === 'string') return time
  return `${time.year}-${String(time.month).padStart(2, '0')}-${String(time.day).padStart(2, '0')}`
}

function formatEtDate(time: Time): string | null {
  if (typeof time === 'number') {
    return ET_DATE_FORMATTER.format(new Date(time * 1000))
  }
  if (typeof time === 'string') {
    const date = new Date(`${time}T12:00:00-05:00`)
    return Number.isNaN(date.getTime()) ? time : ET_DATE_FORMATTER.format(date)
  }
  const date = new Date(Date.UTC(time.year, time.month - 1, time.day, 17, 0, 0))
  return ET_DATE_FORMATTER.format(date)
}

function formatChartTime(time: Time, dateOnly: boolean): string {
  return (dateOnly ? formatEtDate(time) : formatEtTime(time)) ?? ''
}

function markerShape(direction: SignalDirection): SeriesMarker<Time>['shape'] {
  return direction === 'long' ? 'arrowUp' : 'arrowDown'
}

export function LightweightChart({
  chart,
  height = 360,
  compact = false,
  hideScales = false,
  fitContent = true,
  logicalRange,
  interactive = true,
  showEma = false,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const [layoutReady, setLayoutReady] = useState(false)

  useEffect(() => {
    const container = containerRef.current
    if (!container || !chart || !chart.bars || chart.bars.length === 0) return
    let cancelled = false
    let frame: number | null = null

    function markReadyWhenVisible() {
      const width = Math.floor(container?.clientWidth ?? 0)
      if (!cancelled && width > 0) setLayoutReady(true)
    }

    frame = window.requestAnimationFrame(markReadyWhenVisible)
    const ro = new ResizeObserver(markReadyWhenVisible)
    ro.observe(container)
    return () => {
      cancelled = true
      if (frame !== null) window.cancelAnimationFrame(frame)
      ro.disconnect()
    }
  }, [chart])

  useEffect(() => {
    const container = containerRef.current
    if (!layoutReady || !container || !chart || !chart.bars || chart.bars.length === 0) return

    const dateOnly = chart.timeframe === 'daily' || chart.timeframe === 'weekly'
    const initialWidth = Math.floor(container.clientWidth)
    if (initialWidth <= 0) return
    const api = createChart(container, {
      height,
      width: initialWidth,
      autoSize: false,
      layout: {
        background: { type: ColorType.Solid, color: BG },
        textColor: TEXT,
        fontSize: 11,
        fontFamily: 'var(--font-geist-sans), system-ui, sans-serif',
        attributionLogo: false,
      },
      localization: {
        timeFormatter: (time: Time) => formatChartTime(time, dateOnly),
      },
      grid: {
        vertLines: { color: hideScales ? 'transparent' : GRID },
        horzLines: { color: hideScales ? 'transparent' : GRID },
      },
      rightPriceScale: {
        visible: !hideScales,
        borderColor: AXIS,
        scaleMargins: compact ? { top: 0.08, bottom: 0.08 } : { top: 0.08, bottom: 0.28 },
      },
      timeScale: {
        visible: !hideScales,
        borderColor: AXIS,
        timeVisible: !dateOnly,
        secondsVisible: false,
        tickMarkFormatter: (time: Time) => formatChartTime(time, dateOnly),
      },
      crosshair: {
        mode: 1, // Magnet
        vertLine: { color: '#555', width: 1, style: LineStyle.Dotted },
        horzLine: { color: '#555', width: 1, style: LineStyle.Dotted },
      },
      // iOS: let vertical touch drags pass through to the page so the user
      // can scroll past a chart. Horizontal pans still work to move the
      // timescale unless the chart is intentionally locked.
      handleScroll: interactive ? { vertTouchDrag: false } : false,
      handleScale: interactive,
    })
    chartRef.current = api
    let rangeFrame: number | null = null
    let settleFrame: number | null = null
    const settleTimers: number[] = []

    function applyVisibleRange() {
      if (logicalRange) {
        api.timeScale().setVisibleLogicalRange(logicalRange as unknown as LogicalRange)
      } else if (fitContent) {
        api.timeScale().fitContent()
      }
    }

    function scheduleVisibleRange() {
      if (rangeFrame !== null) window.cancelAnimationFrame(rangeFrame)
      if (settleFrame !== null) window.cancelAnimationFrame(settleFrame)
      rangeFrame = window.requestAnimationFrame(() => {
        rangeFrame = null
        applyVisibleRange()
        settleFrame = window.requestAnimationFrame(() => {
          settleFrame = null
          applyVisibleRange()
        })
      })
    }

    const candleSeries: ISeriesApi<'Candlestick'> = api.addSeries(CandlestickSeries, {
      upColor: TEAL,
      downColor: RED,
      borderUpColor: TEAL,
      borderDownColor: RED,
      wickUpColor: TEAL,
      wickDownColor: RED,
      priceLineVisible: false,
      lastValueVisible: false,
    })

    // Build per-bar color overrides from annotations.highlightBars.
    // Later entries override earlier ones (Map.set semantics), so the
    // caller controls precedence by order: strong-bar purples first,
    // fire-bar gold last, etc. The Brooks-strong decision is made by
    // the Python detector and stored in setup_candidates.strong_bar_ts
    // — the chart no longer re-applies the rule.
    const highlightByTime = new Map<number, string>()
    for (const h of chart.annotations?.highlightBars ?? []) {
      highlightByTime.set(h.time, h.color)
    }
    const candleData = chart.bars.map((b) => {
      const hl = highlightByTime.get(b.t)
      if (hl) {
        return {
          time: b.t as UTCTimestamp,
          open: b.o,
          high: b.h,
          low: b.l,
          close: b.c,
          color: hl,
          borderColor: hl,
          wickColor: hl,
        }
      }
      return {
        time: b.t as UTCTimestamp,
        open: b.o,
        high: b.h,
        low: b.l,
        close: b.c,
      }
    })
    candleSeries.setData(candleData)

    // Pivot price line — dotted horizontal at the LOD/HOD bar's
    // extreme. Drawn as a price line rather than a colored candle so
    // the level reads as a structural anchor across the whole chart.
    const pivot = chart.annotations?.pivotPriceLine
    if (pivot) {
      const pivotBar = chart.bars.find((b) => b.t === pivot.time)
      if (pivotBar) {
        const price = pivot.direction === 'long' ? pivotBar.l : pivotBar.h
        candleSeries.createPriceLine({
          price,
          color: pivot.color,
          lineWidth: 1,
          lineStyle: LineStyle.Dotted,
          axisLabelVisible: true,
          title: pivot.label ?? (pivot.direction === 'long' ? 'LOD' : 'HOD'),
        })
      }
    }

    // EMA20 overlay — visual parity with /chart. Only when caller opts in.
    if (showEma && chart.bars.length >= EMA_PERIOD) {
      const emaSeries = api.addSeries(LineSeries, {
        color: EMA_COLOR,
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      })
      emaSeries.setData(
        computeEma(
          chart.bars.map((b) => ({ time: b.t as UTCTimestamp, close: b.c })),
          EMA_PERIOD
        )
      )
    }

    // Volume pane (hidden in compact mode)
    if (!compact && chart.bars.some((b) => typeof b.v === 'number' && (b.v ?? 0) > 0)) {
      const volSeries = api.addSeries(HistogramSeries, {
        priceFormat: { type: 'volume' },
        priceScaleId: 'vol',
        lastValueVisible: false,
        priceLineVisible: false,
      })
      api.priceScale('vol').applyOptions({
        scaleMargins: { top: 0.78, bottom: 0 },
      })
      volSeries.setData(
        chart.bars.map((b) => ({
          time: b.t as UTCTimestamp,
          value: b.v ?? 0,
          color: b.c >= b.o ? TEAL_VOL : RED_VOL,
        }))
      )
    }

    // Key levels — horizontal price lines
    if (chart.keyLevels) {
      for (const k of Object.keys(LEVEL_COLORS) as (keyof typeof LEVEL_COLORS)[]) {
        const price = chart.keyLevels[k]
        if (typeof price !== 'number' || !isFinite(price)) continue
        candleSeries.createPriceLine({
          price,
          color: LEVEL_COLORS[k],
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: !compact,
          title: LEVEL_LABELS[k],
        })
      }
    }

    // Annotation overlays
    const a = chart.annotations
    if (a) {
      if (typeof a.stopPrice === 'number') {
        candleSeries.createPriceLine({
          price: a.stopPrice,
          color: RED,
          lineWidth: 2,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: 'STOP',
        })
      }
      if (typeof a.targetPrice === 'number') {
        candleSeries.createPriceLine({
          price: a.targetPrice,
          color: TEAL,
          lineWidth: 2,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: 'TARGET',
        })
      }
      // Collect all markers (signal + entry + exit) into one call — the API
      // supports multiple markers per series.
      const markers: SeriesMarker<Time>[] = []
      if (a.signalBar) {
        markers.push({
          time: a.signalBar.time as UTCTimestamp,
          position: a.signalBar.direction === 'long' ? 'belowBar' : 'aboveBar',
          color: '#FFD700',
          shape: markerShape(a.signalBar.direction),
          text: 'signal',
        })
      }
      if (a.entryMarker) {
        markers.push({
          time: a.entryMarker.time as UTCTimestamp,
          position: a.entryMarker.direction === 'long' ? 'belowBar' : 'aboveBar',
          color: TEAL,
          shape: markerShape(a.entryMarker.direction),
          text: 'BUY',
        })
      }
      if (a.exitMarker) {
        markers.push({
          time: a.exitMarker.time as UTCTimestamp,
          position: a.exitMarker.direction === 'long' ? 'belowBar' : 'aboveBar',
          color: RED,
          shape: markerShape(a.exitMarker.direction),
          text: 'SELL',
        })
      }
      if (a.markers) {
        for (const marker of a.markers) {
          markers.push({
            time: marker.time as UTCTimestamp,
            position: marker.position ?? 'aboveBar',
            color: marker.color ?? '#FFD700',
            shape: marker.shape ?? 'circle',
            text: marker.text,
          })
        }
      }
      if (markers.length > 0) createSeriesMarkers(candleSeries, markers)

      // Entry + exit price lines (for round-trip journal charts). Solid lines
      // distinguish them from the dashed STOP/TARGET planning lines.
      if (typeof a.entryPrice === 'number') {
        candleSeries.createPriceLine({
          price: a.entryPrice,
          color: TEAL,
          lineWidth: 1,
          lineStyle: LineStyle.Solid,
          axisLabelVisible: true,
          title: 'ENTRY',
        })
      }
      if (typeof a.exitPrice === 'number') {
        candleSeries.createPriceLine({
          price: a.exitPrice,
          color: '#FFD700',
          lineWidth: 1,
          lineStyle: LineStyle.Solid,
          axisLabelVisible: true,
          title: 'EXIT',
        })
      }
      if (a.trendline) {
        const trendSeries = api.addSeries(LineSeries, {
          color: '#FFD700',
          lineWidth: 2,
          lineStyle: LineStyle.Solid,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
        })
        trendSeries.setData([
          { time: a.trendline.from.t as UTCTimestamp, value: a.trendline.from.price },
          { time: a.trendline.to.t as UTCTimestamp, value: a.trendline.to.price },
        ])
      }
    }

    scheduleVisibleRange()
    settleTimers.push(
      window.setTimeout(scheduleVisibleRange, 80),
      window.setTimeout(scheduleVisibleRange, 240),
      window.setTimeout(scheduleVisibleRange, 600)
    )

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const width = Math.floor(entry.contentRect.width)
        if (width <= 0) continue
        api.applyOptions({ width, height })
        scheduleVisibleRange()
      }
    })
    ro.observe(container)

    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) scheduleVisibleRange()
      }
    })
    io.observe(container)

    return () => {
      if (rangeFrame !== null) window.cancelAnimationFrame(rangeFrame)
      if (settleFrame !== null) window.cancelAnimationFrame(settleFrame)
      for (const timer of settleTimers) window.clearTimeout(timer)
      ro.disconnect()
      io.disconnect()
      api.remove()
      chartRef.current = null
    }
  }, [chart, height, compact, hideScales, fitContent, interactive, logicalRange, layoutReady, showEma])

  if (!chart || !chart.bars || chart.bars.length === 0) {
    return (
      <div
        className="w-full flex items-center justify-center text-xs text-sub bg-bg border border-border rounded"
        style={{ height }}
      >
        No chart data
      </div>
    )
  }

  const a = chart.annotations

  return (
    <div className="relative w-full rounded-lg overflow-hidden border border-border bg-[#1A1A1A]">
      <div
        ref={containerRef}
        style={{ height, width: '100%', touchAction: interactive ? 'pan-y' : 'auto' }}
      />

      {!compact && a && (a.phaseLabel || a.alwaysIn || a.strength) && (
        <div className="absolute top-2 left-2 z-10 bg-black/75 border border-border rounded px-2 py-1 text-[10px] leading-tight font-mono">
          {a.phaseLabel && <div className="text-[#E6C14A] font-semibold tracking-wide">{a.phaseLabel}</div>}
          {(a.alwaysIn || a.strength) && (
            <div className="text-sub">
              {a.alwaysIn && <span>AI: <span className="text-text">{a.alwaysIn}</span></span>}
              {a.alwaysIn && a.strength && <span> · </span>}
              {a.strength && <span>net <span className="text-text">{a.strength}</span></span>}
            </div>
          )}
        </div>
      )}

      {!compact && a && typeof a.adrMultiple === 'number' && (
        <div className="absolute top-2 right-2 z-10 bg-black/75 border border-border rounded px-2 py-1 text-[10px] font-mono text-teal tabular-nums">
          {a.adrMultiple.toFixed(2)}× ADR
        </div>
      )}

      {!compact && a && a.verdict && (
        <div className="absolute bottom-2 right-2 z-10 bg-black/75 border border-border rounded px-2 py-1 text-[10px] font-mono">
          <span className="text-teal font-semibold">{a.verdict.decision}</span>
          <span className="text-sub">
            {' · '}p={a.verdict.probability}% · R:R {a.verdict.rr.toFixed(1)}
          </span>
        </div>
      )}

      {!compact && a && a.agreement && (
        <div className="absolute bottom-2 left-2 z-10 text-[9px] text-sub/60 font-mono uppercase tracking-wider pointer-events-none">
          vs scanner: {a.agreement}
        </div>
      )}
    </div>
  )
}
