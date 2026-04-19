"use client"

import type { ScanResult } from "@/lib/types"
import { ScoreBar } from "./ScoreBar"
import { ComponentTiles } from "./ComponentTiles"
import { SignalBadge } from "./SignalBadge"
import { LightweightChart } from "@/components/charts/LightweightChart"

const ADR_TIER_STYLES: Record<string, string> = {
  cold: "text-sub bg-transparent",
  warm: "text-teal bg-teal/10 border border-teal/25",
  hot: "text-white bg-teal/35 border border-teal shadow-[0_0_0_1px_rgba(0,200,150,.2)]",
  extreme: "text-white bg-teal border border-teal shadow-[0_0_12px_rgba(0,200,150,.4)]",
}

const FILL_STYLES: Record<string, string> = {
  held: "bg-teal/15 text-teal",
  partial: "bg-[rgb(255,200,50)]/15 text-[#cca000]",
  recovered: "bg-[rgb(100,180,255)]/15 text-[#5ba8e6]",
  failed: "bg-[rgb(255,80,80)]/15 text-[#e05050]",
}

// HTF chip — see scanner aiedge/context/htf.py. "no_data" renders nothing.
const HTF_STYLES: Record<string, string> = {
  aligned: "bg-teal/10 text-teal border border-teal/35",
  mixed: "bg-[rgb(245,200,66)]/10 text-[#f5c842] border border-[rgb(245,200,66)]/30",
  opposed: "bg-red/10 text-red border border-red/35",
}

const HTF_TITLES: Record<string, string> = {
  aligned: "Higher-timeframe aligned — daily + weekly bias match the setup direction.",
  mixed: "Higher-timeframe mixed — one of daily/weekly aligns, the other is neutral or opposed.",
  opposed: "Higher-timeframe opposed — both daily + weekly bias oppose the setup direction.",
}

function formatDayType(dt: string): string {
  return dt.replace(/_/g, " ")
}

function trendChip(ts: ScanResult["trendState"]) {
  if (!ts || ts.direction === "none") return null
  const arrow = ts.direction === "up" ? "↑" : "↓"
  const toneClass = ts.direction === "up"
    ? "bg-teal/10 text-teal border border-teal/35"
    : "bg-red/10 text-red border border-red/35"
  const structShort = ts.structure.replace(/^bull_|^bear_/, "").replace(/_/g, " ")
  const strengthPct = Math.round(ts.strength * 100)
  return { arrow, toneClass, structShort, strengthPct }
}

