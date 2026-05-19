"use client"

import { useEffect, useState } from "react"
import { LightweightChart } from "@/components/charts/LightweightChart"
import type { ChartData } from "@/lib/types"

interface SetupExample {
  symbol: string
  session_date: string
  direction: "long" | "short"
  bars: { t: number; o: number; h: number; l: number; c: number }[]
  entry_ts: number
  entry_price: number
  stop_price: number
  target_price: number
  scale_in_prices: number[]
  tranches_filled: number
  exit_reason: string
  net_r: number
}

interface Verdict {
  n: number | null
  expectancy_r: number | null
  profit_factor: number | null
  win_rate: number | null
}

interface Setup {
  key: string
  label: string
  type: string
  verdict: Verdict
  examples: SetupExample[]
}

interface CatalogPayload {
  sessions_tested?: number
  setups: Setup[]
}

const EXIT_STYLE: Record<string, { label: string; cls: string }> = {
  target: { label: "hit target", cls: "text-teal" },
  stop: { label: "stopped out", cls: "text-red" },
  stop_straddle: { label: "stopped out", cls: "text-red" },
  breakeven: { label: "scratched flat", cls: "text-sub" },
  breakeven_straddle: { label: "scratched flat", cls: "text-sub" },
  time: { label: "timed out", cls: "text-sub" },
}

/**
 * /setup-catalog — example trades for every Al Brooks setup, each traded
 * by scaling in behind one wide stop (the method proven out on /spikes).
 * Built from scripts/ml/build_setup_examples.py against the downloaded
 * analogs corpus; the header verdict per setup is the honest backtest R.
 */
export function SetupCatalogView() {
  const [data, setData] = useState<CatalogPayload | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const ac = new AbortController()
    fetch("/setup-examples.json", { signal: ac.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: CatalogPayload) => setData(d))
      .catch((e: unknown) => {
        if (ac.signal.aborted) return
        setError(e instanceof Error ? e.message : String(e))
      })
    return () => ac.abort()
  }, [])

  return (
    <main className="mx-auto max-w-[1400px] px-4 sm:px-6 lg:px-10 py-6 sm:py-8">
      <header className="mb-5">
        <h1 className="text-2xl font-bold tracking-tight">Setup Catalog</h1>
        <p className="mt-1 max-w-3xl text-xs leading-relaxed text-sub">
          Example trades for every Al Brooks setup, each traded the way Brooks
          scales into a position — the signal-bar entry plus pullback adds
          behind a single <span className="text-text">wide stop</span> that
          trails to breakeven, exited at the measured move. Every card is a
          real detected instance from the downloaded sessions; the verdict on
          each setup is its honest backtest expectancy.
        </p>
      </header>

      {error && (
        <div className="rounded-md border border-red/40 bg-red/10 px-3 py-2 text-xs text-red">
          {error}
        </div>
      )}
      {!error && data === null && <div className="text-xs text-sub">Loading…</div>}

      {data && (
        <div className="flex flex-col gap-9">
          {data.setups.map((s) => (
            <SetupSection key={s.key} setup={s} />
          ))}
        </div>
      )}
    </main>
  )
}

function SetupSection({ setup }: { setup: Setup }) {
  const exp = setup.verdict.expectancy_r
  const profitable = typeof exp === "number" && exp > 0
  const expCls = profitable ? "text-teal" : "text-red"

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-border/60 pb-2">
        <h2 className="text-lg font-semibold tracking-tight">{setup.label}</h2>
        <span className="rounded bg-surface px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-sub">
          {setup.type}
        </span>
        {typeof exp === "number" && (
          <span className="font-mono text-[11px] tabular-nums text-sub">
            backtest expectancy{" "}
            <span className={`font-semibold ${expCls}`}>
              {exp >= 0 ? "+" : ""}
              {exp.toFixed(3)}R
            </span>
            {typeof setup.verdict.profit_factor === "number" && (
              <> · PF {setup.verdict.profit_factor.toFixed(2)}</>
            )}
            {typeof setup.verdict.n === "number" && (
              <> · n={setup.verdict.n.toLocaleString()}</>
            )}
          </span>
        )}
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {setup.examples.map((ex, i) => (
          <SetupCard key={`${setup.key}-${i}`} ex={ex} />
        ))}
      </div>
    </section>
  )
}

function SetupCard({ ex }: { ex: SetupExample }) {
  const chart: ChartData = {
    bars: ex.bars,
    timeframe: "5min",
    annotations: {
      highlightBars: [{ time: ex.entry_ts, color: "#fbbf24" }],
      entryPrice: ex.entry_price,
      stopPrice: ex.stop_price,
      targetPrice: ex.target_price,
    },
  }
  const exit = EXIT_STYLE[ex.exit_reason] ?? { label: ex.exit_reason, cls: "text-sub" }
  const dirCls = ex.direction === "long" ? "text-teal" : "text-red"
  const rCls = ex.net_r >= 0 ? "text-teal" : "text-red"

  return (
    <div className="overflow-hidden rounded-md border border-border bg-surface">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-3 py-2">
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-sm font-semibold text-text">{ex.symbol}</span>
          <span className="font-mono text-[11px] text-sub tabular-nums">
            {ex.session_date}
          </span>
          <span className={`text-[10px] font-semibold uppercase tracking-wide ${dirCls}`}>
            {ex.direction}
          </span>
        </div>
        <div className="flex items-baseline gap-2 font-mono text-[11px] tabular-nums">
          <span className={exit.cls}>{exit.label}</span>
          <span className={`font-semibold ${rCls}`}>
            {ex.net_r >= 0 ? "+" : ""}
            {ex.net_r.toFixed(2)}R
          </span>
        </div>
      </div>
      <div className="border-t border-border/60">
        <LightweightChart chart={chart} height={240} interactive={false} hideScales={false} />
      </div>
      <div className="px-3 py-1.5 font-mono text-[10px] tabular-nums text-sub">
        entry {ex.entry_price.toFixed(2)} · scaled to {ex.tranches_filled}/
        {ex.scale_in_prices.length} · wide stop {ex.stop_price.toFixed(2)} · target{" "}
        {ex.target_price.toFixed(2)}
      </div>
    </div>
  )
}
