"use client"

import { useEffect, useMemo, useState } from "react"
import { LightweightChart } from "@/components/charts/LightweightChart"
import type { ChartData } from "@/lib/types"

interface PriorDayExtremeExample {
  label: string
  symbol: string
  session_date: string
  direction: "long" | "short"
  bars: { t: number; o: number; h: number; l: number; c: number }[]
  highlight_bar_ts: number[]
  entry_ts: number
  exit_ts: number
  entry_price: number
  stop_price: number
  target_price: number
  exit_price: number
  exit_reason: "target" | "stop" | "timeout" | string
  net_r: number
  level_kind: "prior_day_high" | "prior_day_low" | string
  level: number
  attempt_number: number
  bar_bucket: string
}

interface Verdict {
  n: number
  win_rate: number
  target_hit_rate: number
  stop_rate: number
  timeout_rate: number
  expectancy_r: number
  profit_factor: number | null
  targets: number
  stops: number
  timeouts: number
}

interface SymbolSummary {
  symbol: string
  trades: number
  win_rate: number
  target_rate: number
  stop_rate: number
  timeout_rate: number
  avg_r: number
  profit_factor_r: number | null
}

interface ExamplesPayload {
  verdict: Verdict
  symbol_summary: SymbolSummary[]
  examples: PriorDayExtremeExample[]
}

const EXIT_STYLE: Record<string, { label: string; cls: string }> = {
  target: { label: "hit target", cls: "text-teal" },
  stop: { label: "stopped out", cls: "text-red" },
  timeout: { label: "timed out", cls: "text-sub" },
}

const OUTCOME_FILTERS = [
  { value: "all", label: "All" },
  { value: "target", label: "Targets" },
  { value: "timeout", label: "Timeouts" },
  { value: "stop", label: "Stops" },
] as const

function pct(value: number) {
  return `${(value * 100).toFixed(1)}%`
}

