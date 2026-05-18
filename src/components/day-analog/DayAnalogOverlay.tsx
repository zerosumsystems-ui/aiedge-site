'use client'

import { useEffect, useRef, useState } from 'react'
import {
  createChart,
  LineSeries,
  ColorType,
  LineStyle,
  type IChartApi,
  type UTCTimestamp,
  type Time,
} from 'lightweight-charts'
import type { Bar } from '@/lib/types'

/**
 * DayAnalogOverlay — all six sessions (query + 5 analogs) plotted on a
 * single %-from-open axis so their intraday shapes can be compared at a
 * glance. Each session's value at bar i is the close measured against
 * that session's own 09:30 open: (close − open0) / open0 × 100.
 *
 * Every series shares the QUERY session's bar timestamps as the x-axis,
 * so bar i of an analog lines up with bar i of the query regardless of
 * the analog's real calendar date — the comparison is shape, not date.
 */

type AnalogSession = {
  rank: number
  date: string
  bars: Bar[]
}

interface Props {
  query: { date: string; bars: Bar[] }
  analogs: AnalogSession[]
}

const BG = '#1A1A1A'
const GRID = '#252525'
const AXIS = '#333333'
const TEXT = '#9BA1A6'
const QUERY_LINE = '#e8e8e8'
const ANALOG_LINE = '#00c896'

const ET_TIME_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  hour: 'numeric',
  minute: '2-digit',
  hour12: false,
})

function formatEtTime(time: Time): string {
  if (typeof time === 'number') {
    return ET_TIME_FORMATTER.format(new Date(time * 1000))
  }
  if (typeof time === 'string') return time
  return `${time.year}-${String(time.month).padStart(2, '0')}-${String(time.day).padStart(2, '0')}`
}

/** Close as a percent move from the session's first-bar open. */
function pctFromOpen(bars: Bar[]): number[] {
  if (bars.length === 0) return []
  const open0 = bars[0].o
  if (!open0) return bars.map(() => 0)
  return bars.map((b) => ((b.c - open0) / open0) * 100)
}

export function DayAnalogOverlay({ query, analogs }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const [layoutReady, setLayoutReady] = useState(false)
  const height = 320

  useEffect(() => {
    const container = containerRef.current
    if (!container || query.bars.length === 0) return
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
  }, [query])

  useEffect(() => {
    const container = containerRef.current
    if (!layoutReady || !container || query.bars.length === 0) return

    const initialWidth = Math.floor(container.clientWidth)
    if (initialWidth <= 0) return

    // The query session's bar timestamps become the shared x-axis. Each
    // analog series is re-keyed onto these times by bar index so all six
    // lines bar-align.
    const times = query.bars.map((b) => b.t as UTCTimestamp)

    const api = createChart(container, {
      height,
      width: initialWidth,
      autoSize: false,
      layout: {
        background: { type: ColorType.Solid, color: BG },
        textColor: TEXT,
        fontSize: 11,
        fontFamily: 'var(--font-sans), system-ui, sans-serif',
        attributionLogo: false,
      },
      localization: {
        timeFormatter: (time: Time) => formatEtTime(time),
        priceFormatter: (price: number) => `${price >= 0 ? '+' : ''}${price.toFixed(2)}%`,
      },
      grid: {
        vertLines: { color: GRID },
        horzLines: { color: GRID },
      },
      rightPriceScale: {
        visible: true,
        borderColor: AXIS,
        scaleMargins: { top: 0.12, bottom: 0.12 },
      },
      timeScale: {
        visible: true,
        borderColor: AXIS,
        timeVisible: true,
        secondsVisible: false,
        tickMarkFormatter: (time: Time) => formatEtTime(time),
      },
      crosshair: {
        mode: 1, // Magnet
        vertLine: { color: '#555', width: 1, style: LineStyle.Dotted },
        horzLine: { color: '#555', width: 1, style: LineStyle.Dotted },
      },
      handleScroll: { vertTouchDrag: false },
      handleScale: true,
    })
    chartRef.current = api

    // Analogs first so the bright query line draws on top.
    for (const analog of analogs) {
      const values = pctFromOpen(analog.bars)
      const analogSeries = api.addSeries(LineSeries, {
        color: ANALOG_LINE,
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      })
      analogSeries.setData(
        values
          .slice(0, times.length)
          .map((value, i) => ({ time: times[i], value }))
      )
    }

    const queryValues = pctFromOpen(query.bars)
    const querySeries = api.addSeries(LineSeries, {
      color: QUERY_LINE,
      lineWidth: 3,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    })
    querySeries.setData(queryValues.map((value, i) => ({ time: times[i], value })))

    api.timeScale().fitContent()

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const width = Math.floor(entry.contentRect.width)
        if (width <= 0) continue
        api.applyOptions({ width, height })
        api.timeScale().fitContent()
      }
    })
    ro.observe(container)

    return () => {
      ro.disconnect()
      api.remove()
      chartRef.current = null
    }
  }, [query, analogs, layoutReady])

  return (
    <div className="rounded-md border border-border bg-surface">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-3 py-2">
        <span className="text-xs font-semibold text-text">
          Overlay — % from 09:30 open
        </span>
        <div className="flex items-center gap-3 font-mono text-[10px]">
          <span className="flex items-center gap-1">
            <span
              className="inline-block h-[3px] w-3.5"
              style={{ background: QUERY_LINE }}
            />
            <span className="text-sub">query</span>
          </span>
          <span className="flex items-center gap-1">
            <span
              className="inline-block h-[1px] w-3.5"
              style={{ background: ANALOG_LINE }}
            />
            <span className="text-sub">analogs</span>
          </span>
        </div>
      </div>
      <div className="border-t border-border/60">
        <div ref={containerRef} style={{ height, width: '100%', touchAction: 'pan-y' }} />
      </div>
    </div>
  )
}
