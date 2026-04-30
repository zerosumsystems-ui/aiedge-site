"use client"

import type { ScanResult } from "@/lib/types"
import { getRegularSessionBars } from "@/lib/opening-features"

type ExtremeKind = "hod" | "lod"

export type ExtremeBarFilter = "all" | `${ExtremeKind}:${number}`

type DayExtremeBars = {
  hodBar: number
  lodBar: number
}

export type ExtremeBarOption = {
  value: ExtremeBarFilter
  label: string
  count?: number
}

const EXTREME_FILTER_PATTERN = /^(hod|lod):([1-9]\d*)$/

export function parseExtremeBarFilter(raw: string | null): ExtremeBarFilter {
  if (!raw || raw === "all") return "all"
  const match = raw.match(EXTREME_FILTER_PATTERN)
  if (!match) return "all"
  return `${match[1] as ExtremeKind}:${Number(match[2])}` as ExtremeBarFilter
}

export function getDayExtremeBars(result: ScanResult): DayExtremeBars | null {
  const bars = getRegularSessionBars(result.chart)
  if (bars.length === 0) return null

  let high = -Infinity
  let low = Infinity
  let highIndex = 0
  let lowIndex = 0

  for (let index = 0; index < bars.length; index += 1) {
    const bar = bars[index]
    if (bar.h > high) {
      high = bar.h
      highIndex = index
    }
    if (bar.l < low) {
      low = bar.l
      lowIndex = index
    }
  }

  return {
    hodBar: highIndex + 1,
    lodBar: lowIndex + 1,
  }
}

export function buildExtremeBarOptions(
  results: ScanResult[],
  selected: ExtremeBarFilter,
): ExtremeBarOption[] {
  const counts = new Map<ExtremeBarFilter, number>()

  for (const result of results) {
    const extremes = getDayExtremeBars(result)
    if (!extremes) continue
    const hod = `hod:${extremes.hodBar}` as ExtremeBarFilter
    const lod = `lod:${extremes.lodBar}` as ExtremeBarFilter
    counts.set(hod, (counts.get(hod) ?? 0) + 1)
    counts.set(lod, (counts.get(lod) ?? 0) + 1)
  }

  if (selected !== "all" && !counts.has(selected)) {
    counts.set(selected, 0)
  }

  const options = Array.from(counts.entries()).map(([value, count]) => ({
    value,
    label: formatExtremeBarFilter(value),
    count,
  }))

  options.sort((a, b) => {
    const aParsed = parseExtremeValue(a.value)
    const bParsed = parseExtremeValue(b.value)
    if (!aParsed || !bParsed) return 0
    if (aParsed.kind !== bParsed.kind) return aParsed.kind === "hod" ? -1 : 1
    return aParsed.bar - bParsed.bar
  })

  return [{ value: "all", label: "All" }, ...options]
}

export function filterByExtremeBar(
  results: ScanResult[],
  filter: ExtremeBarFilter,
): ScanResult[] {
  if (filter === "all") return results
  const parsed = parseExtremeValue(filter)
  if (!parsed) return results

  return results.filter((result) => {
    const extremes = getDayExtremeBars(result)
    if (!extremes) return false
    return parsed.kind === "hod" ? extremes.hodBar === parsed.bar : extremes.lodBar === parsed.bar
  })
}

export function formatExtremeBarFilter(filter: ExtremeBarFilter): string {
  if (filter === "all") return "All"
  const parsed = parseExtremeValue(filter)
  if (!parsed) return "All"
  return `${parsed.kind === "hod" ? "High" : "Low"} made on bar ${parsed.bar}`
}

function parseExtremeValue(filter: ExtremeBarFilter): { kind: ExtremeKind; bar: number } | null {
  if (filter === "all") return null
  const match = filter.match(EXTREME_FILTER_PATTERN)
  if (!match) return null
  return {
    kind: match[1] as ExtremeKind,
    bar: Number(match[2]),
  }
}

export function DayExtremeFilterBar({
  value,
  options,
  totalCount,
  filteredCount,
  onChange,
  onClear,
}: {
  value: ExtremeBarFilter
  options: ExtremeBarOption[]
  totalCount: number
  filteredCount: number
  onChange: (value: ExtremeBarFilter) => void
  onClear: () => void
}) {
  const active = value !== "all"
  const activeLabel = options.find((option) => option.value === value)?.label ?? formatExtremeBarFilter(value)

  return (
    <div className="mb-2 flex flex-col gap-1 text-[11px] text-sub">
      <div className="flex flex-wrap items-center gap-1.5">
        <span>Filter:</span>
        <div
          className={`relative flex items-center rounded border text-sm transition-colors ${
            active
              ? "border-teal bg-teal/[.18] text-teal"
              : "border-border bg-surface text-text hover:border-teal"
          }`}
        >
          <span className="pointer-events-none py-1.5 pl-2.5 pr-1 font-mono text-[11px] opacity-80 sm:py-1">
            Day Extreme:
          </span>
          <span className="pointer-events-none py-1.5 pr-6 font-mono text-[12px] tracking-tight sm:py-1">
            {activeLabel}
          </span>
          <span
            aria-hidden
            className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] opacity-70"
          >
            v
          </span>
          <select
            value={value}
            onChange={(event) => onChange(event.target.value as ExtremeBarFilter)}
            aria-label="Day extreme bar"
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          >
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.count === undefined ? option.label : `${option.label} (${option.count})`}
              </option>
            ))}
          </select>
        </div>

        {active && (
          <button
            type="button"
            onClick={onClear}
            className="cursor-pointer rounded border border-border bg-surface px-2.5 py-1.5 text-sm text-text transition-colors hover:border-teal sm:py-1"
          >
            Clear filter
          </button>
        )}

        {active && (
          <span className="text-[11px] text-sub">
            Showing {filteredCount} of {totalCount}
          </span>
        )}
      </div>
    </div>
  )
}
