"use client"

import { useEffect, useMemo, useState, useSyncExternalStore } from "react"
import type { Bar, ChartData, ScanResult } from "@/lib/types"
import { LightweightChart } from "@/components/charts/LightweightChart"
import {
  buildRegularSessionChart,
  getRegularSessionOpeningBars,
} from "@/lib/opening-features"

const FULL_DAY_RANGE = { from: -1, to: 78 }
const OPENING_WINDOW_OPTIONS = [2, 3, 4, 6, 8, 10, 12, 14, 16, 18]
const MOBILE_BAR_WIDTH = 10
const DESKTOP_BAR_WIDTH = 12.5
const MOBILE_OPENING_MIN_WIDTH = 96
const DESKTOP_OPENING_MIN_WIDTH = 140

type BarsResponse = {
  bars?: Bar[]
  error?: string
}

function ChartPanel({
  title,
  detail,
  chart,
  height,
  className = "",
  hideScales = false,
  logicalRange,
}: {
  title: string
  detail: string
  chart: ChartData
  height: number
  className?: string
  hideScales?: boolean
  logicalRange?: { from: number; to: number }
}) {
  return (
    <section className={`min-w-0 space-y-1.5 ${className}`}>
      <div className="flex h-4 min-w-0 items-baseline justify-between gap-1 overflow-hidden text-[9px] uppercase tracking-normal sm:text-[10px] sm:tracking-[0.12em]">
        <h3 className="min-w-0 truncate font-semibold text-text">{title}</h3>
        <span className="hidden shrink-0 text-sub tabular-nums sm:inline">{detail}</span>
      </div>
      <LightweightChart
        chart={chart}
        height={height}
        compact
        hideScales={hideScales}
        fitContent={false}
        logicalRange={logicalRange}
      />
    </section>
  )
}

function buildMinuteOpeningChart(bars: Bar[] | undefined, count: number): ChartData | null {
  if (!bars?.length) return null
  return { bars: bars.slice(0, count), timeframe: "1min" }
}

function buildOpeningFiveMinuteChart(chart: ChartData | undefined, count: number): ChartData | null {
  const bars = getRegularSessionOpeningBars(chart, count)
  if (!bars.length || !chart) return null
  return { ...chart, bars, keyLevels: undefined, annotations: undefined }
}

function useMediaQuery(query: string) {
  return useSyncExternalStore(
    (onStoreChange) => {
      const media = window.matchMedia(query)
      media.addEventListener("change", onStoreChange)
      return () => media.removeEventListener("change", onStoreChange)
    },
    () => window.matchMedia(query).matches,
    () => false,
  )
}

