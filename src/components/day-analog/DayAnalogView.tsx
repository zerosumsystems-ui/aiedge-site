'use client'

import { useEffect, useMemo, useState } from 'react'
import { LightweightChart } from '@/components/charts/LightweightChart'
import { DayAnalogOverlay } from '@/components/day-analog/DayAnalogOverlay'
import type { Bar, ChartData } from '@/lib/types'

type QuerySession = {
  date: string
  net: number
  bars: Bar[]
}

type AnalogSession = {
  rank: number
  date: string
  rmse: number
  r: number | null
  net: number
  bars: Bar[]
}

type SymbolEntry = {
  symbol: string
  n_candidates: number
  n_sessions: number
  query: QuerySession
  analogs: AnalogSession[]
}

type Payload = {
  generated: string
  bars_per_session: number
  symbols: SymbolEntry[]
}

function signedPct(value: number, digits = 2) {
  return `${value >= 0 ? '+' : ''}${value.toFixed(digits)}%`
}

function fmtNum(value: number | null, digits = 3) {
  return value === null || Number.isNaN(value) ? '—' : value.toFixed(digits)
}

function QueryCard({ symbol, query }: { symbol: string; query: QuerySession }) {
  const chart: ChartData = { bars: query.bars, timeframe: '5min' }
  const netClass = query.net >= 0 ? 'text-teal' : 'text-red'

  return (
    <div className="overflow-hidden rounded-md border border-border bg-surface">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-3 py-2">
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-sm font-semibold text-text">{symbol}</span>
          <span className="font-mono text-[11px] text-sub tabular-nums">{query.date}</span>
          <span className="text-[10px] font-semibold uppercase tracking-wide text-sub">
            query day
          </span>
        </div>
        <span className={`font-mono text-[11px] font-semibold tabular-nums ${netClass}`}>
          net {signedPct(query.net)}
        </span>
      </div>
      <div className="border-t border-border/60">
        <LightweightChart
          chart={chart}
          height={300}
          interactive={true}
          hideScales={false}
        />
      </div>
    </div>
  )
}

function AnalogCard({ symbol, analog }: { symbol: string; analog: AnalogSession }) {
  const chart: ChartData = { bars: analog.bars, timeframe: '5min' }
  const netClass = analog.net >= 0 ? 'text-teal' : 'text-red'

  return (
    <div className="overflow-hidden rounded-md border border-border bg-surface">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-3 py-2">
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-sm font-semibold text-text">#{analog.rank}</span>
          <span className="font-mono text-[11px] text-sub tabular-nums">{analog.date}</span>
        </div>
        <div className="flex items-baseline gap-2 font-mono text-[11px] tabular-nums">
          <span className="text-sub">
            rmse <span className="text-text">{fmtNum(analog.rmse)}</span>
          </span>
          <span className="text-sub">
            r <span className="text-text">{fmtNum(analog.r, 2)}</span>
          </span>
          <span className={`font-semibold ${netClass}`}>net {signedPct(analog.net)}</span>
        </div>
      </div>
      <div className="border-t border-border/60">
        <LightweightChart
          chart={chart}
          height={240}
          interactive={true}
          hideScales={false}
        />
      </div>
      <span className="sr-only">{symbol}</span>
    </div>
  )
}

export function DayAnalogView() {
  const [data, setData] = useState<Payload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    fetch('/day-analog/data.json', { signal: controller.signal })
      .then((response) =>
        response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`))
      )
      .then((payload: Payload) => {
        setData(payload)
        const symbols = payload.symbols ?? []
        const preferred = symbols.find((s) => s.symbol === 'ES')
        setSelectedSymbol(preferred?.symbol ?? symbols[0]?.symbol ?? null)
      })
      .catch((err) => {
        if (!controller.signal.aborted) {
          setError(err instanceof Error ? err.message : String(err))
        }
      })
    return () => controller.abort()
  }, [])

  const selected = useMemo(
    () => data?.symbols.find((s) => s.symbol === selectedSymbol) ?? null,
    [data, selectedSymbol]
  )

  return (
    <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 sm:py-8 lg:px-10">
      <header className="mb-5">
        <h1 className="text-2xl font-bold tracking-tight">Day Analog</h1>
        <p className="mt-1 max-w-3xl text-xs leading-relaxed text-sub">
          For the chosen session these are the five past sessions whose 78-bar intraday
          shape is closest by RMSE on %-from-open. A screen, not a signal — matches share
          intraday character, not trade setups.
        </p>
      </header>

      {error && (
        <div className="rounded-md border border-red/40 bg-red/10 px-3 py-2 text-xs text-red">
          {error}
        </div>
      )}
      {!error && data === null && <div className="text-xs text-sub">Loading...</div>}

      {data && (
        <>
          <div className="mb-5 flex flex-wrap items-center gap-2">
            <label htmlFor="day-analog-symbol" className="text-xs text-sub">
              Symbol
            </label>
            <select
              id="day-analog-symbol"
              value={selectedSymbol ?? ''}
              onChange={(event) => setSelectedSymbol(event.target.value)}
              className="bg-surface border border-border text-text rounded-md px-2 py-1 font-mono text-sm"
            >
              {data.symbols.map((entry) => (
                <option key={entry.symbol} value={entry.symbol}>
                  {entry.symbol}
                </option>
              ))}
            </select>
            {selected && (
              <span className="font-mono text-[11px] text-sub tabular-nums">
                {selected.n_candidates.toLocaleString()} candidates ·{' '}
                {selected.n_sessions.toLocaleString()} sessions
              </span>
            )}
          </div>

          {selected ? (
            <div className="flex flex-col gap-5">
              <QueryCard symbol={selected.symbol} query={selected.query} />

              <DayAnalogOverlay query={selected.query} analogs={selected.analogs} />

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {selected.analogs.map((analog) => (
                  <AnalogCard
                    key={`${selected.symbol}-${analog.rank}-${analog.date}`}
                    symbol={selected.symbol}
                    analog={analog}
                  />
                ))}
              </div>
            </div>
          ) : (
            <div className="text-xs text-sub">No symbols in this dataset.</div>
          )}
        </>
      )}
    </main>
  )
}