export function ScannerCard({ result }: { result: ScanResult }) {
  const { ticker, rank, urgency, uncertainty, signal, dayType, cyclePhase, fillStatus,
    htfAlignment, adr, adrRatio, adrMult, adrTier, movement, components, warning,
    summary, chart, trendState } = result

  const movementClass = movement === "NEW" ? "text-teal" :
    movement.startsWith("+") ? "text-teal font-semibold" :
    movement.startsWith("-") ? "text-red font-semibold" : "text-sub"

  // Arrow matches direction: SELL → down, BUY → up. Non-directional signals skip the chip.
  const htfArrow = signal === "SELL" ? "↓" : "↑"
  const htfLabel = htfAlignment === "aligned"
    ? `${htfArrow}D ${htfArrow}W`
    : htfAlignment === "mixed"
      ? "↕"
      : htfAlignment === "opposed"
        ? "✗"
        : null

  const trend = trendChip(trendState)

  return (
    <details className="bg-surface border border-border rounded-lg mb-2 overflow-hidden group">
      <summary className="list-none cursor-pointer p-2 sm:p-2.5 px-2 sm:px-3 grid grid-cols-[24px_minmax(0,1fr)_auto_auto] sm:grid-cols-[28px_minmax(80px,auto)_1fr_70px_auto] items-center gap-2 sm:gap-3 select-none [-webkit-tap-highlight-color:transparent] [&::-webkit-details-marker]:hidden">
        {/* Rank */}
        <div className="text-xs text-sub text-center">
          <span className="text-[13px] font-semibold text-text">{rank}</span>
        </div>

        {/* Ticker block */}
        <div className="min-w-0">
          <div className="text-base font-bold tracking-tight">
            {ticker}
            {htfAlignment && htfLabel && (
              <span
                title={HTF_TITLES[htfAlignment]}
                className={`inline-block align-middle ml-1.5 px-1.5 py-px rounded-full text-[10px] font-semibold tracking-wide ${HTF_STYLES[htfAlignment] || ""}`}
              >
                {htfLabel}
              </span>
            )}
          </div>
          <div className="text-[11px] text-sub whitespace-nowrap overflow-hidden text-ellipsis">
            {formatDayType(dayType)}
            {cyclePhase && (
              <span className="inline-block ml-1.5 px-1.5 py-px border border-border rounded text-[9.5px] tracking-wide text-teal bg-teal/[.06]">
                {cyclePhase}
              </span>
            )}
            {trend && (
              <span
                title={`Canonical trend: ${trendState!.direction} · strength ${trend.strengthPct}% · ${trend.structShort} · confidence ${(trendState!.confidence * 100).toFixed(0)}%`}
                className={`inline-block ml-1.5 px-1.5 py-px rounded text-[9.5px] font-semibold tracking-wide ${trend.toneClass}`}
              >
                {trend.arrow} {trend.strengthPct}% · {trend.structShort}
              </span>
            )}
            {fillStatus && (
              <span className={`inline-block text-[10px] px-[5px] py-px rounded ml-1 ${FILL_STYLES[fillStatus] || ""}`}>
                {fillStatus} fill
              </span>
            )}
          </div>
        </div>

        {/* ADR block — hidden on mobile, shown in body */}
        <div className="hidden sm:block min-w-0 pl-1">
          <div className="text-xs text-sub whitespace-nowrap truncate">${adr.toFixed(2)} ADR</div>
          <div className="text-[11px] text-sub opacity-70 whitespace-nowrap">{adrRatio.toFixed(1)}× move</div>
        </div>

        {/* ADR multiple pill */}
        <div className={`text-center py-1.5 px-2 rounded-md tabular-nums whitespace-nowrap min-w-[48px] sm:min-w-[50px] leading-tight ${ADR_TIER_STYLES[adrTier] || ADR_TIER_STYLES.cold}`}>
          <div className="text-[14px] sm:text-[15px] font-bold tracking-tight">{adrMult.toFixed(2)}×</div>
          <div className="text-[9px] opacity-65 tracking-widest">ADR</div>
        </div>

        {/* Scores */}
        <div className="flex flex-col items-end gap-1.5 sm:gap-2">
          <SignalBadge signal={signal} />
          <ScoreBar label="URG" value={urgency} variant="urgency" />
          <ScoreBar label="UNC" value={uncertainty} variant="uncertainty" />
        </div>
      </summary>

      {/* Expanded content */}
      <div className="border-t border-border">
        {/* ADR block on mobile (moved from summary) */}
        <div className="sm:hidden px-3 pt-2 flex items-baseline gap-3 text-[11px] text-sub">
          <span className="tabular-nums">${adr.toFixed(2)} ADR</span>
          <span className="tabular-nums">{adrRatio.toFixed(1)}× move</span>
        </div>

        {/* Movement */}
        <div className="px-3 py-2 flex items-center gap-2">
          <span className={`text-[11px] ${movementClass}`}>{movement}</span>
        </div>

        {/* Component tiles */}
        <ComponentTiles scores={components} />

        {/* Warning */}
        {warning && (
          <div className="mx-3 mb-2 px-2.5 py-1.5 bg-orange/10 border-l-[3px] border-orange rounded text-xs text-orange">
            ⚠ {warning}
          </div>
        )}

        {/* Summary */}
        {summary && (
          <div className="px-3 pb-2.5 text-xs text-sub leading-relaxed">
            {summary}
          </div>
        )}

        {/* Chart */}
        {chart && chart.bars && chart.bars.length > 0 ? (
          <div className="px-3 pb-3">
            <LightweightChart chart={chart} height={260} compact />
          </div>
        ) : (
          <div className="py-4 px-3 text-xs text-sub text-center">No chart available</div>
        )}
      </div>
    </details>
  )
}