function signed(value: number, digits = 3) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}`
}

function pf(value: number | null) {
  if (value === null) return "-"
  if (!Number.isFinite(value)) return "inf"
  return value.toFixed(2)
}

function levelLabel(value: string) {
  if (value === "prior_day_high") return "prior day high"
  if (value === "prior_day_low") return "prior day low"
  return value.replaceAll("_", " ")
}

export function PriorDayExtremesView() {
  const [data, setData] = useState<ExamplesPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [outcome, setOutcome] = useState("all")
  const [symbol, setSymbol] = useState("all")

  useEffect(() => {
    const ac = new AbortController()
    fetch("/prior-day-extremes/examples.json", { signal: ac.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: ExamplesPayload) => setData(d))
      .catch((e: unknown) => {
        if (ac.signal.aborted) return
        setError(e instanceof Error ? e.message : String(e))
      })
    return () => ac.abort()
  }, [])

  const symbols = useMemo(() => {
    if (!data) return []
    return Array.from(new Set(data.examples.map((ex) => ex.symbol))).sort()
  }, [data])

  const filteredExamples = useMemo(() => {
    if (!data) return []
    return data.examples.filter((ex) => {
      const outcomeOk = outcome === "all" || ex.exit_reason === outcome
      const symbolOk = symbol === "all" || ex.symbol === symbol
      return outcomeOk && symbolOk
    })
  }, [data, outcome, symbol])

  return (
    <main className="mx-auto max-w-[1400px] px-4 sm:px-6 lg:px-10 py-6 sm:py-8">
      <header className="mb-5">
        <h1 className="text-2xl font-bold tracking-tight">Prior-Day Extremes</h1>
        <p className="mt-1 max-w-3xl text-xs leading-relaxed text-sub">
          A study gallery of stock/ETF trades that broke the prior RTH high or low,
          failed back through that level, and then reversed the other way. Each chart
          paints the reversal confirmation bar gold and marks the planned entry, stop,
          and 2R target.
        </p>
      </header>

      {data && (
        <>
          <div className="mb-4 rounded-md border border-border bg-surface px-4 py-3 text-xs leading-relaxed text-sub">
            <span className="font-semibold uppercase tracking-[0.14em] text-[10px] text-sub">
              Backtest verdict
            </span>
            <p className="mt-1.5">
              Tested on {data.verdict.n.toLocaleString()} one-bar failed breakouts
              across the downloaded 2024 stock/ETF set. The headline win rate is{" "}
              <span className="font-semibold text-text">{pct(data.verdict.win_rate)}</span>,
              but only{" "}
              <span className="font-semibold text-text">
                {pct(data.verdict.target_hit_rate)}
              </span>{" "}
              reached the full 2R target. Expectancy was{" "}
              <span className="font-mono text-text">
                {signed(data.verdict.expectancy_r)}R
              </span>{" "}
              with PF(R){" "}
              <span className="font-mono text-text">{pf(data.verdict.profit_factor)}</span>.
              The study is interesting, but still wants filtering before it becomes a
              trading rule.
            </p>
          </div>

          <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
            <Stat label="Trades" value={data.verdict.n.toLocaleString()} sub="1-bar reversal" />
            <Stat label="Win Rate" value={pct(data.verdict.win_rate)} sub="positive pnl" />
            <Stat
              label="Target Rate"
              value={pct(data.verdict.target_hit_rate)}
              sub={`${data.verdict.targets.toLocaleString()} full 2R hits`}
            />
            <Stat
              label="Timeouts"
              value={pct(data.verdict.timeout_rate)}
              sub={`${data.verdict.timeouts.toLocaleString()} trades`}
            />
            <Stat label="Avg R" value={`${signed(data.verdict.expectancy_r)}`} sub="per trade" />
            <Stat label="PF(R)" value={pf(data.verdict.profit_factor)} sub="R-multiple basis" />
          </div>

          <div className="mb-4 flex flex-wrap items-center gap-2">
            {OUTCOME_FILTERS.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => setOutcome(item.value)}
                className={`h-8 rounded-md border px-3 text-xs transition-colors ${
                  outcome === item.value
                    ? "border-teal/70 bg-teal/10 text-teal"
                    : "border-border bg-surface text-text hover:border-border-hover hover:bg-surface-hover"
                }`}
              >
                {item.label}
              </button>
            ))}
            <select
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              className="h-8 rounded-md border border-border bg-surface px-3 text-xs text-text hover:border-border-hover hover:bg-surface-hover"
              aria-label="Symbol filter"
            >
              <option value="all">All symbols</option>
              {symbols.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
            <div className="ml-auto font-mono text-[11px] text-sub tabular-nums">
              {filteredExamples.length} / {data.examples.length} examples
            </div>
          </div>
        </>
      )}

      {error && (
        <div className="rounded-md border border-red/40 bg-red/10 px-3 py-2 text-xs text-red">
          {error}
        </div>
      )}
      {!error && data === null && <div className="text-xs text-sub">Loading...</div>}

      {data && (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filteredExamples.map((ex, i) => (
              <ExtremeCard key={`${ex.symbol}-${ex.session_date}-${i}`} ex={ex} />
            ))}
          </div>

          <section className="mt-5 overflow-hidden rounded-md border border-border bg-surface">
            <div className="border-b border-border px-3 py-2">
              <h2 className="text-sm font-semibold tracking-tight">Results by Symbol</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs tabular-nums">
                <thead className="text-[10px] uppercase tracking-[0.12em] text-sub">
                  <tr className="border-b border-border/70">
                    <th className="px-3 py-2 text-left">Symbol</th>
                    <th className="px-3 py-2">Trades</th>
                    <th className="px-3 py-2">Win</th>
                    <th className="px-3 py-2">Target</th>
                    <th className="px-3 py-2">Stop</th>
                    <th className="px-3 py-2">Timeout</th>
                    <th className="px-3 py-2">Avg R</th>
                    <th className="px-3 py-2">PF</th>
                  </tr>
                </thead>
                <tbody>
                  {data.symbol_summary.map((row) => (
                    <tr key={row.symbol} className="border-b border-border/50 last:border-0">
                      <td className="px-3 py-2 text-left font-mono font-semibold text-text">
                        {row.symbol}
                      </td>
                      <td className="px-3 py-2">{row.trades.toLocaleString()}</td>
                      <td className="px-3 py-2">{pct(row.win_rate)}</td>
                      <td className="px-3 py-2">{pct(row.target_rate)}</td>
                      <td className="px-3 py-2">{pct(row.stop_rate)}</td>
                      <td className="px-3 py-2">{pct(row.timeout_rate)}</td>
                      <td
                        className={`px-3 py-2 font-mono ${
                          row.avg_r >= 0 ? "text-teal" : "text-red"
                        }`}
                      >
                        {signed(row.avg_r)}
                      </td>
                      <td className="px-3 py-2">{pf(row.profit_factor_r)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </main>
  )
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="min-w-0 rounded-md border border-border bg-surface px-3 py-2.5">
      <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-sub">{label}</div>
      <div className="mt-1 font-mono text-lg font-bold text-text">{value}</div>
      <div className="mt-0.5 truncate text-[11px] text-sub">{sub}</div>
    </div>
  )
}

function ExtremeCard({ ex }: { ex: PriorDayExtremeExample }) {
  const chart: ChartData = {
    bars: ex.bars,
    timeframe: "5min",
    keyLevels:
      ex.level_kind === "prior_day_high"
        ? { priorDayHigh: ex.level }
        : ex.level_kind === "prior_day_low"
        ? { priorDayLow: ex.level }
        : undefined,
    annotations: {
      highlightBars: ex.highlight_bar_ts.map((t) => ({ time: t, color: "#fbbf24" })),
      entryPrice: ex.entry_price,
      stopPrice: ex.stop_price,
      targetPrice: ex.target_price,
      exitPrice: ex.exit_price,
      markers: [
        {
          time: ex.entry_ts,
          position: ex.direction === "long" ? "belowBar" : "aboveBar",
          color: "#00c896",
          shape: ex.direction === "long" ? "arrowUp" : "arrowDown",
          text: "entry",
        },
        {
          time: ex.exit_ts,
          position: ex.direction === "long" ? "aboveBar" : "belowBar",
          color: "#f5c842",
          shape: "circle",
          text: "exit",
        },
      ],
    },
  }
  const exit = EXIT_STYLE[ex.exit_reason] ?? { label: ex.exit_reason, cls: "text-sub" }
  const dirCls = ex.direction === "long" ? "text-teal" : "text-red"
  const rCls = ex.net_r >= 0 ? "text-teal" : "text-red"

  return (
    <article className="overflow-hidden rounded-md border border-border bg-surface">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-3 py-2">
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-sm font-semibold text-text">{ex.symbol}</span>
          <span className="font-mono text-[11px] text-sub tabular-nums">{ex.session_date}</span>
          <span className={`text-[10px] font-semibold uppercase tracking-wide ${dirCls}`}>
            {ex.direction}
          </span>
        </div>
        <div className="flex items-baseline gap-2 font-mono text-[11px] tabular-nums">
          <span className={exit.cls}>{exit.label}</span>
          <span className={`font-semibold ${rCls}`}>{ex.net_r >= 0 ? "+" : ""}{ex.net_r.toFixed(2)}R</span>
        </div>
      </div>
      <div className="border-t border-border/60">
        <LightweightChart chart={chart} height={240} interactive={false} hideScales={false} />
      </div>
      <div className="flex flex-wrap gap-x-2 gap-y-1 px-3 py-1.5 font-mono text-[10px] leading-relaxed tabular-nums text-sub">
        <span>{ex.label}</span>
        <span>{levelLabel(ex.level_kind)} {ex.level.toFixed(2)}</span>
        <span>attempt {ex.attempt_number}</span>
        <span>entry {ex.entry_price.toFixed(2)}</span>
        <span>stop {ex.stop_price.toFixed(2)}</span>
        <span>target {ex.target_price.toFixed(2)}</span>
      </div>
    </article>
  )
}
