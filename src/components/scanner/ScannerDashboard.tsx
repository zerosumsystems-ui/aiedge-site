"use client"

import { useState, useEffect, useCallback } from "react"
import type { ScanPayload, ScanResult } from "@/lib/types"
import { ScannerCard } from "./ScannerCard"
import { SortBar, sortResults, type SortKey } from "./SortBar"
import { ScoringLegend } from "./ScoringLegend"

export function ScannerDashboard() {
  const [data, setData] = useState<ScanPayload | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>("rank")
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/scan")
      const json: ScanPayload = await res.json()
      setData(json)
    } catch (err) {
      console.error("Failed to fetch scan data:", err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
    // Auto-refresh every 5 minutes
    const interval = setInterval(fetchData, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [fetchData])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-sub text-sm">Loading scanner data...</div>
      </div>
    )
  }

  const hasData = data && data.results.length > 0
  const sorted = hasData ? sortResults(data.results, sortKey) : []

  return (
    <div className="max-w-3xl mx-auto px-3 py-3">
      {/* Header */}
      <header className="flex flex-col gap-1 sm:flex-row sm:justify-between sm:items-baseline sm:gap-0 mb-3 pb-2 border-b border-border">
        <h1 className="text-[17px] font-bold tracking-tight">Live Scanner</h1>
        <div className="text-xs text-sub sm:text-right">
          {data?.timestamp || ""} &middot; {data?.date || ""}
        </div>
      </header>

      {/* Stats */}
      {hasData && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-sub mb-3">
          <span className="whitespace-nowrap">📡 {data.symbolsScanned.toLocaleString()} symbols</span>
          <span className="whitespace-nowrap">✅ {data.passedFilters} passed filters</span>
          <span className="whitespace-nowrap">⏱ {data.scanTime}</span>
          <span className="whitespace-nowrap">Next: {data.nextScan}</span>
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
