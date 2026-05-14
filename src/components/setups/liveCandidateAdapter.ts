/**
 * Adapter: turn a live setup_candidates row + its 5min RTH session bars
 * into a FeaturedSetup that HeroSetupTape can animate.
 *
 * The same tape component now runs for both the hand-crafted hero reel
 * (LP / / setups with no params) and a clicked scanner row
 * (/setups?ticker=...&t=...&pattern=...&direction=...). The adapter
 * lives here so the tape component stays presentation-only.
 */

import type { Signal } from "@/lib/types"
import type {
  FeaturedSetup,
  PhaseAnchor,
  RawBar,
} from "@/components/landing/HeroSetupTape"

interface CandidateLike {
  symbol: string
  session_date: string
  pattern: string
  direction: "long" | "short"
  fire_ts: number
  pivot_ts?: number | null
  pivot_index?: number | null
  fired_bar_index?: number | null
  consecutive_count?: number | null
  strong_count?: number | null
  score?: number | null
  model_score?: number | null
  outcome_net_pct?: number | null
  outcome_mfe_pct?: number | null
  outcome_mae_pct?: number | null
  strong_bar_ts?: number[] | null
}

interface ApiBar { t: number; o: number; h: number; l: number; c: number; v?: number }

function pickSignal(direction: "long" | "short", modelScore: number | null | undefined): Signal {
  // Map model_score into the existing 5-state Signal vocab. The hero reel
  // uses these strings for the chip in the corner; we mirror the spirit:
  // high conviction → BUY/SELL, low → WAIT, missing → WAIT.
  const score = typeof modelScore === "number" ? modelScore : 0.5
  if (score >= 0.65) return direction === "long" ? "BUY" : "SELL"
  if (score >= 0.5) return "WAIT"
  return "AVOID"
}

function formatSessionLabel(iso: string): string {
  // iso is YYYY-MM-DD in ET. Render as "Thu, May 14 2026 · RTH".
  const [y, m, d] = iso.split("-").map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  const day = dt.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" })
  const mon = dt.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" })
  return `${day}, ${mon} ${d} ${y} · RTH`
}

function buildRead(candidate: CandidateLike): string {
  // 1-2 sentence Brooks-style description of the setup, used in the
  // reveal panel under the chart. Honest about what we know: the rule
  // that fired + what the model thinks. No editorial spin.
  const dir = candidate.direction
  const pivotName = dir === "long" ? "LOD" : "HOD"
  const closeName = dir === "long" ? "bull" : "bear"
  const consec = candidate.consecutive_count ?? 0
  const strong = candidate.strong_count ?? 0
  const modelPct = candidate.model_score != null ? Math.round(candidate.model_score * 100) : null
  const modelClause = modelPct != null ? ` Model: ${modelPct}% P(≥1% favorable in 2h).` : ""
  return `TFO ${dir}. ${pivotName} formed in the first 4 RTH 5-min bars, then ${consec} consecutive ${closeName} closes (${strong} Brooks-strong).${modelClause}`
}

/**
 * Build a FeaturedSetup from a live candidate row + that session's bars.
 * Returns null if the bars can't be aligned to the candidate (fire bar
 * missing or pivot/fire indices implausible).
 */
