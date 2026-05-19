"use client"

import { useEffect, useState } from "react"
import { LightweightChart } from "@/components/charts/LightweightChart"
import type { ChartData } from "@/lib/types"

type VariantKey = "A" | "B" | "C"

interface VariantSummary {
  label: string
  n: number
  target_hit_rate: number
  win_rate: number
  expectancy_r: number
  avg_win_r: number
  avg_loss_r: number
  profit_factor: number | null
  total_r: number
}

interface VariantTrade {
  stop: number
  target: number
  exit_reason: string
  net_r: number
}

interface McExample {
  symbol: string
  session_date: string
  direction: "long" | "short"
  bars: { t: number; o: number; h: number; l: number; c: number }[]
  spike_bar_ts: number[]
  pullback_bar_ts: number[]
  signal_ts: number
  fire_ts: number
  raw_spike_entry: number
  entry_price: number
  variants: Partial<Record<VariantKey, VariantTrade>>
}

interface McPayload {
  note: string
  chosen_variant: VariantKey
  variants: Record<VariantKey, VariantSummary>
  examples: McExample[]
}

const EXIT_STYLE: Record<string, { label: string; cls: string }> = {
  target: { label: "hit target", cls: "text-teal" },
  stop: { label: "stopped out", cls: "text-red" },
  stop_straddle: { label: "stopped out", cls: "text-red" },
  time: { label: "timed out", cls: "text-sub" },
}

const SPIKE_COLOR = "#fbbf24"     // gold — the microchannel spike bars
const PULLBACK_COLOR = "#a78bfa"  // violet — the first-pullback bars

/**
 * /spikes — the opening-spike setup, refined into a microchannel-pullback
 * trade.
 *
 * The raw spike setup buys the close of the 3rd spike bar — it chases.
 * This page shows the refinement: treat the spike as a microchannel,
 * wait for the first pullback, and enter on a breakout stop above the
 * signal bar (Brooks' H1 / L1). Each card paints the spike bars gold
 * and the first-pullback bars violet, with the H1/L1 entry, stop, and
 * target the refined setup specifies.
 *
 * The header compares the three stop/target variants honestly — this
 * is a study gallery, not a tradeable signal.
 */
export function SpikesView() {
  const [data, setData] = useState<McPayload | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const ac = new AbortController()
    fetch("/spikes/microchannel.json", { signal: ac.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: McPayload) => setData(d))
      .catch((e: unknown) => {
        if (ac.signal.aborted) return
        setError(e instanceof Error ? e.message : String(e))
      })
    return () => ac.abort()
  }, [])

  return (
    <main className="mx-auto max-w-[1400px] px-4 sm:px-6 lg:px-10 py-6 sm:py-8">
      <header className="mb-5">
        <h1 className="text-2xl font-bold tracking-tight">
          Spikes — microchannel pullback
        </h1>
        <p className="mt-1 max-w-3xl text-xs leading-relaxed text-sub">
          The raw opening-spike setup buys the close of the 3rd spike bar —
          it chases. This refines it. The spike is a{" "}
          <span className="text-text">microchannel</span>; instead of
          chasing, we wait for the{" "}
          <span className="text-text">first pullback</span> out of it and
          enter on a breakout stop above the signal bar — Brooks&apos; H1
          (long) / L1 (short). Each chart paints the spike bars gold and the
          first-pullback bars violet, with the breakout entry, stop, and
          target.
        </p>
      </header>

      {data && (
        <VariantPanel
          variants={data.variants}
          chosen={data.chosen_variant}
          note={data.note}
        />
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
            <SpikeCard
              key={`${ex.symbol}-${ex.session_date}-${i}`}
              ex={ex}
              variant={data.chosen_variant}
            />
          ))}
        </div>
      )}
    </main>
  )
}

function fmtR(r: number): string {
  return `${r >= 0 ? "+" : ""}${r.toFixed(3)}R`
}

