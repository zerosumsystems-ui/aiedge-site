"use client"

import { useState, useEffect, useCallback, useMemo, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import type { ScanPayload } from "@/lib/types"
import { ScannerCard } from "./ScannerCard"
import { SortBar, sortResults, type SortKey } from "./SortBar"
import { ScoringLegend } from "./ScoringLegend"

export function ScannerDashboard() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><div className="text-sub text-sm">Loading scanner data...</div></div>}>
      <ScannerDashboardInner />
    </Suspense>
  )
}

function ScannerDashboardInner() {
  const searchParams = useSearchParams()

  const [data, setData] = useState<ScanPayload | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>("rank")
  const [loading, setLoading] = useState(true)

  // ?demo=analogs swaps in a static fixture so the analog UI is verifiable
  // off-hours. Production reads from /api/scan as usual.
  const demoMode = searchParams.get("demo") === "analogs"

  const fetchData = useCallback(async () => {
    try {
      const url = demoMode ? "/scanner-demo.json" : "/api/scan"
      const res = await fetch(url, { cache: "no-store" })
      const json: ScanPayload = await res.json()
      setData(json)
    } catch (err) {
      console.error("Failed to fetch scan data:", err)
    } finally {
      setLoading(false)
    }
  }, [demoMode])

  useEffect(() => {
    fetchData()
    // Auto-refresh every 5 minutes (skip in demo mode — fixture is static).
    if (demoMode) return
    const interval = setInterval(fetchData, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [fetchData, demoMode])

  const results = data?.results
  const hasData = Boolean(results && results.length > 0)

  const sorted = useMemo(
    () => (hasData && results ? sortResults(results, sortKey) : []),
    [hasData, results, sortKey],
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-sub text-sm">Loading scanner data...</div>
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto px-3 py-3">
      {/* Header */}
      <header className="flex flex-col gap-1 sm:flex-row sm:justify-between sm:items-baseline sm:gap-0 mb-3 pb-2 border-b border-border">
        <h1 className="text-[17px] font-bold tracking-tight">Live Scanner{demoMode && (
          <span className="ml-2 text-[11px] font-normal text-yellow uppercase tracking-wider">
            demo fixture · ?demo=analogs
          </span>
        )}</h1>
        <div className="text-xs text-sub sm:text-right">
          {data?.timestamp || ""} &middot; {data?.date || ""}
        </div>
      </header>

      {/* Stats */}
      {hasData && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-sub mb-3">
          <span className="whitespace-nowrap">📡 {data!.symbolsScanned.toLocaleString()} symbols</span>
          <span className="whitespace-nowrap">✅ {data!.passedFilters} passed filters</span>
          <span className="whitespace-nowrap">⏱ {data!.scanTime}</span>
          <span className="whitespace-nowrap">Next: {data!.nextScan}</span>
        </div>
      )}

      {/* Scoring legend */}
      <ScoringLegend />

      {/* Sort bar */}
      {hasData && <SortBar onSort={setSortKey} activeKey={sortKey} />}

      {/* Cards */}
      {hasData ? (
        <div>
          {sorted.map((result) => (
            <ScannerCard key={result.ticker} result={result} />
          ))}
        </div>
      ) : (
        <div className="text-center py-20 text-sub">
          <p className="text-lg mb-2">No scan data yet</p>
          <p className="text-sm">Waiting for the scanner to POST results to /api/scan</p>
        </div>
      )}

      {/* Footer */}
      <footer className="mt-3.5 pt-2 border-t border-border text-[11px] text-sub text-center">
        Auto-refreshes every 5 min &middot; Brooks Price Action Scanner
      </footer>
    </div>
  )
}
