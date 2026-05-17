'use client'

import { useEffect, useState } from 'react'
import { LightweightChart } from '@/components/charts/LightweightChart'
import type { Bar, ChartData } from '@/lib/types'

type Verdict = {
  label: string
  n: number
  target_hit_rate: number
  expectancy_r: number
  expectancy_ci95: [number, number]
  win_rate: number
  avg_win_r: number
  avg_loss_r: number
  profit_factor: number
  total_r: number
  max_drawdown_r: number
}

type EmaTouchExample = {
  symbol: string
  session_date: string
  direction: 'long' | 'short'
  variant: string
  variant_label: string
  ema_period: number
  bars: Bar[]
  touch_bar_ts: number[]
  entry_price: number
  stop_price: number
  target_price: number
  exit_price: number
  exit_reason: string
  net_r: number
  mfe_r: number
  mae_r: number
  mfe: number
  mae: number
  bars_held: number
}

type Payload = {
  generated_from: string
  verdict: Verdict
  opening_verdict: Verdict
  examples: EmaTouchExample[]
}

const EXIT_STYLES: Record<string, { label: string; cls: string }> = {
  target: { label: 'hit target', cls: 'text-teal' },
  stop: { label: 'stopped out', cls: 'text-red' },
  stop_straddle: { label: 'stopped out', cls: 'text-red' },
  time: { label: 'timed out', cls: 'text-sub' },
  timeout: { label: 'timed out', cls: 'text-sub' },
}

function pct(value: number) {
  return `${Math.round(value * 100)}%`
}

function signed(value: number, digits = 2) {
  return `${value >= 0 ? '+' : ''}${value.toFixed(digits)}`
}

function ExampleCard({ ex }: { ex: EmaTouchExample }) {
  const chart: ChartData = {
    bars: ex.bars,
    timeframe: '5min',
    annotations: {
      highlightBars: ex.touch_bar_ts.map((time) => ({ time, color: '#fbbf24' })),
      entryPrice: ex.entry_price,
      stopPrice: ex.stop_price,
      targetPrice: ex.target_price,
    },
  }
  const exit = EXIT_STYLES[ex.exit_reason] ?? { label: ex.exit_reason, cls: 'text-sub' }
  const dirClass = ex.direction === 'long' ? 'text-teal' : 'text-red'
  const rClass = ex.net_r >= 0 ? 'text-teal' : 'text-red'

  return (
    <div className="overflow-hidden rounded-md border border-border bg-surface">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-3 py-2">
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-sm font-semibold text-text">{ex.symbol}</span>
          <span className="font-mono text-[11px] text-sub tabular-nums">{ex.session_date}</span>
          <span className={`text-[10px] font-semibold uppercase tracking-wide ${dirClass}`}>
            {ex.direction}
          </span>
        </div>
        <div className="flex items-baseline gap-2 font-mono text-[11px] tabular-nums">
          <span className={exit.cls}>{exit.label}</span>
          <span className={`font-semibold ${rClass}`}>{signed(ex.net_r)}R</span>
        </div>
      </div>
      <div className="border-t border-border/60">
        <LightweightChart
          chart={chart}
          height={240}
          interactive={false}
          hideScales={false}
        />
      </div>
      <div className="px-3 py-1.5 font-mono text-[10px] tabular-nums text-sub">
        {ex.variant_label} first touch | entry {ex.entry_price.toFixed(2)} | stop{' '}
        {ex.stop_price.toFixed(2)} | target {ex.target_price.toFixed(2)} | MFE{' '}
        {signed(ex.mfe_r)}R | MAE {signed(ex.mae_r)}R | held {ex.bars_held} bars
      </div>
    </div>
  )
}

export function EmaTouchesView() {
  const [data, setData] = useState<Payload | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    fetch('/ema-touches/examples.json', { signal: controller.signal })
      .then((response) =>
        response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`))
      )
      .then((payload: Payload) => setData(payload))
      .catch((err) => {
        if (!controller.signal.aborted) {
          setError(err instanceof Error ? err.message : String(err))
        }
      })
    return () => controller.abort()
  }, [])

  return (
    <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 sm:py-8 lg:px-10">
      <header className="mb-5">
        <h1 className="text-2xl font-bold tracking-tight">EMA Touches</h1>
        <p className="mt-1 max-w-3xl text-xs leading-relaxed text-sub">
          A study gallery of the first pullback into the 10 EMA or 20 EMA after a small
          trend. Each chart paints the first EMA-touch bar gold, with the entry, stop,
          and target plotted in the same card format as the AI Edge spikes study.
        </p>
      </header>

      {data && (
        <div className="mb-5 rounded-md border border-border bg-surface px-4 py-3 text-xs leading-relaxed text-sub">
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-sub">
            Backtest verdict
          </span>
          <p className="mt-1.5">
            Tested on {data.verdict.n.toLocaleString()} first-EMA-touch variant trades.
            The focus cohort, <span className="text-text">{data.opening_verdict.label}</span>,
            has {data.opening_verdict.n.toLocaleString()} trades,{' '}
            <span className="font-semibold text-text">{pct(data.opening_verdict.win_rate)}</span>{' '}
            wins, expectancy{' '}
            <span className="font-mono text-text">
              {signed(data.opening_verdict.expectancy_r, 3)}R
            </span>{' '}
            (95% CI [{data.opening_verdict.expectancy_ci95[0].toFixed(3)},{' '}
            {data.opening_verdict.expectancy_ci95[1].toFixed(3)}]), profit factor{' '}
            <span className="font-mono text-text">
              {data.opening_verdict.profit_factor.toFixed(2)}
            </span>
            , total{' '}
            <span className="font-mono text-text">{signed(data.opening_verdict.total_r, 2)}R</span>.
            This page is for visual audit and replay, not a live signal.
          </p>
        </div>
      )}

      {error && (
        <div className="rounded-md border border-red/40 bg-red/10 px-3 py-2 text-xs text-red">
          {error}
        </div>
      )}
      {!error && data === null && <div className="text-xs text-sub">Loading...</div>}
      {data && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data.examples.map((example, index) => (
            <ExampleCard
              key={`${example.symbol}-${example.session_date}-${example.variant}-${index}`}
              ex={example}
            />
          ))}
        </div>
      )}
    </main>
  )
}
