"use client"

import type { ScanResult } from "@/lib/types"

type SortKey = "rank" | "urgency" | "adrMult" | "uncertainty" | "trend"

interface SortBarProps {
  onSort: (key: SortKey) => void
  activeKey: SortKey
}

export type { SortKey }

export function SortBar({ onSort, activeKey }: SortBarProps) {
  const buttons: { key: SortKey; label: string }[] = [
    { key: "rank", label: "Rank" },
    { key: "urgency", label: "Urgency" },
    { key: "adrMult", label: "ADR ×" },
    { key: "uncertainty", label: "Uncertainty" },
    { key: "trend", label: "Trend" },
  ]

  return (
    <div className="flex gap-1.5 items-center my-1 mb-2.5 text-[11px] text-sub">
      <span>Sort:</span>
      {buttons.map(({ key, label }) => (
        <button
          key={key}
          onClick={() => onSort(key)}
          className={`px-2.5 py-1.5 sm:py-1 rounded border text-sm cursor-pointer transition-colors ${
            activeKey === key
              ? "bg-teal/[.18] border-teal text-teal"
              : "bg-surface border-border text-text hover:border-teal"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

export function sortResults(results: ScanResult[], key: SortKey): ScanResult[] {
  const sorted = [...results]
  switch (key) {
    case "rank":
      sorted.sort((a, b) => a.rank - b.rank)
      break
    case "urgency":
      sorted.sort((a, b) => b.urgency - a.urgency)
      break
    case "adrMult":
      sorted.sort((a, b) => b.adrMult - a.adrMult)
      break
    case "uncertainty":
      sorted.sort((a, b) => b.uncertainty - a.uncertainty)
      break
    case "trend":
      sorted.sort((a, b) => trendStrength(b) - trendStrength(a))
      break
  }
  return sorted
}

function trendStrength(r: ScanResult): number {
  const ts = r.trendState
  return !ts || ts.direction === "none" ? 0 : ts.strength
}
