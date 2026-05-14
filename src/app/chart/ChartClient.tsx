"use client"

import dynamic from "next/dynamic"
import { useSearchParams } from "next/navigation"

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
  const search = useSearchParams()
  const raw = search?.get("symbol") ?? null
  // Accept the same ticker shape /api/bars accepts. Anything that doesn't
  // match falls back to the persisted/default symbol.
  const initialSymbol = raw && /^[A-Z][A-Z0-9.\-]{0,7}$/.test(raw.toUpperCase())
    ? raw.toUpperCase()
    : undefined
  return <TradingViewTerminal initialSymbolOverride={initialSymbol} />
}
