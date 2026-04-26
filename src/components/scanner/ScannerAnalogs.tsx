'use client'

/** ScannerAnalogs — embeds the top historical analog matches inside a
 *  ScannerCard. Two views may render: anchored (matches the morning shape,
 *  always present from bar 2 onward) and rolling (trailing 6-bar window,
 *  only appears once we're past bar 6). Outcomes are normalized to ATR
 *  units so cross-instrument comparison is direct.
 *
 *  Computed by aiedge/runners/scanner_analog_matcher.py and shipped within
 *  the scan payload — the site doesn't fetch the corpus or run DTW. */

import { useState } from 'react'
import { SpatialOverlay } from '@/components/charts/SpatialOverlay'
import type {
  AnalogMatch, AnalogResult, AnalogAnchoredView, AnalogRollingView,
  Signal,
} from '@/lib/types'

const DEFAULT_SHOWN = 3
const MAX_SHOWN = 5

function fmtAtr(n: number, dp = 1): string {
  if (n === 0) return '0'
  const sign = n > 0 ? '+' : ''
  return `${sign}${n.toFixed(dp)}A`
}

function atrClass(n: number): string {
  if (n > 0) return 'text-teal'
  if (n < 0) return 'text-red'
  return 'text-sub'
}

function dirArrow(d: 'up' | 'down' | 'flat'): string {
  if (d === 'up') return '↑'
  if (d === 'down') return '↓'
  return '→'
}

/** When the scanner signal is BUY, "favorable" = max_up_atr (price went up
 *  is what we'd want). When SELL, "favorable" = max_down_atr. Flat signals
 *  fall back to displaying both with neutral labels. */
function favorableAtr(m: AnalogMatch, signal: Signal | null): number {
  if (signal === 'SELL') return m.outcome.max_down_atr
  return m.outcome.max_up_atr
}

function adverseAtr(m: AnalogMatch, signal: Signal | null): number {
  if (signal === 'SELL') return m.outcome.max_up_atr
  return m.outcome.max_down_atr
}

function eodFromSignalPerspective(m: AnalogMatch, signal: Signal | null): number {
  if (signal === 'SELL') return -m.outcome.eod_move_atr
  return m.outcome.eod_move_atr
}

function aggregate(matches: AnalogMatch[], signal: Signal | null) {
  if (!matches.length) return null
  let goingOurWay = 0
  let eodSum = 0
  let favSum = 0
  let advSum = 0
  for (const m of matches) {
    const eod = eodFromSignalPerspective(m, signal)
    if (eod > 0) goingOurWay += 1
    eodSum += eod
    favSum += favorableAtr(m, signal)
    advSum += adverseAtr(m, signal)
  }
  const n = matches.length
  return {
    n,
    goingOurWay,
    avgEod: eodSum / n,
    avgFav: favSum / n,
    avgAdv: advSum / n,
  }
}

function MatchRow({
  match, queryShape, signal,
}: {
  match: AnalogMatch
  queryShape: { open: number[]; high: number[]; low: number[]; close: number[]; ema20: number[] }
  signal: Signal | null
}) {
  const o = match.outcome
  const eodSigned = eodFromSignalPerspective(match, signal)
  const fav = favorableAtr(match, signal)
  const adv = adverseAtr(match, signal)

  return (
    <div className="border border-border rounded p-2 bg-bg/50">
      <div className="flex items-baseline justify-between gap-2 mb-1.5 text-[11px]">
        <div className="flex items-baseline gap-1.5 min-w-0">
          <span className="text-sub">#{match.rank}</span>
          <span className="font-semibold text-text font-mono truncate">{match.ticker}</span>
          <span className="text-sub font-mono">{match.date.slice(5)}</span>
        </div>
        <span className="text-sub text-[10px] tabular-nums shrink-0">
          dtw {match.dtw.toFixed(2)}
        </span>
      </div>
      <SpatialOverlay query={queryShape} match={match.shape} compact />
      <div className="mt-1.5 grid grid-cols-3 gap-1 text-[10px] tabular-nums">
        <div className="flex flex-col items-start">
          <span className="text-sub">EOD</span>
          <span className={atrClass(eodSigned)}>
            {dirArrow(o.direction)} {fmtAtr(eodSigned)}
          </span>
        </div>
        <div className="flex flex-col items-start">
          <span className="text-sub">favor</span>
          <span className="text-teal">{fmtAtr(fav)}</span>
        </div>
        <div className="flex flex-col items-start">
          <span className="text-sub">advrs</span>
          <span className="text-red">−{fav === 0 && adv === 0 ? '0' : adv.toFixed(1)}A</span>
        </div>
      </div>
    </div>
  )
}

