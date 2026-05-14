"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"

interface Candidate {
  id: number
  symbol: string
  session_date: string
  pattern: string
  direction: "long" | "short"
  fire_ts: number
  pivot_index: number
  fired_bar_index: number
  consecutive_count: number
  strong_count: number
  score: number
  status: string
  source: "backfill" | "live"
  created_at: string
}

type PatternFilter = "all" | "tfo"
type DirectionFilter = "all" | "long" | "short"

const PATTERN_LABEL: Record<string, string> = {
  tfo: "TFO",
}

function formatScore(n: number): string {
  return n.toFixed(1)
}

function formatTime(epochSec: number): string {
  return new Date(epochSec * 1000).toLocaleTimeString("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }) + " ET"
}

export function ScannerCandidatesList() {
  const [candidates, setCandidates] = useState<Candidate[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [patternFilter, setPatternFilter] = useState<PatternFilter>("all")
  const [directionFilter, setDirectionFilter] = useState<DirectionFilter>("all")

  // Refetch when filters change. We intentionally hold the previous
  // result on screen during the next fetch (no "clear to null") so the
  // UI doesn't flash empty between filter switches.
  useEffect(() => {
    const ac = new AbortController()
    const qs = new URLSearchParams({ limit: "200" })
    if (patternFilter !== "all") qs.set("pattern", patternFilter)
    if (directionFilter !== "all") qs.set("direction", directionFilter)
    fetch(`/api/scanner/candidates?${qs}`, { cache: "no-store", signal: ac.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return (await r.json()) as { candidates: Candidate[] }
      })
      .then((d) => {
        setCandidates(d.candidates)
        setError(null)
      })
      .catch((e: unknown) => {
        if (ac.signal.aborted) return
        setError(e instanceof Error ? e.message : String(e))
      })
    return () => {
      ac.abort()
    }
  }, [patternFilter, directionFilter])

  const grouped = useMemo(() => {
    if (!candidates) return new Map<string, Candidate[]>()
    const m = new Map<string, Candidate[]>()
    for (const c of candidates) {
      const arr = m.get(c.session_date) ?? []
      arr.push(c)
      m.set(c.session_date, arr)
    }
    return m
  }, [candidates])

  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <header className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Scanner</h1>
          <p className="text-xs text-sub">
            Setup candidates surfaced from recent sessions. Click any row to open the chart at the fire bar.
          </p>
        </div>
        <Link href="/journal" className="text-xs font-semibold text-teal hover:underline">
          Journal →
        </Link>
      </header>

      <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
        <span className="text-sub">Pattern:</span>
        <FilterPill active={patternFilter === "all"} onClick={() => setPatternFilter("all")}>
          All
        </FilterPill>
        <FilterPill active={patternFilter === "tfo"} onClick={() => setPatternFilter("tfo")}>
          TFO
        </FilterPill>
        <span className="ml-3 text-sub">Direction:</span>
        <FilterPill active={directionFilter === "all"} onClick={() => setDirectionFilter("all")}>
          All
        </FilterPill>
        <FilterPill active={directionFilter === "long"} onClick={() => setDirectionFilter("long")}>
          Long
        </FilterPill>
        <FilterPill active={directionFilter === "short"} onClick={() => setDirectionFilter("short")}>
          Short
        </FilterPill>
      </div>

      {error && (
        <div className="rounded-md border border-red/40 bg-red/10 px-3 py-2 text-xs text-red">
          {error}
        </div>
      )}

      {!error && candidates === null && (
        <div className="text-xs text-sub">Loading…</div>
      )}

      {!error && candidates !== null && candidates.length === 0 && (
        <div className="rounded-md border border-border bg-surface px-3 py-6 text-center text-xs text-sub">
          No candidates yet. Run{" "}
          <code className="rounded bg-bg px-1.5 py-0.5 text-text">
            scripts/backfill_tfo_candidates.py
          </code>{" "}
          to populate.
        </div>
      )}

      {!error && candidates !== null && candidates.length > 0 && (
        <div className="space-y-6">
          {Array.from(grouped.entries()).map(([date, rows]) => (
            <section key={date}>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-sub">
                {date}
              </h2>
              <div className="overflow-hidden rounded-md border border-border bg-surface">
                <table className="w-full text-sm">
                  <thead className="border-b border-border bg-bg text-[11px] uppercase tracking-[0.12em] text-sub">
                    <tr>
                      <th className="px-3 py-2 text-left">Symbol</th>
                      <th className="px-3 py-2 text-left">Pattern</th>
                      <th className="px-3 py-2 text-left">Dir</th>
                      <th className="px-3 py-2 text-right">Fire</th>
                      <th className="px-3 py-2 text-right">Run</th>
                      <th className="px-3 py-2 text-right">Strong</th>
                      <th className="px-3 py-2 text-right">Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((c) => (
                      <tr
                        key={c.id}
                        className="border-b border-border/60 last:border-b-0 hover:bg-surface-hover"
                      >
                        <td className="px-3 py-2 font-semibold">
                          <Link
                            href={`/symbol/${c.symbol}?t=${c.fire_ts}&pattern=${c.pattern}&direction=${c.direction}`}
                            className="text-teal hover:underline"
                          >
                            {c.symbol}
                          </Link>
                        </td>
                        <td className="px-3 py-2 text-xs uppercase tracking-wide text-sub">
                          {PATTERN_LABEL[c.pattern] ?? c.pattern}
                        </td>
                        <td className={`px-3 py-2 text-xs font-semibold uppercase ${c.direction === "long" ? "text-teal" : "text-red"}`}>
                          {c.direction}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-xs tabular-nums">
                          {formatTime(c.fire_ts)}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-xs tabular-nums">
                          {c.consecutive_count}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-xs tabular-nums">
                          {c.strong_count}/{c.consecutive_count}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-xs tabular-nums font-semibold">
                          {formatScore(c.score)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
      )}
    </main>
  )
}

function FilterPill({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
        active
          ? "border-teal bg-teal/10 text-teal"
          : "border-border bg-surface text-sub hover:bg-surface-hover hover:text-text"
      }`}
    >
      {children}
    </button>
  )
}
