"use client"

import { useEffect, useState } from "react"
import { LightweightChart } from "@/components/charts/LightweightChart"
import type { ChartData } from "@/lib/types"

interface SpikeExample {
  symbol: string
  session_date: string
  direction: "long" | "short"
  bars: { t: number; o: number; h: number; l: number; c: number }[]
  spike_bar_ts: number[]
  entry_ts: number
  entry_price: number
  stop_price: number
  target_price: number
  scale_in_prices: number[]
  tranches_filled: number
  spike_bar_count: number
  exit_reason: string
  net_r: number
}

interface Verdict {
  n: number
  target_hit_rate: number
  expectancy_r: number
  expectancy_ci95: [number, number]
  profit_factor: number | null
}

interface ExamplesPayload {
  sessions_tested?: number
  verdict: Verdict
  opening_verdict: Verdict
  examples: SpikeExample[]
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
 * /spikes — a study gallery of Al Brooks opening-spike trades.
 *
 * Each card is a real detected spike, traded the way Brooks scales into
 * a spike: the signal-bar entry plus pullback adds behind one wide
 * protective stop, that stop trailed to breakeven once the trade works,
 * and the whole position exited at the measured move. The header states
 * the backtest verdict from the downloaded historical sessions.
 */
export function SpikesView() {
  const [data, setData] = useState<ExamplesPayload | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const ac = new AbortController()
    fetch("/spikes/examples.json", { signal: ac.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: ExamplesPayload) => setData(d))
      .catch((e: unknown) => {
        if (ac.signal.aborted) return
        setError(e instanceof Error ? e.message : String(e))
      })
    return () => ac.abort()
  }, [])

  return (
    <main className="mx-auto max-w-[1400px] px-4 sm:px-6 lg:px-10 py-6 sm:py-8">
      <header className="mb-5">
        <h1 className="text-2xl font-bold tracking-tight">Spikes</h1>
        <p className="mt-1 max-w-3xl text-xs leading-relaxed text-sub">
          A study gallery of Al Brooks <span className="text-text">opening-spike</span>{" "}
          trades — 3+ consecutive strong trend bars off the open — traded the
          way Brooks <span className="text-text">scales into a spike</span>:
          the signal-bar entry (close of the 3rd bar) plus pullback adds, all
          behind a single <span className="text-text">wide protective stop</span>{" "}
          that trails to breakeven once the trade works, with the whole
          position exited at the measured-move target. Each chart paints the
          spike bars gold and the entry / wide-stop / target lines — the
          method from <em>Trading Price Action</em>.
        </p>
      </header>

      {data && (
        <div className="mb-5 rounded-md border border-border bg-surface px-4 py-3 text-xs leading-relaxed text-sub">
          <span className="font-semibold uppercase tracking-[0.14em] text-[10px] text-sub">
            Backtest verdict
          </span>
          <p className="mt-1.5">
            Tested on {data.verdict.n.toLocaleString()} detected spikes across{" "}
            {(data.sessions_tested ?? 0).toLocaleString()} downloaded sessions
            with realistic costs. Traded single-entry on the tight stop the
            setup loses; scaled in behind the wide stop it turns a profit —
            opening spikes, the cohort below, show expectancy{" "}
            <span className="font-mono text-text">
              {data.opening_verdict.expectancy_r >= 0 ? "+" : ""}
              {data.opening_verdict.expectancy_r.toFixed(3)}R
            </span>{" "}
            at a {(data.opening_verdict.profit_factor ?? 0).toFixed(2)} profit
            factor (95% CI [{data.opening_verdict.expectancy_ci95[0].toFixed(3)},{" "}
            {data.opening_verdict.expectancy_ci95[1].toFixed(3)}]
            {data.opening_verdict.expectancy_ci95[0] < 0
              ? " — still includes zero, so a positive read, not a certain one"
              : ""}
            ). The full measured move is reached only{" "}
            <span className="font-semibold text-text">
              {Math.round(data.verdict.target_hit_rate * 100)}%
            </span>{" "}
            of the time — by design: the breakeven trail scratches most trades
            flat before the full move, and the edge comes from the scaled-in
            winners that do run.
          </p>
        </div>
      )}

      {error && (
        <div className="rounded-md border border-red/40 bg-red/10 px-3 py-2 text-xs text-red">
          {error}
        </div>
      )}
      {!error && data === null && <div className="text-xs text-sub">Loading…</div>}

      {data && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data.examples.map((ex, i) => (
            <SpikeCard key={`${ex.symbol}-${ex.session_date}-${i}`} ex={ex} />
          ))}
        </div>
      )}
    </main>
  )
}

function SpikeCard({ ex }: { ex: SpikeExample }) {
  const chart: ChartData = {
    bars: ex.bars,
    timeframe: "5min",
    annotations: {
      highlightBars: ex.spike_bar_ts.map((t) => ({ time: t, color: "#fbbf24" })),
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
          <span className="font-mono text-[11px] text-sub tabular-nums">{ex.session_date}</span>
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
        {ex.spike_bar_count}-bar spike · entry {ex.entry_price.toFixed(2)} · scaled
        to {ex.tranches_filled}/{ex.scale_in_prices.length} · wide stop{" "}
        {ex.stop_price.toFixed(2)} · target {ex.target_price.toFixed(2)}
      </div>
    </div>
  )
}
