'use client'

import { useEffect, useRef } from 'react'
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
} from 'lightweight-charts'
import type { ChartData, SignalDirection } from '@/lib/types'

interface Props {
  chart?: ChartData
  height?: number
  compact?: boolean           // hide volume + badges (used on ScannerCard)
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

function markerShape(direction: SignalDirection): SeriesMarker<Time>['shape'] {
  return direction === 'long' ? 'arrowUp' : 'arrowDown'
}

export function LightweightChart({ chart, height = 360, compact = false }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container || !chart || !chart.bars || chart.bars.length === 0) return

    const api = createChart(container, {
      height,
      width: container.clientWidth,
      autoSize: false,
      layout: {
        background: { type: ColorType.Solid, color: BG },
        textColor: TEXT,
        fontSize: 11,
        fontFamily: 'var(--font-geist-sans), system-ui, sans-serif',
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: GRID },
        horzLines: { color: GRID },
      },
      rightPriceScale: {
        borderColor: AXIS,
        scaleMargins: compact ? { top: 0.08, bottom: 0.08 } : { top: 0.08, bottom: 0.28 },
      },
      timeScale: {
        borderColor: AXIS,
        timeVisible: true,
        secondsVisible: false,
      },
      crosshair: {
        mode: 1, // Magnet
        vertLine: { color: '#555', width: 1, style: LineStyle.Dotted },
        horzLine: { color: '#555', width: 1, style: LineStyle.Dotted },
      },
      // iOS: let vertical touch drags pass through to the page so the user
      // can scroll past a chart. Horizontal pans still work to move the timescale.
      handleScroll: {
        vertTouchDrag: false,
      },
    })
    chartRef.current = api

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

    const candleData = chart.bars.map((b) => ({
      time: b.t as UTCTimestamp,
      open: b.o,
      high: b.h,
      low: b.l,
      close: b.c,
    }))
    candleSeries.setData(candleData)

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
      if (a.signalBar) {
        createSeriesMarkers(candleSeries, [
          {
            time: a.signalBar.time as UTCTimestamp,
            position: a.signalBar.direction === 'long' ? 'belowBar' : 'aboveBar',
            color: '#FFD700',
            shape: markerShape(a.signalBar.direction),
            text: 'signal',
          },
        ])
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

    api.timeScale().fitContent()

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        api.applyOptions({ width: entry.contentRect.width, height })
      }
    })
    ro.observe(container)

    return () => {
      ro.disconnect()
      api.remove()
      chartRef.current = null
    }
  }, [chart, height, compact])

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
        style={{ height, width: '100%', touchAction: 'pan-y' }}
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
