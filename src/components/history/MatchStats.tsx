'use client'

/** MatchStats — per-match institutional stats panel. Drops in below
 *  each match's existing visuals (full-session chart, spatial overlay,
 *  Brooks bar strip, EMA-relative). Same data the visuals show, but
 *  quantified for trade-decision use.
 *
 *  Conventions:
 *    - All moves in ATR units (mean session bar high-low used as ATR).
 *    - MFE / MAE are direction-aware (relative to the shape's open→
 *      anchor direction, with flipped corpus matches mirrored).
 *    - Bar checkpoints follow the corpus standard 5-min RTH session
 *      (78 bars total, anchor at bar 6 → checkpoints at +6/+18/+42/EOD). */

import type { MatchStats } from '@/lib/match-stats'

interface Props {
  stats: MatchStats
}

function fmtAtr(n: number): string {
  if (!Number.isFinite(n)) return '—'
  if (n === 0) return '0.00A'
  return `${n > 0 ? '+' : ''}${n.toFixed(2)}A`
}

function moveClass(n: number): string {
  if (!Number.isFinite(n) || n === 0) return 'text-sub'
  return n > 0 ? 'text-teal' : 'text-red'
}

function YesNo({ ok }: { ok: boolean }) {
  return (
    <span className={ok ? 'text-teal' : 'text-sub/60'}>
      {ok ? '✓' : '·'}
    </span>
  )
}

export function MatchStats({ stats }: Props) {
  return (
    <div className="border border-border rounded p-2 text-[11px]"
         style={{ background: '#1c1815' }}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 mb-1.5">
        <span className="text-[9px] uppercase tracking-wider text-sub">
          Match stats
        </span>
        <span className="text-sub">{stats.barsAfterAnchor} bars after anchor</span>
        <span className="text-sub">·</span>
        <span className="text-sub">atr ${stats.atr.toFixed(2)}</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-1.5">
        <Cell label="EOD" value={fmtAtr(stats.eodMoveAtr)} cls={moveClass(stats.eodMoveAtr)} />
        <Cell label="MFE" value={fmtAtr(stats.mfeAtr)} cls="text-teal" />
        <Cell label="MAE" value={fmtAtr(stats.maeAtr === 0 ? 0 : -Math.abs(stats.maeAtr))} cls="text-red" />
        <Cell label="MFE/MAE" value={stats.pathRatio === 99 ? '∞' : stats.pathRatio.toFixed(1)} />

        <Cell label="t→peak up" value={`${stats.timeToMaxUp}b`} sub />
        <Cell label="t→peak dn" value={`${stats.timeToMaxDown}b`} sub />
        <Cell label="bars above" value={`${stats.barsAboveAnchor}/${stats.barsAfterAnchor}`} sub />
        <Cell label="vol (ATR)" value={stats.intradayVolAtr.toFixed(3)} sub />
      </div>

      {/* Bar-checkpoint moves */}
      <div className="mt-2 pt-2 border-t border-border/40">
        <div className="text-[9px] uppercase tracking-wider text-sub mb-1">
          Move at bar (close − anchor, ATR)
        </div>
        <div className="grid grid-cols-4 gap-x-3 gap-y-0">
          <Cell label="bar 12" value={fmtAtr(stats.moveAtBar12)} cls={moveClass(stats.moveAtBar12)} />
          <Cell label="bar 24" value={fmtAtr(stats.moveAtBar24)} cls={moveClass(stats.moveAtBar24)} />
          <Cell label="bar 48" value={fmtAtr(stats.moveAtBar48)} cls={moveClass(stats.moveAtBar48)} />
          <Cell label="bar 78 (EOD)" value={fmtAtr(stats.moveAtBar78)} cls={moveClass(stats.moveAtBar78)} />
        </div>
      </div>

      {/* Target / stop probes */}
      <div className="mt-2 pt-2 border-t border-border/40">
        <div className="text-[9px] uppercase tracking-wider text-sub mb-1">
          Reached target / stop in shape direction
        </div>
        <div className="grid grid-cols-6 gap-x-2 text-[10px]">
          <div className="flex items-center gap-1">
            <YesNo ok={stats.reachedPlus1} />
            <span className="text-sub">+1R</span>
          </div>
          <div className="flex items-center gap-1">
            <YesNo ok={stats.reachedPlus2} />
            <span className="text-sub">+2R</span>
          </div>
          <div className="flex items-center gap-1">
            <YesNo ok={stats.reachedPlus3} />
            <span className="text-sub">+3R</span>
          </div>
          <div className="flex items-center gap-1">
            <YesNo ok={stats.reachedMinus1} />
            <span className="text-sub">−1R</span>
          </div>
          <div className="flex items-center gap-1">
            <YesNo ok={stats.reachedMinus2} />
            <span className="text-sub">−2R</span>
          </div>
          <div className="flex items-center gap-1">
            <YesNo ok={stats.reachedMinus3} />
            <span className="text-sub">−3R</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function Cell({ label, value, cls, sub }: {
  label: string
  value: string
  cls?: string
  sub?: boolean
}) {
  return (
    <div className="flex flex-col">
      <span className="text-[9px] text-sub uppercase tracking-wider">{label}</span>
      <span className={`tabular-nums ${cls ?? (sub ? 'text-text/85' : 'text-text')}`}>
        {value}
      </span>
    </div>
  )
}
