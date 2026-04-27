'use client'

/** AggregateStats — DTW-weighted summary across the top-K analog matches.
 *  Mounted once at the top of the matches list, above the post-anchor
 *  evolution chart. The "if I traded based on this set, what does the
 *  data say to expect?" panel.
 *
 *  Three blocks:
 *    1. Hit-rate ladder — likelihood of crossing +1/+2/+3 ATR or
 *       getting stopped at −1/−2/−3.
 *    2. Expectancy at common stop/target — DTW-weighted average
 *       realized return for {target, stop} ∈ {+1/-1, +2/-1, +3/-1}.
 *    3. EOD distribution — five-number summary of where matches
 *       finished, plus mean MFE / MAE for path expectations.
 *
 *  All measurements in ATR units so cross-instrument analogs are
 *  directly comparable. */

import type { AggregateStats } from '@/lib/match-stats'

interface Props {
  stats: AggregateStats
}

function fmtPct(p: number): string {
  return `${(p * 100).toFixed(0)}%`
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

function rateClass(p: number): string {
  if (p >= 0.6) return 'text-teal'
  if (p >= 0.4) return 'text-yellow'
  return 'text-red'
}

function expectancyClass(n: number): string {
  if (!Number.isFinite(n)) return 'text-sub'
  if (n > 0.05) return 'text-teal'
  if (n < -0.05) return 'text-red'
  return 'text-sub'
}

export function AggregateStats({ stats }: Props) {
  return (
    <div className="border border-border rounded p-3 mb-4"
         style={{ background: '#1c1815' }}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 mb-2">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-text">
          Aggregate stats — DTW-weighted across {stats.n} match{stats.n === 1 ? '' : 'es'}
        </h4>
        <div className="text-[10px] text-sub">
          mean DTW {stats.meanDtw.toFixed(2)} · weight sum {stats.weightSum.toFixed(2)}
        </div>
      </div>

      {/* Hit-rate ladder */}
      <div className="mb-3">
        <div className="text-[10px] uppercase tracking-wider text-sub mb-1">
          Probability of reaching target / hitting stop in shape direction
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-x-2 gap-y-1">
          <Cell label="P(+1R)" value={fmtPct(stats.hitRateAtPlus1)} cls={rateClass(stats.hitRateAtPlus1)} />
          <Cell label="P(+2R)" value={fmtPct(stats.hitRateAtPlus2)} cls={rateClass(stats.hitRateAtPlus2)} />
          <Cell label="P(+3R)" value={fmtPct(stats.hitRateAtPlus3)} cls={rateClass(stats.hitRateAtPlus3)} />
          <Cell label="P(−1R)" value={fmtPct(stats.stopRateAtMinus1)} cls="text-red" />
          <Cell label="P(−2R)" value={fmtPct(stats.stopRateAtMinus2)} cls="text-red" />
          <Cell label="P(−3R)" value={fmtPct(stats.stopRateAtMinus3)} cls="text-red" />
        </div>
      </div>

      {/* Expectancy & profit factor */}
      <div className="mb-3">
        <div className="text-[10px] uppercase tracking-wider text-sub mb-1">
          Expectancy E[R] at common stop=−1R / target rules
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-x-2 gap-y-1">
          <Cell label="+1R / −1R" value={fmtAtr(stats.expectancyAt1R)} cls={expectancyClass(stats.expectancyAt1R)} />
          <Cell label="+2R / −1R" value={fmtAtr(stats.expectancyAt2R)} cls={expectancyClass(stats.expectancyAt2R)} />
          <Cell label="+3R / −1R" value={fmtAtr(stats.expectancyAt3R)} cls={expectancyClass(stats.expectancyAt3R)} />
          <Cell label="profit factor" value={stats.profitFactor === 99 ? '∞' : stats.profitFactor.toFixed(2)} />
          <Cell label="EOD win-rate" value={fmtPct(stats.eodWinRate)} cls={rateClass(stats.eodWinRate)} />
        </div>
      </div>

      {/* EOD distribution */}
      <div className="mb-3">
        <div className="text-[10px] uppercase tracking-wider text-sub mb-1">
          EOD ATR distribution across matches
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-7 gap-x-2 gap-y-1">
          <Cell label="min" value={fmtAtr(stats.eodMin)} cls={moveClass(stats.eodMin)} sub />
          <Cell label="p25" value={fmtAtr(stats.eodP25)} cls={moveClass(stats.eodP25)} />
          <Cell label="median" value={fmtAtr(stats.eodMedian)} cls={moveClass(stats.eodMedian)} />
          <Cell label="mean" value={fmtAtr(stats.eodMean)} cls={moveClass(stats.eodMean)} />
          <Cell label="p75" value={fmtAtr(stats.eodP75)} cls={moveClass(stats.eodP75)} />
          <Cell label="max" value={fmtAtr(stats.eodMax)} cls={moveClass(stats.eodMax)} sub />
          <Cell label="std" value={`${stats.eodStd.toFixed(2)}A`} sub />
        </div>
      </div>

      {/* Path stats */}
      <div>
        <div className="text-[10px] uppercase tracking-wider text-sub mb-1">
          Path expectations
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-x-2 gap-y-1">
          <Cell label="mean MFE" value={fmtAtr(stats.mfeMean)} cls="text-teal" />
          <Cell label="mean MAE" value={fmtAtr(stats.maeMean === 0 ? 0 : -Math.abs(stats.maeMean))} cls="text-red" />
          <Cell label="med t→MFE" value={`${stats.medianTimeToMfe}b`} sub />
          <Cell label="med t→MAE" value={`${stats.medianTimeToMae}b`} sub />
          <Cell label="mean intra-vol" value={`${stats.meanIntradayVol.toFixed(3)}A`} sub />
        </div>
      </div>
    </div>
  )
}

function Cell({ label, value, cls, sub }: {
  label: string; value: string; cls?: string; sub?: boolean
}) {
  return (
    <div className="flex flex-col">
      <span className="text-[9px] text-sub uppercase tracking-wider">{label}</span>
      <span className={`tabular-nums text-sm font-semibold ${cls ?? (sub ? 'text-text/85' : 'text-text')}`}>
        {value}
      </span>
    </div>
  )
}
