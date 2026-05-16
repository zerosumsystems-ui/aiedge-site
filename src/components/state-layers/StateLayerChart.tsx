"use client"

import { useEffect, useRef } from "react"
import {
  createChart,
  CandlestickSeries,
  ColorType,
  LineStyle,
  createSeriesMarkers,
  type Time,
  type UTCTimestamp,
  type SeriesMarker,
} from "lightweight-charts"

export type Candle = { o: number; h: number; l: number; c: number }

export type ExampleChart = {
  bars: Candle[]
  level?: { price: number; label: string }
  highlight?: { index: number; label: string }
}

/**
 * Mini bar-by-bar candle reel for a State Layer example. Uses the same
 * lightweight-charts vocabulary as the home-page hero and the deep-dive
 * (/symbol) chart: teal up / red down candles, a gold-painted key bar,
 * and a cyan dotted level line. The reel replays each time the card
 * scrolls into view; reduced-motion just shows the finished chart.
 */
const PALETTE = {
  grid: "#1c1c1c",
  axis: "#2a2a2a",
  text: "#808080",
  teal: "#00c896",
  red: "#e05555",
  signalGold: "#fbbf24",
  levelCyan: "#38bdf8",
}

const BAR_SECONDS = 5 * 60
const REVEAL_MS = 120

export function StateLayerChart({ chart }: { chart: ExampleChart }) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const t0 = Math.floor(Date.UTC(2025, 0, 6, 14, 30) / 1000)
    const data = chart.bars.map((bar, i) => {
      const isKey = chart.highlight?.index === i
      return {
        time: (t0 + i * BAR_SECONDS) as UTCTimestamp,
        open: bar.o,
        high: bar.h,
        low: bar.l,
        close: bar.c,
        ...(isKey
          ? {
              color: PALETTE.signalGold,
              borderColor: PALETTE.signalGold,
              wickColor: PALETTE.signalGold,
            }
          : {}),
      }
    })

    const lows = chart.bars.map((b) => b.l)
    const highs = chart.bars.map((b) => b.h)
    let lo = Math.min(...lows)
    let hi = Math.max(...highs)
    if (chart.level) {
      lo = Math.min(lo, chart.level.price)
      hi = Math.max(hi, chart.level.price)
    }
    const pad = (hi - lo || 1) * 0.08

    const api = createChart(container, {
      width: container.clientWidth,
      height: container.clientHeight,
      autoSize: false,
      layout: {
        background: { type: ColorType.Solid, color: "rgba(0,0,0,0)" },
        textColor: PALETTE.text,
        fontSize: 10,
        fontFamily: 'var(--font-mono), ui-monospace, Menlo, monospace',
        attributionLogo: false,
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { color: PALETTE.grid, style: LineStyle.Solid },
      },
      rightPriceScale: {
        visible: false,
        scaleMargins: { top: 0.12, bottom: 0.12 },
      },
      timeScale: { visible: false },
      crosshair: { mode: 0 },
      handleScroll: false,
      handleScale: false,
    })

    const candle = api.addSeries(CandlestickSeries, {
      upColor: PALETTE.teal,
      downColor: PALETTE.red,
      borderUpColor: PALETTE.teal,
      borderDownColor: PALETTE.red,
      wickUpColor: PALETTE.teal,
      wickDownColor: PALETTE.red,
      priceLineVisible: false,
      lastValueVisible: false,
      autoscaleInfoProvider: () => ({
        priceRange: { minValue: lo - pad, maxValue: hi + pad },
      }),
    })

    if (chart.level) {
      candle.createPriceLine({
        price: chart.level.price,
        color: PALETTE.levelCyan,
        lineWidth: 1,
        lineStyle: LineStyle.Dotted,
        axisLabelVisible: false,
        title: chart.level.label,
      })
    }

    const fullRange = { from: -0.7, to: data.length - 0.3 }
    const applyRange = () => api.timeScale().setVisibleLogicalRange(fullRange)

    const markers: SeriesMarker<Time>[] =
      chart.highlight != null
        ? [
            {
              time: data[chart.highlight.index].time,
              position: "aboveBar",
              color: PALETTE.signalGold,
              shape: "arrowDown",
              text: "",
            },
          ]
        : []
    let markerPlaced = false
    const placeMarker = () => {
      if (markerPlaced || markers.length === 0) return
      createSeriesMarkers(candle, markers)
      markerPlaced = true
    }

    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches

    const timers: number[] = []
    let played = false

    const play = () => {
      if (played) return
      played = true
      for (const t of timers) window.clearTimeout(t)
      timers.length = 0
      candle.setData(data.slice(0, 1))
      applyRange()
      for (let i = 2; i <= data.length; i++) {
        const target = i
        const id = window.setTimeout(() => {
          candle.setData(data.slice(0, target))
          applyRange()
          if (chart.highlight != null && target >= chart.highlight.index + 1) {
            placeMarker()
          }
        }, (i - 1) * REVEAL_MS) as unknown as number
        timers.push(id)
      }
    }

    let observer: IntersectionObserver | null = null
    if (reduced) {
      candle.setData(data)
      placeMarker()
      applyRange()
    } else {
      candle.setData(data.slice(0, 1))
      applyRange()
      observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              play()
              observer?.disconnect()
            }
          }
        },
        { threshold: 0.45 },
      )
      observer.observe(container)
    }

    const resize = new ResizeObserver(() => {
      api.applyOptions({
        width: container.clientWidth,
        height: container.clientHeight,
      })
      applyRange()
    })
    resize.observe(container)

    return () => {
      for (const t of timers) window.clearTimeout(t)
      observer?.disconnect()
      resize.disconnect()
      api.remove()
    }
  }, [chart])

  return (
    <div className="relative mt-3">
      <div
        ref={containerRef}
        className="h-[150px] w-full overflow-hidden rounded border border-border bg-bg"
        role="img"
        aria-label="Animated price-action example for this state layer"
      />
      {chart.highlight ? (
        <div
          className="absolute left-2 top-2 rounded border border-border bg-black/[.78] px-2 py-[3px] font-mono text-[10px] font-semibold tracking-[0.04em]"
          style={{ color: PALETTE.signalGold }}
        >
          {chart.highlight.label}
        </div>
      ) : null}
    </div>
  )
}