export function ScannerCard({ result, scanDate }: { result: ScanResult; scanDate: string }) {
  const { ticker, chart } = result
  const [minuteBars, setMinuteBars] = useState<Bar[] | null>(null)
  const [minuteError, setMinuteError] = useState(false)
  const [openingBars, setOpeningBars] = useState(4)
  const isDesktop = useMediaQuery("(min-width: 768px)")
  const chartHeight = isDesktop ? 300 : 250
  const barWidth = isDesktop ? DESKTOP_BAR_WIDTH : MOBILE_BAR_WIDTH
  const minuteCount = openingBars * 5
  const openingMinWidth = isDesktop ? DESKTOP_OPENING_MIN_WIDTH : MOBILE_OPENING_MIN_WIDTH
  const openingWidth = Math.max(Math.round(openingBars * barWidth), openingMinWidth)

  const fullDayChart = useMemo(() => buildRegularSessionChart(chart), [chart])
  const openingFiveMinuteChart = useMemo(() => buildOpeningFiveMinuteChart(chart, openingBars), [chart, openingBars])
  const openingOneMinuteChart = useMemo(
    () => buildMinuteOpeningChart(minuteBars ?? undefined, minuteCount),
    [minuteBars, minuteCount],
  )
  const openingLogicalRange = useMemo(() => ({ from: -0.5, to: openingBars + 0.5 }), [openingBars])
  const oneMinuteLogicalRange = useMemo(() => ({ from: -0.5, to: minuteCount + 0.5 }), [minuteCount])

  useEffect(() => {
    if (!scanDate || !ticker) return
    const controller = new AbortController()
    setMinuteError(false)
    setMinuteBars(null)

    async function loadOpeningMinuteBars() {
      try {
        const params = new URLSearchParams({
          ticker,
          from: scanDate,
          to: scanDate,
          tf: "1min",
          session: "open",
          minutes: String(openingBars * 5),
        })
        const response = await fetch(`/api/bars?${params.toString()}`, {
          cache: "default",
          signal: controller.signal,
        })
        if (!response.ok) throw new Error(`bars HTTP ${response.status}`)
        const payload = (await response.json()) as BarsResponse
        if (!payload.bars?.length) throw new Error(payload.error || "No 1m bars")
        setMinuteBars(payload.bars.slice(0, openingBars * 5))
      } catch (error) {
        if (!controller.signal.aborted) {
          console.error(`[scanner] ${ticker} 1m opening bars failed`, error)
          setMinuteError(true)
        }
      }
    }

    void loadOpeningMinuteBars()
    return () => controller.abort()
  }, [openingBars, scanDate, ticker])

  return (
    <details open className="bg-surface border border-border rounded-lg mb-2 overflow-hidden group">
      <summary className="list-none cursor-pointer px-2 py-1.5 sm:p-2.5 sm:px-3 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 sm:gap-3 select-none [-webkit-tap-highlight-color:transparent] [&::-webkit-details-marker]:hidden">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2 text-sm font-bold tracking-tight sm:text-base">
            <span className="truncate">{ticker}</span>
          </div>
        </div>
      </summary>

      <div className="border-t border-border">
        {fullDayChart ? (
          <div className="px-2 py-2 sm:px-3">
            <div className="mb-2 grid grid-cols-10 gap-1 sm:flex sm:items-center sm:gap-1.5 sm:overflow-x-auto">
              {OPENING_WINDOW_OPTIONS.map((count) => (
                <button
                  key={count}
                  type="button"
                  onClick={() => setOpeningBars(count)}
                  className={`min-h-10 min-w-0 rounded border px-1 text-[12px] font-bold tabular-nums transition-colors sm:min-h-11 sm:min-w-11 sm:px-2 ${
                    openingBars === count
                      ? "border-teal bg-teal/20 text-teal"
                      : "border-border bg-bg text-sub"
                  }`}
                >
                  {count}
                </button>
              ))}
            </div>
            <div className="min-w-0">
              <div className="w-full">
                <ChartPanel
                  title="78x5m"
                  detail={`9:30 · ${fullDayChart.bars.length}/78`}
                  chart={fullDayChart}
                  height={chartHeight}
                  logicalRange={FULL_DAY_RANGE}
                />
              </div>
            </div>
            <div
              className="mt-2 grid gap-2"
              style={{ gridTemplateColumns: `${openingWidth}px minmax(0, 1fr)` }}
            >
              <div className="min-w-0">
                {openingFiveMinuteChart && (
                  <ChartPanel
                    title={`${openingBars}x5m`}
                    detail="9:30"
                    chart={openingFiveMinuteChart}
                    height={chartHeight}
                    hideScales
                    logicalRange={openingLogicalRange}
                  />
                )}
              </div>
              <div className="min-w-0">
                {openingOneMinuteChart ? (
                  <ChartPanel
                    title={`${minuteCount}x1m`}
                    detail="9:30"
                    chart={openingOneMinuteChart}
                    height={chartHeight}
                    hideScales
                    logicalRange={oneMinuteLogicalRange}
                  />
                ) : (
                  <section className="space-y-1.5">
                    <div className="flex h-4 min-w-0 items-baseline justify-between gap-1 overflow-hidden text-[9px] uppercase tracking-normal sm:text-[10px] sm:tracking-[0.12em]">
                      <h3 className="min-w-0 truncate font-semibold text-text">{minuteCount}x1m</h3>
                      <span className="hidden shrink-0 text-sub sm:inline">{minuteError ? "unavailable" : "loading"}</span>
                    </div>
                    <div
                      className="grid place-items-center rounded-lg border border-border bg-[#1A1A1A] text-[10px] uppercase tracking-[0.12em] text-sub"
                      style={{ height: chartHeight }}
                    >
                      {minuteError ? "No 1m bars" : "Loading"}
                    </div>
                  </section>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="py-4 px-3 text-xs text-sub text-center">No chart available</div>
        )}
      </div>
    </details>
  )
}
