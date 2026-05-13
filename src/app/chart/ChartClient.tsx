"use client"

import dynamic from "next/dynamic"

const TradingViewTerminal = dynamic(
  () => import("@/components/charts/TradingViewTerminal").then((mod) => mod.TradingViewTerminal),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-screen items-center justify-center bg-bg text-xs font-semibold uppercase tracking-[0.2em] text-sub">
        Loading chart
      </div>
    ),
  },
)

export function ChartClient() {
  return <TradingViewTerminal />
}
