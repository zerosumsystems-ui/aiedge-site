"use client"

import { useEffect, useState } from "react"
import { LightweightChart } from "@/components/charts/LightweightChart"
import type { ChartData } from "@/lib/types"

interface WedgeExample {
  symbol: string
  session_date: string
  direction: "long" | "short"
  wedge_type: "top" | "bottom"
  bars: { t: number; o: number; h: number; l: number; c: number }[]
  push_bar_ts: number[]
  reversal_ts: number
  entry_price: number
  stop_price: number
  target_price: number
  deceleration: number
  is_flag: boolean
  channel_overshoot: number
  reversal_strength: number
  deepening_pullbacks: boolean
  brooks_clean: boolean
  exit_reason: string
  net_r: number
}

interface Verdict {
  n: number
  expectancy_r: number
  expectancy_ci95: [number, number]
  win_rate: number
  profit_factor: number | null
  sessions: number
}

interface ExamplesPayload {
  verdict: Verdict
  examples: WedgeExample[]
}

const EXIT_STYLE: Record<string, { label: string; cls: string }> = {
  target: { label: "hit target", cls: "text-teal" },
  stop: { label: "stopped out", cls: "text-red" },
  stop_straddle: { label: "stopped out", cls: "text-red" },
  time: { label: "timed out", cls: "text-sub" },
}

// The three push bars are painted gold; the reversal bar purple.
const PUSH_COLOR = "#fbbf24"
const REVERSAL_COLOR = "#a855f7"

/**
 * /wedges — a study gallery of Al Brooks three-push wedge reversals.
 *
 * Each card is a real detected wedge from the intraday backtest: the
 * three push bars painted gold, the reversal bar purple, with the
 * entry / stop / target lines the setup specifies. The header states
 * the backtest verdict honestly — the setup is a null — so the gallery
 * reads as a study, not a pitch. Mirrors /spikes.
 */
export function WedgesView() {
  const [data, setData] = useState<ExamplesPayload | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const ac = new AbortController()
    fetch("/wedges/examples.json", { signal: ac.signal })
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
        <h1 className="text-2xl font-bold tracking-tight">Wedges</h1>
        <p className="mt-1 max-w-3xl text-xs leading-relaxed text-sub">
          A study gallery of Al Brooks{" "}
          <span className="text-text">three-push wedge</span> reversals —
          three pushes in one direction, each a new extreme, the third
          losing momentum, then a reversal. Each chart paints the three
          push bars gold and the reversal bar purple, with the entry
          (bar after the reversal), the stop (1 tick beyond the third
          push), and the {" "}
          <span className="font-mono">2R</span> target — exactly as Brooks
          frames the wedge in <em>Trading Price Action: Reversals</em>.
        </p>
      </header>

      {data && (
        <div className="mb-5 rounded-md border border-border bg-surface px-4 py-3 text-xs leading-relaxed text-sub">
          <span className="font-semibold uppercase tracking-[0.14em] text-[10px] text-sub">
            Backtest verdict
          </span>
          <p className="mt-1.5">
            Tested on {data.verdict.n.toLocaleString()} wedge reversals
            across {data.verdict.sessions.toLocaleString()} intraday
            sessions with realistic costs. Expectancy is{" "}
            <span className="font-mono text-text">
              {data.verdict.expectancy_r >= 0 ? "+" : ""}
              {data.verdict.expectancy_r.toFixed(3)}R
            </span>{" "}
            (95% CI [{data.verdict.expectancy_ci95[0].toFixed(3)},{" "}
            {data.verdict.expectancy_ci95[1].toFixed(3)}] — entirely below
            zero), win rate{" "}
            <span className="font-mono text-text">
              {Math.round(data.verdict.win_rate * 100)}%
            </span>
            , profit factor{" "}
            <span className="font-mono text-text">
              {data.verdict.profit_factor?.toFixed(2) ?? "—"}
            </span>
            . <span className="text-text">No edge entered once with a
            tight stop</span> — that version loses to its own stop. Two
            things from the book change the verdict. (1) Wedges whose
            third push <span className="text-text">overshot the trend
            channel line</span> are the good ones — the badge on each
            card is that tag. (2) Traded Brooks&apos; way —{" "}
            <span className="text-text">scaling in with one wide stop</span>{" "}
            (Fig 31.5) — the same 790 wedges turn{" "}
            <span className="text-teal">+0.072R, win 63%, 95% CI entirely
            above zero</span>; overshoot wedges scaled into reach +0.148R.
            Modest, in-sample, one regime — a candidate, not a proven
            edge — but no longer a null. The cards below are the
            single-entry study.
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
            <WedgeCard key={`${ex.symbol}-${ex.session_date}-${i}`} ex={ex} />
          ))}
        </div>
      )}
    </main>
  )
}

function WedgeCard({ ex }: { ex: WedgeExample }) {
  const chart: ChartData = {
    bars: ex.bars,
    timeframe: "5min",
    annotations: {
      highlightBars: [
        ...ex.push_bar_ts.map((t) => ({ time: t, color: PUSH_COLOR })),
        { time: ex.reversal_ts, color: REVERSAL_COLOR },
      ],
      entryPrice: ex.entry_price,
      stopPrice: ex.stop_price,
      targetPrice: ex.target_price,
    },
  }
  const exit = EXIT_STYLE[ex.exit_reason] ?? { label: ex.exit_reason, cls: "text-sub" }
  const dirCls = ex.direction === "long" ? "text-teal" : "text-red"
  const rCls = ex.net_r >= 0 ? "text-teal" : "text-red"

  // Brooks good/bad-wedge quality badge.
  const quality = ex.brooks_clean
    ? { label: "Brooks-clean", cls: "bg-teal/15 text-teal" }
    : ex.channel_overshoot > 0
      ? { label: "channel overshoot", cls: "bg-amber-400/15 text-amber-400" }
      : { label: "undershoot", cls: "bg-sub/15 text-sub" }

  return (
    <div className="overflow-hidden rounded-md border border-border bg-surface">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-3 py-2">
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-sm font-semibold text-text">{ex.symbol}</span>
          <span className="font-mono text-[11px] text-sub tabular-nums">{ex.session_date}</span>
          <span className={`text-[10px] font-semibold uppercase tracking-wide ${dirCls}`}>
            wedge {ex.wedge_type} · {ex.direction}
          </span>
          <span className={`rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${quality.cls}`}>
            {quality.label}
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
        3rd push {Math.round(ex.deceleration * 100)}% of 2nd ·{" "}
        {ex.is_flag ? "flag" : "reversal"} · overshoot{" "}
        {ex.channel_overshoot >= 0 ? "+" : ""}
        {ex.channel_overshoot.toFixed(2)} · entry {ex.entry_price.toFixed(2)} ·
        stop {ex.stop_price.toFixed(2)} · target {ex.target_price.toFixed(2)}
      </div>
    </div>
  )
}