export function liveCandidateToFeatured(
  candidate: CandidateLike,
  bars: ApiBar[],
): FeaturedSetup | null {
  if (!bars.length) return null

  // Resolve pivot + fire indices. Trust the candidate fields, but if
  // pivot_index is null (some legacy rows had it nulled), derive from
  // fire_ts: pivot = fire - 3 bars.
  const fireIdx = bars.findIndex((b) => b.t === candidate.fire_ts)
  if (fireIdx < 0) return null
  const pivotIdx =
    candidate.pivot_index ?? Math.max(0, fireIdx - 3)
  if (pivotIdx < 0 || pivotIdx >= bars.length) return null

  // Show the full RTH session — the upstream /api/bars query already
  // filters to RTH, so all bars are 9:30 → 16:00 ET. The reveal animation
  // lands on the fire bar and then continues through the rest of the
  // session so the trader sees what happened *after* the setup fired
  // (the outcome window). This matches the deep-dive chart's framing.
  const windowBars = bars
  const adjPivot = pivotIdx
  const adjFire = fireIdx

  // Build phase anchors — each labels the top-left chip from that bar
  // onward, until the next anchor takes over.
  const dir = candidate.direction
  const phases: PhaseAnchor[] = [
    { from: 0, label: "open" },
    { from: adjPivot, label: dir === "long" ? "LOD" : "HOD" },
  ]
  // Confirming bars 1..N
  const consec = candidate.consecutive_count ?? 3
  for (let i = 1; i <= Math.min(3, consec); i++) {
    if (adjPivot + i < adjFire) {
      phases.push({
        from: adjPivot + i,
        label: `confirm ${i}/${Math.min(3, consec)}`,
      })
    }
  }
  phases.push({
    from: adjFire,
    label: dir === "long" ? "FIRE — long" : "FIRE — short",
  })
  if (adjFire + 1 < windowBars.length) {
    phases.push({ from: adjFire + 1, label: "post-fire" })
  }

  // Heuristic stop/target. Anchored to the fire bar's close ± half a
  // session range, since the detector doesn't emit a principled risk
  // frame yet. Skip both if any input looks degenerate.
  const fire = windowBars[adjFire]
  const entryPrice = fire.c
  const sessionHi = Math.max(...windowBars.slice(0, adjFire + 1).map((b) => b.h))
  const sessionLo = Math.min(...windowBars.slice(0, adjFire + 1).map((b) => b.l))
  const sessionRange = sessionHi - sessionLo
  let stopPrice: number | undefined
  let targetPrice: number | undefined
  if (sessionRange > 0 && entryPrice > 0) {
    const risk = Math.max(sessionRange * 0.5, fire.h - fire.l)
    if (dir === "long") {
      stopPrice = entryPrice - risk
      targetPrice = entryPrice + risk * 2
    } else {
      stopPrice = entryPrice + risk
      targetPrice = entryPrice - risk * 2
    }
  }

  // Translate the detector's epoch timestamps into bar indices. The
  // windowBars array now spans the full session, so indices into `bars`
  // and `windowBars` are identical. Both fields come from the same
  // source of truth (setup_candidates pivot_ts / strong_bar_ts written
  // by the Python detector) — the chart re-derives nothing.
  let pivotBarIndex: number | undefined
  if (candidate.pivot_ts != null) {
    const idx = windowBars.findIndex((b) => b.t === candidate.pivot_ts)
    if (idx >= 0) pivotBarIndex = idx
  }
  const strongBarIndices: number[] = []
  for (const t of candidate.strong_bar_ts ?? []) {
    const idx = windowBars.findIndex((b) => b.t === t)
    if (idx >= 0) strongBarIndices.push(idx)
  }

  const modelScore = candidate.model_score
  return {
    symbol: candidate.symbol,
    timeframe: "5-min",
    sessionLabel: formatSessionLabel(candidate.session_date),
    read: buildRead(candidate),
    direction: dir,
    signal: pickSignal(dir, modelScore),
    urgency: typeof modelScore === "number" ? modelScore : 0.5,
    uncertainty: typeof modelScore === "number" ? 1 - modelScore : 0.5,
    edge: {
      // We don't have a clean R-multiple for live setups yet. Surface
      // the realized net% (in pct points, not R) so the chip is
      // legible. When outcomes aren't computed, default 0.
      eq: (candidate.outcome_net_pct ?? 0) / 100,
      note: `${candidate.consecutive_count ?? 0} ${dir === "long" ? "bull" : "bear"} closes · ${candidate.strong_count ?? 0} Brooks-strong`,
    },
    adrMultiple: 1.0,
    signalBarIndex: adjFire,
    entryPrice,
    stopPrice,
    targetPrice,
    phases,
    bars: windowBars.map<RawBar>((b) => ({ t: b.t, o: b.o, h: b.h, l: b.l, c: b.c })),
    deepDiveHref: `/symbol/${encodeURIComponent(candidate.symbol)}?t=${candidate.fire_ts}&pattern=${candidate.pattern}&direction=${candidate.direction}`,
    pivotBarIndex,
    strongBarIndices,
  }
}

/**
 * Fetch a single live candidate (by URL params) + its session bars,
 * and adapt into a FeaturedSetup. Returns null if any fetch fails or
 * the bars can't be aligned to the candidate.
 */
export async function fetchLiveSetup(params: {
  ticker: string
  fireTs: number
  pattern: string
  direction: "long" | "short"
}): Promise<FeaturedSetup | null> {
  // The pinned candidates lookup wants the session_date in ET. Derive
  // it from fireTs.
  const sessionIso = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(params.fireTs * 1000))

  const candQs = new URLSearchParams({
    symbol: params.ticker,
    pattern: params.pattern,
    direction: params.direction,
    date: sessionIso,
    limit: "1",
  })
  const candRes = await fetch(`/api/scanner/candidates?${candQs}`, { cache: "no-store" })
  if (!candRes.ok) return null
  const candJson = (await candRes.json()) as { candidates: CandidateLike[] }
  const candidate = candJson.candidates?.[0]
  if (!candidate) return null

  const barsQs = new URLSearchParams({
    ticker: params.ticker,
    from: sessionIso,
    to: sessionIso,
    tf: "5min",
    session: "rth",
    limit: "200",
  })
  const barsRes = await fetch(`/api/bars?${barsQs}`)
  if (!barsRes.ok) return null
  const barsJson = (await barsRes.json()) as { bars?: ApiBar[] }
  const bars = barsJson.bars ?? []
  if (!bars.length) return null

  return liveCandidateToFeatured(candidate, bars)
}