function AnalogSection({
  view, signal, label, sublabel,
}: {
  view: AnalogAnchoredView | AnalogRollingView
  signal: Signal | null
  label: string
  sublabel: string
}) {
  const [showAll, setShowAll] = useState(false)
  const total = view.matches.length
  const shown = showAll ? Math.min(total, MAX_SHOWN) : Math.min(total, DEFAULT_SHOWN)
  const matches = view.matches.slice(0, shown)
  const hasMore = total > DEFAULT_SHOWN

  const agg = aggregate(matches, signal)

  return (
    <section className="px-3 pb-3">
      <header className="mb-2">
        <h4 className="text-[11px] font-semibold uppercase tracking-wider text-sub">
          {label}
        </h4>
        <p className="text-[10px] text-sub/80 mt-0.5">{sublabel}</p>
      </header>

      {agg && (
        <div className="mb-2 px-2 py-1.5 rounded bg-surface border border-border/60 text-[11px] text-text/90 leading-snug tabular-nums">
          <span className="font-semibold">{agg.goingOurWay}/{agg.n}</span>{' '}
          <span className="text-sub">went our way</span>
          <span className="text-sub mx-1.5">·</span>
          <span className="text-sub">avg EOD</span>{' '}
          <span className={atrClass(agg.avgEod)}>{fmtAtr(agg.avgEod)}</span>
          <span className="text-sub mx-1.5">·</span>
          <span className="text-sub">favor</span>{' '}
          <span className="text-teal">{fmtAtr(agg.avgFav)}</span>
          <span className="text-sub mx-1.5">·</span>
          <span className="text-sub">advrs</span>{' '}
          <span className="text-red">−{agg.avgAdv.toFixed(1)}A</span>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {matches.map((m) => (
          <MatchRow
            key={m.slug}
            match={m}
            queryShape={view.query_shape}
            signal={signal}
          />
        ))}
      </div>

      {hasMore && !showAll && total > DEFAULT_SHOWN && (
        <button
          onClick={() => setShowAll(true)}
          className="mt-2 text-[11px] text-sub hover:text-text transition"
        >
          Show {Math.min(total, MAX_SHOWN) - DEFAULT_SHOWN} more →
        </button>
      )}
      {showAll && (
        <button
          onClick={() => setShowAll(false)}
          className="mt-2 text-[11px] text-sub hover:text-text transition"
        >
          ← Show fewer
        </button>
      )}
    </section>
  )
}

interface ScannerAnalogsProps {
  analogs: AnalogResult
  signal: Signal | null
}

export function ScannerAnalogs({ analogs, signal }: ScannerAnalogsProps) {
  const hasAnchored = !!analogs.anchored && analogs.anchored.matches.length > 0
  const hasRolling = !!analogs.rolling && analogs.rolling.matches.length > 0
  if (!hasAnchored && !hasRolling) return null

  return (
    <div className="border-t border-border bg-bg/30">
      <div className="px-3 pt-2.5 pb-1">
        <h3 className="text-xs font-semibold text-text">Closest historical analogs</h3>
        <p className="text-[10px] text-sub mt-0.5">
          Past chart shapes most similar to today, by DTW. Outcomes in ATR units —
          comparable across instruments.
        </p>
      </div>

      {hasAnchored && analogs.anchored && (
        <AnalogSection
          view={analogs.anchored}
          signal={signal}
          label={`Morning shape — first ${analogs.anchored.anchor_n} bars`}
          sublabel="Historical sessions whose open looked like today's open."
        />
      )}

      {hasRolling && analogs.rolling && (
        <AnalogSection
          view={analogs.rolling}
          signal={signal}
          label={`Recent shape — trailing ${analogs.rolling.window} bars`}
          sublabel={`Any prior 6-bar window in any session, ending at bar ${analogs.rolling.query_end_bar}.`}
        />
      )}
    </div>
  )
}
