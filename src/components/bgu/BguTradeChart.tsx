'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  createChart,
  createSeriesMarkers,
  CandlestickSeries,
  HistogramSeries,
  ColorType,
  LineStyle,
  type IChartApi,
  type Time,
  type SeriesMarker,
} from 'lightweight-charts'
import type { BguTrade } from '@/lib/buyable-gap-up'

interface TradeBar {
  date: string
  open: number
  high: number
  low: number
  close: number
  volume: number
  ema20: number | null
  sma50: number | null
  sma200: number | null
}

interface TradeChartFile {
  ticker: string
  signalDate: string
  signalIndex: number
  bars: TradeBar[]
}

interface Props {
  trade: BguTrade
}

const TEAL = '#26C6DA'
const RED = '#EF5350'
const YELLOW = '#FFD600'
const TEAL_VOL = 'rgba(38,198,218,0.45)'
const RED_VOL = 'rgba(239,83,80,0.45)'
const SIG_VOL = 'rgba(255,214,0,0.85)'
const GRID = '#222222'
const TEXT = '#9BA1A6'
const BG = '#1A1A1A'

function dateToTime(dateStr: string): Time {
  return dateStr as Time
}

export function BguTradeChart({ trade }: Props) {
  const chartRef = useRef<HTMLDivElement>(null)
  const volRef = useRef<HTMLDivElement>(null)
  const [data, setData] = useState<TradeChartFile | null>(null)
  const [error, setError] = useState<string | null>(null)

  const url = useMemo(
    () => `/data/buyable-gap-up/trades/${trade.ticker}_${trade.signalDate}.json`,
    [trade.ticker, trade.signalDate]
  )

  useEffect(() => {
    let cancelled = false
    setData(null)
    setError(null)
    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`fetch failed: ${r.status}`)
        return r.json()
      })
      .then((j: TradeChartFile) => {
        if (!cancelled) setData(j)
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message)
      })
    return () => {
      cancelled = true
    }
  }, [url])

  useEffect(() => {
    if (!data || !chartRef.current || !volRef.current) return
    const priceEl = chartRef.current
    const volEl = volRef.current

    const priceChart: IChartApi = createChart(priceEl, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: BG },
        textColor: TEXT,
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: GRID },
        horzLines: { color: GRID },
      },
      timeScale: {
        timeVisible: false,
        borderColor: GRID,
      },
      rightPriceScale: { borderColor: GRID },
      crosshair: { mode: 1 },
    })

    const volChart: IChartApi = createChart(volEl, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: BG },
        textColor: TEXT,
        attributionLogo: false,
      },
      grid: { vertLines: { color: GRID }, horzLines: { color: GRID } },
      timeScale: { timeVisible: false, borderColor: GRID },
      rightPriceScale: { borderColor: GRID },
      crosshair: { mode: 1 },
    })

    // Sync the two charts' visible time range
    priceChart.timeScale().subscribeVisibleLogicalRangeChange((r) => {
      if (r) volChart.timeScale().setVisibleLogicalRange(r)
    })
    volChart.timeScale().subscribeVisibleLogicalRangeChange((r) => {
      if (r) priceChart.timeScale().setVisibleLogicalRange(r)
    })

    const candles = priceChart.addSeries(CandlestickSeries, {
      upColor: TEAL,
      downColor: RED,
      borderUpColor: TEAL,
      borderDownColor: RED,
      wickUpColor: TEAL,
      wickDownColor: RED,
    })
    candles.setData(
      data.bars.map((b) => ({
        time: dateToTime(b.date),
        open: b.open,
        high: b.high,
        low: b.low,
        close: b.close,
      }))
    )

    // Entry / Stop / Exit horizontal price lines
    candles.createPriceLine({
      price: trade.entryPrice,
      color: TEAL,
      lineWidth: 1,
      lineStyle: LineStyle.Solid,
      axisLabelVisible: true,
      title: `Entry $${trade.entryPrice.toFixed(2)}`,
    })
    candles.createPriceLine({
      price: trade.stopPrice,
      color: RED,
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      axisLabelVisible: true,
      title: `Stop $${trade.stopPrice.toFixed(2)} (${trade.stopDistancePct.toFixed(1)}%)`,
    })
    candles.createPriceLine({
      price: trade.exitPrice,
      color: trade.returnPct > 0 ? TEAL : RED,
      lineWidth: 1,
      lineStyle: LineStyle.Dotted,
      axisLabelVisible: true,
      title: `Exit $${trade.exitPrice.toFixed(2)} (${trade.exitReason})`,
    })

    // Markers: signal day, entry, exit
    const sigBar = data.bars[data.signalIndex]
    const entryBar = data.bars[data.signalIndex + 1]
    const exitBar = data.bars.find((b) => b.date === trade.exitDate)
    const markers: SeriesMarker<Time>[] = []
    if (sigBar) {
      markers.push({
        time: dateToTime(sigBar.date),
        position: 'aboveBar',
        color: YELLOW,
        shape: 'arrowDown',
        text: `EARN +${trade.intradayGainPct.toFixed(1)}%`,
        size: 1,
      } as SeriesMarker<Time>)
    }
    if (entryBar) {
      markers.push({
        time: dateToTime(entryBar.date),
        position: 'belowBar',
        color: TEAL,
        shape: 'arrowUp',
        text: 'ENTRY',
        size: 1,
      } as SeriesMarker<Time>)
    }
    if (exitBar) {
      markers.push({
        time: dateToTime(exitBar.date),
        position: 'belowBar',
        color: trade.returnPct > 0 ? TEAL : RED,
        shape: 'circle',
        text: `EXIT ${trade.returnPct >= 0 ? '+' : ''}${trade.returnPct.toFixed(1)}%`,
        size: 1,
      } as SeriesMarker<Time>)
    }
    if (markers.length > 0) {
      createSeriesMarkers(candles, markers)
    }

    // Volume pane
    const vol = volChart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
    })
    vol.setData(
      data.bars.map((b, i) => ({
        time: dateToTime(b.date),
        value: b.volume,
        color: i === data.signalIndex ? SIG_VOL : b.close >= b.open ? TEAL_VOL : RED_VOL,
      }))
    )

    priceChart.timeScale().fitContent()
    volChart.timeScale().fitContent()

    return () => {
      priceChart.remove()
      volChart.remove()
    }
  }, [data, trade])

  if (error) {
    return (
      <div className="px-3 py-4 text-xs text-red">Failed to load chart: {error}</div>
    )
  }
  if (!data) {
    return (
      <div className="px-3 py-4 text-xs text-sub animate-pulse">Loading chart…</div>
    )
  }

  return (
    <div className="space-y-2 px-3 py-3 bg-bg/40 border-t border-border">
      <div ref={chartRef} className="w-full h-[360px]" />
      <div ref={volRef} className="w-full h-[100px]" />
      <dl className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs pt-2">
        <Detail label="Intraday" value={`+${trade.intradayGainPct.toFixed(1)}%`} />
        <Detail label="Gap" value={`${trade.gapUpPct >= 0 ? '+' : ''}${trade.gapUpPct.toFixed(1)}%`} />
        <Detail label="RVOL" value={`${trade.volumeRvol.toFixed(1)}×`} />
        <Detail label="$-Vol" value={trade.avgDollarVolM != null ? `$${trade.avgDollarVolM.toFixed(0)}M` : '-'} />
        <Detail label="Signal date" value={trade.signalDate} />
        <Detail label="Entry date" value={data.bars[data.signalIndex + 1]?.date ?? '-'} />
        <Detail label="Exit date" value={trade.exitDate} />
        <Detail label="Days held" value={`${trade.daysHeld}d`} />
        <Detail label="MFE" value={`+${trade.mfePct.toFixed(1)}%`} accent />
        <Detail label="MAE" value={`${trade.maePct.toFixed(1)}%`} danger />
        <Detail
          label="Return"
          value={`${trade.returnPct >= 0 ? '+' : ''}${trade.returnPct.toFixed(2)}%`}
          accent={trade.returnPct > 0}
          danger={trade.returnPct <= 0}
        />
        <Detail
          label="R-multiple"
          value={`${trade.rMultiple >= 0 ? '+' : ''}${trade.rMultiple.toFixed(2)}R`}
          accent={trade.rMultiple > 0}
          danger={trade.rMultiple <= 0}
        />
      </dl>
    </div>
  )
}

function Detail({ label, value, accent = false, danger = false }: {
  label: string
  value: string
  accent?: boolean
  danger?: boolean
}) {
  const colorClass = danger ? 'text-red' : accent ? 'text-teal' : 'text-text'
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wider text-sub">{label}</dt>
      <dd className={`mt-0.5 font-mono text-sm font-semibold tabular-nums ${colorClass}`}>
        {value}
      </dd>
    </div>
  )
}
