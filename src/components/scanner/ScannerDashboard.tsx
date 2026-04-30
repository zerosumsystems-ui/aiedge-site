"use client"

import { useState, useEffect, useCallback, useMemo, Suspense } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import type { ScanPayload } from "@/lib/types"
import { ScannerCard } from "./ScannerCard"
import {
  DayExtremeFilterBar,
  buildExtremeBarOptions,
  filterByExtremeBar,
  parseExtremeBarFilter,
  type ExtremeBarFilter,
} from "./DayExtremeFilterBar"

const EMPTY_RESULTS: ScanPayload["results"] = []

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
  const [loading, setLoading] = useState(true)
  const extremeFilter = parseExtremeBarFilter(searchParams.get("extreme"))

  const updateExtremeFilter = useCallback(
    (nextFilter: ExtremeBarFilter) => {
      const params = new URLSearchParams(searchParams.toString())
      params.delete("setup")
      params.delete("phase")
      if (nextFilter === "all") params.delete("extreme")
      else params.set("extreme", nextFilter)
      const queryString = params.toString()
      router.replace(queryString ? `${pathname}?${queryString}` : pathname, { scroll: false })
    },
    [pathname, router, searchParams],
  )

  useEffect(() => {
    if (!searchParams.has("setup") && !searchParams.has("phase")) return
    const params = new URLSearchParams(searchParams.toString())
    params.delete("setup")
    params.delete("phase")
    const queryString = params.toString()
    router.replace(queryString ? `${pathname}?${queryString}` : pathname, { scroll: false })
  }, [pathname, router, searchParams])

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

  const hasData = Boolean(data && data.results.length > 0)
  const results = data?.results ?? EMPTY_RESULTS
  const filterOptions = useMemo(
    () => buildExtremeBarOptions(results, extremeFilter),
    [results, extremeFilter],
  )
  const filteredResults = useMemo(
    () => filterByExtremeBar(results, extremeFilter),
    [results, extremeFilter],
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-sub text-sm">Loading scanner data...</div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-[1600px] px-2 py-2 sm:px-3 sm:py-3">
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

      {/* Filter */}
      {hasData && (
        <DayExtremeFilterBar
          value={extremeFilter}
          options={filterOptions}
          totalCount={results.length}
          filteredCount={filteredResults.length}
          onChange={updateExtremeFilter}
          onClear={() => updateExtremeFilter("all")}
        />
      )}

      {/* Cards */}
      {hasData ? (
        filteredResults.length > 0 ? (
          <div>
            {filteredResults.map((result) => (
              <ScannerCard key={result.ticker} result={result} scanDate={data?.date ?? ""} />
            ))}
          </div>
        ) : (
          <div className="py-12 text-center text-sub">
            <p className="mb-2 text-sm">No cards match that day extreme.</p>
            <button
              type="button"
              onClick={() => updateExtremeFilter("all")}
              className="text-xs text-teal hover:underline"
            >
              Clear filter
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