function VariantPanel({
  variants,
  chosen,
  note,
}: {
  variants: Record<VariantKey, VariantSummary>
  chosen: VariantKey
  note: string
}) {
  const order: VariantKey[] = ["A", "B", "C"]
  return (
    <div className="mb-5 rounded-md border border-border bg-surface px-4 py-3 text-xs leading-relaxed text-sub">
      <span className="font-semibold uppercase tracking-[0.14em] text-[10px] text-sub">
        Stop / target variants
      </span>
      <p className="mt-1.5">
        The refinement&apos;s edge is the{" "}
        <span className="text-text">tight first-pullback stop</span>.
        Variant C keeps the original 5-min stop and reproduces the raw
        spike setup&apos;s null. Tightening the stop to the pullback
        extreme (A &amp; B) is what moves expectancy.
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full border-collapse text-[11px]">
          <thead>
            <tr className="border-b border-border text-sub">
              <th className="py-1.5 pr-3 text-left font-medium">Variant</th>
              <th className="px-3 py-1.5 text-right font-medium">n</th>
              <th className="px-3 py-1.5 text-right font-medium">Expectancy</th>
              <th className="px-3 py-1.5 text-right font-medium">Target hit</th>
              <th className="px-3 py-1.5 text-right font-medium">Win rate</th>
              <th className="px-3 py-1.5 text-right font-medium">Profit factor</th>
            </tr>
          </thead>
          <tbody className="font-mono tabular-nums">
            {order.map((k) => {
              const v = variants[k]
              const isChosen = k === chosen
              return (
                <tr
                  key={k}
                  className={`border-b border-border/60 last:border-0 ${
                    isChosen ? "bg-teal/5" : ""
                  }`}
                >
                  <td className="py-1.5 pr-3 font-sans text-text">
                    {v.label}
                    {isChosen && (
                      <span className="ml-1.5 text-[9px] font-semibold uppercase tracking-wide text-teal">
                        best
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-right text-sub">{v.n}</td>
                  <td
                    className={`px-3 py-1.5 text-right font-semibold ${
                      v.expectancy_r >= 0 ? "text-teal" : "text-red"
                    }`}
                  >
                    {fmtR(v.expectancy_r)}
                  </td>
                  <td className="px-3 py-1.5 text-right text-text">
                    {Math.round(v.target_hit_rate * 100)}%
                  </td>
                  <td className="px-3 py-1.5 text-right text-text">
                    {Math.round(v.win_rate * 100)}%
                  </td>
                  <td className="px-3 py-1.5 text-right text-text">
                    {v.profit_factor == null ? "—" : v.profit_factor.toFixed(2)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2.5 text-[11px] text-sub">{note}</p>
    </div>
  )
}

function SpikeCard({ ex, variant }: { ex: McExample; variant: VariantKey }) {
  const trade = ex.variants[variant] ?? Object.values(ex.variants)[0]
  if (!trade) return null

  const spikeTs = new Set(ex.spike_bar_ts)
  const highlightBars = [
    ...ex.spike_bar_ts.map((t) => ({ time: t, color: SPIKE_COLOR })),
    // A pullback bar never coincides with a spike bar, but guard anyway.
    ...ex.pullback_bar_ts
      .filter((t) => !spikeTs.has(t))
      .map((t) => ({ time: t, color: PULLBACK_COLOR })),
  ]

  const chart: ChartData = {
    bars: ex.bars,
    timeframe: "5min",
    annotations: {
      highlightBars,
      entryPrice: ex.entry_price,
      stopPrice: trade.stop,
      targetPrice: trade.target,
    },
  }
  const exit = EXIT_STYLE[trade.exit_reason] ?? {
    label: trade.exit_reason,
    cls: "text-sub",
  }
  const dirCls = ex.direction === "long" ? "text-teal" : "text-red"
  const rCls = trade.net_r >= 0 ? "text-teal" : "text-red"

  return (
    <div className="overflow-hidden rounded-md border border-border bg-surface">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-3 py-2">
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-sm font-semibold text-text">{ex.symbol}</span>
          <span className="font-mono text-[11px] text-sub tabular-nums">
            {ex.session_date}
          </span>
          <span
            className={`text-[10px] font-semibold uppercase tracking-wide ${dirCls}`}
          >
            {ex.direction}
          </span>
        </div>
        <div className="flex items-baseline gap-2 font-mono text-[11px] tabular-nums">
          <span className={exit.cls}>{exit.label}</span>
          <span className={`font-semibold ${rCls}`}>
            {trade.net_r >= 0 ? "+" : ""}
            {trade.net_r.toFixed(2)}R
          </span>
        </div>
      </div>
      <div className="border-t border-border/60">
        <LightweightChart chart={chart} height={240} interactive={false} hideScales={false} />
      </div>
      <div className="px-3 py-1.5 font-mono text-[10px] tabular-nums text-sub">
        spike entry {ex.raw_spike_entry.toFixed(2)} → H1/L1{" "}
        <span className="text-text">{ex.entry_price.toFixed(2)}</span> · stop{" "}
        {trade.stop.toFixed(2)} · target {trade.target.toFixed(2)}
      </div>
    </div>
  )
}
