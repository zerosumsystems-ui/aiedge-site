"use client"

import type { ScanResult } from "@/lib/types"

export type SetupFilter =
  | "all"
  | "H1"
  | "H2"
  | "L1"
  | "L2"
  | "FL1"
  | "FL2"
  | "FH1"
  | "FH2"
  | "spike_channel"
  | "failed_bo"

export type PhaseFilter =
  | "all"
  | "trend_from_open"
  | "spike_and_channel"
  | "trading_range"
  | "bull_channel"
  | "bear_channel"
  | "trending_tr"
  | "breakout"
  | "undetermined"

const SETUP_OPTIONS: { value: SetupFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "H1", label: "H1" },
  { value: "H2", label: "H2" },
  { value: "L1", label: "L1" },
  { value: "L2", label: "L2" },
  { value: "FL1", label: "FL1" },
  { value: "FL2", label: "FL2" },
  { value: "FH1", label: "FH1" },
  { value: "FH2", label: "FH2" },
  { value: "spike_channel", label: "Spike Channel" },
  { value: "failed_bo", label: "Failed BO" },
]

const PHASE_OPTIONS: { value: PhaseFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "trend_from_open", label: "Trend from Open" },
  { value: "spike_and_channel", label: "Spike & Channel" },
  { value: "trading_range", label: "Trading Range" },
  { value: "bull_channel", label: "Bull Channel" },
  { value: "bear_channel", label: "Bear Channel" },
  { value: "trending_tr", label: "Trending TR" },
  { value: "breakout", label: "Breakout" },
  { value: "undetermined", label: "Undetermined" },
]

interface FilterBarProps {
  setup: SetupFilter
  phase: PhaseFilter
  onSetupChange: (v: SetupFilter) => void
  onPhaseChange: (v: PhaseFilter) => void
  onClear: () => void
  showBackendPendingNote: boolean
}

export function FilterBar({
  setup,
  phase,
  onSetupChange,
  onPhaseChange,
  onClear,
  showBackendPendingNote,
}: FilterBarProps) {
  const hasActive = setup !== "all" || phase !== "all"

  return (
    <div className="flex flex-col gap-1 my-1 mb-2.5 text-[11px] text-sub">
      <div className="flex gap-1.5 items-center flex-wrap">
        <span>Filter:</span>

        <FilterSelect
          label="Setup"
          value={setup}
          options={SETUP_OPTIONS}
          onChange={(v) => onSetupChange(v as SetupFilter)}
          active={setup !== "all"}
        />

        <FilterSelect
          label="Phase"
          value={phase}
          options={PHASE_OPTIONS}
          onChange={(v) => onPhaseChange(v as PhaseFilter)}
          active={phase !== "all"}
        />

        {hasActive && (
          <button
            onClick={onClear}
            className="px-2.5 py-1.5 sm:py-1 rounded border border-border bg-surface text-text hover:border-teal text-sm cursor-pointer transition-colors"
          >
            Clear filters
          </button>
        )}
      </div>

      {showBackendPendingNote && (
        <div className="text-[10.5px] text-sub/80 italic pl-[2.75rem]">
          backend pending — setup filters will kick in when scanner redeploys
        </div>
      )}
    </div>
  )
}

interface FilterSelectProps {
  label: string
  value: string
  options: { value: string; label: string }[]
  onChange: (v: string) => void
  active: boolean
}

function FilterSelect({ label, value, options, onChange, active }: FilterSelectProps) {
  const activeSel = options.find((o) => o.value === value)
  const display = activeSel ? activeSel.label : "All"

  return (
    <div
      className={`relative flex items-center rounded border text-sm transition-colors ${
        active
          ? "bg-teal/[.18] border-teal text-teal"
          : "bg-surface border-border text-text hover:border-teal"
      }`}
    >
      <span className="pl-2.5 pr-1 py-1.5 sm:py-1 font-mono text-[11px] opacity-80 pointer-events-none">
        {label}:
      </span>
      <span className="pr-6 py-1.5 sm:py-1 font-mono text-[12px] tracking-tight pointer-events-none">
        {display}
      </span>
      <span
        aria-hidden
        className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] opacity-70 pointer-events-none"
      >
        ▾
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  )
}

/**
 * Client-side filter logic — applied AFTER sort.
 * - Setup: exact match against `bpaActiveSetups`. Cards without the field don't match.
 * - Phase: exact match OR prefix match (so "breakout" matches "breakout_from_flag").
 */
export function filterResults(
  results: ScanResult[],
  setup: SetupFilter,
  phase: PhaseFilter,
): ScanResult[] {
  if (setup === "all" && phase === "all") return results

  return results.filter((r) => {
    if (setup !== "all") {
      if (!r.bpaActiveSetups?.includes(setup)) return false
    }
    if (phase !== "all") {
      const p = r.phase
      if (!p) return false
      if (p !== phase && !p.startsWith(phase)) return false
    }
    return true
  })
}

/** True if no result currently has bpaActiveSetups populated — signals backend hasn't redeployed. */
export function bpaFieldsMissing(results: ScanResult[]): boolean {
  if (results.length === 0) return false
  return results.every((r) => !r.bpaActiveSetups || r.bpaActiveSetups.length === 0)
}
