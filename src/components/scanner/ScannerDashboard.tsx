"use client"

import { useState, useEffect, useCallback, useMemo, Suspense } from "react"
import { useRouter, useSearchParams, usePathname } from "next/navigation"
import type { ScanPayload } from "@/lib/types"
import { ScannerCard } from "./ScannerCard"
import { SortBar, sortResults, type SortKey } from "./SortBar"
import {
  FilterBar,
  filterResults,
  bpaFieldsMissing,
  type SetupFilter,
  type PhaseFilter,
} from "./FilterBar"
import { ScoringLegend } from "./ScoringLegend"

const SETUP_VALUES: SetupFilter[] = [
  "all", "H1", "H2", "L1", "L2", "FL1", "FL2", "FH1", "FH2", "spike_channel", "failed_bo",
]
const PHASE_VALUES: PhaseFilter[] = [
  "all", "trend_from_open", "spike_and_channel", "trading_range", "bull_channel",
  "bear_channel", "trending_tr", "breakout", "undetermined",
]

function parseSetup(raw: string | null): SetupFilter {
  if (!raw) return "all"
  return (SETUP_VALUES as string[]).includes(raw) ? (raw as SetupFilter) : "all"
}

function parsePhase(raw: string | null): PhaseFilter {
  if (!raw) return "all"
  return (PHASE_VALUES as string[]).includes(raw) ? (raw as PhaseFilter) : "all"
}

export function ScannerDashboard() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><div className="text-sub text-sm">Loading scanner data...</div></div>}>
      <ScannerDashboardInner />
    </Suspense>
  )
}

function ScannerDashboardInner() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const [data, setData] = useState<ScanPayload | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>("rank")
  const [loading, setLoading] = useState(true)

  // Filters — synced to URL query params (?setup=H2&phase=trading_range)
  const setupFilter = parseSetup(searchParams.get("setup"))
  const phaseFilter = parsePhase(searchParams.get("phase"))

  const updateQuery = useCallback(
    (patch: { setup?: SetupFilter; phase?: PhaseFilter }) => {
      const params = new URLSearchParams(searchParams.toString())
      if (patch.setup !== undefined) {
        if (patch.setup === "all") params.delete("setup")
        else params.set("setup", patch.setup)
      }
      if (patch.phase !== undefined) {
        if (patch.phase === "all") params.delete("phase")
        else params.set("phase", patch.phase)
      }
      const qs = params.toString()
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    },
    [router, pathname, searchParams],
  )

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

  const hasData = Boolean(data && data.results.length > 0)
  const results = data?.results ?? []

  const sorted = useMemo(
    () => (hasData ? sortResults(results, sortKey) : []),
    [hasData, results, sortKey],
  )
  const filtered = useMemo(
    () => filterResults(sorted, setupFilter, phaseFilter),
    [sorted, setupFilter, phaseFilter],
  )

  const backendPending = useMemo(
    () => setupFilter !== "all" && bpaFieldsMissing(results),
    [setupFilter, results],
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-sub text-sm">Loading scanner data...</div>
      </div>
    )
  }

  const filterActive = setupFilter !== "all" || phaseFilter !== "all"
  const hiddenCount = sorted.length - filtered.length

  return (
    <div className="max-w-5xl mx-auto px-3 py-3">
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

      {/* Filter bar */}
      {hasData && (
        <FilterBar
          setup={setupFilter}
          phase={phaseFilter}
          onSetupChange={(v) => updateQuery({ setup: v })}
          onPhaseChange={(v) => updateQuery({ phase: v })}
          onClear={() => updateQuery({ setup: "all", phase: "all" })}
          showBackendPendingNote={backendPending}
        />
      )}

      {/* Cards */}
      {hasData ? (
        filtered.length > 0 ? (
          <div>
            {filterActive && (
              <div className="text-[11px] text-sub mb-2">
                Showing {filtered.length} of {sorted.length}
                {hiddenCount > 0 && <span className="opacity-70"> · {hiddenCount} hidden by filters</span>}
              </div>
            )}
            {filtered.map((result) => (
              <ScannerCard key={result.ticker} result={result} />
            ))}
          </div>
        ) : (
          <div className="text-center py-12 text-sub">
            <p className="text-sm mb-2">No results match the current filters.</p>
            <button
              onClick={() => updateQuery({ setup: "all", phase: "all" })}
              className="text-xs text-teal hover:underline"
            >
              Clear filters
            </button>
          </div>
        )
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
