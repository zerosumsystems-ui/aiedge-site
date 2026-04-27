'use client'

/** HistoryAccuracy — running tally of analog-prediction quality.
 *
 *  For every captured scanner detection that had analogs attached, we
 *  computed a "predicted direction" (median of top-K analogs' EOD move)
 *  and compared it to the actual EOD direction from the same day's bars.
 *  This view is the live record of whether that comparison is winning
 *  better than 50/50.
 *
 *  Empty until live scans with analogs land in history (Monday open
 *  is the first opportunity). */

import { useEffect, useState } from 'react'

type Direction = 'up' | 'down' | 'flat'

interface Observation {
  date: string
  ticker: string
  signal: string
  predictedDir: Direction
  predictedEodAtr: number
  predictedHitCount: number
  analogsConsidered: number
  meanDtw: number
  actualDir: Direction
  actualEodAtr: number
  correct: boolean | null
}

interface AccuracyPayload {
  total: number
  graded: number
  correct: number
  hitRate: number | null
  pValueVsRandom: number | null
  byDirection: {
    up:   { graded: number; correct: number; hitRate: number | null }
    down: { graded: number; correct: number; hitRate: number | null }
  }
  recent: Observation[]
  oldestDate: string | null
  latestDate: string | null
}

function pctStr(p: number | null): string {
  if (p === null) return '—'
  return `${(p * 100).toFixed(1)}%`
}

function pValueClass(p: number | null): string {
  if (p === null) return 'text-sub'
  if (p < 0.05) return 'text-teal'
  if (p < 0.20) return 'text-yellow'
  return 'text-sub'
}

function rateClass(r: number | null): string {
  if (r === null) return 'text-sub'
  if (r >= 0.55) return 'text-teal'
  if (r >= 0.45) return 'text-yellow'
  return 'text-red'
}

function dirArrow(d: Direction): string {
  if (d === 'up') return '↑'
  if (d === 'down') return '↓'
  return '→'
}

function dirClass(d: Direction): string {
  if (d === 'up') return 'text-teal'
  if (d === 'down') return 'text-red'
  return 'text-sub'
}

export function HistoryAccuracy() {
  const [data, setData] = useState<AccuracyPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/analog-accuracy', { cache: 'no-store' })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((d: AccuracyPayload) => { setData(d); setLoading(false) })
      .catch((e) => { setError(e.message); setLoading(false) })
  }, [])

  if (loading) {
    return <div className="py-12 text-center text-sm text-sub">Loading accuracy…</div>
  }
  if (error) {
    return (
      <div className="rounded border border-red/30 bg-red/10 px-3 py-2 text-sm text-red">
        Error: {error}
      </div>
    )
  }
  if (!data || data.total === 0) {
    return (
      <div className="py-12 text-center text-sm text-sub">
        <p className="mb-2">No analog-tagged detections captured yet.</p>
        <p className="text-xs">
          Scanner cards started attaching analogs after the most recent merge.
          The first weekday EOD capture with live data is when this view starts
          populating.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Headline numbers */}
      <section>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Tile label="Queries"
                value={data.total.toLocaleString()}
                sub={data.graded === data.total ? 'all graded'
                  : `${data.graded.toLocaleString()} graded`} />
          <Tile label="Hit rate"
                value={pctStr(data.hitRate)}
                valueClass={rateClass(data.hitRate)}
                sub={data.graded > 0 ? `${data.correct}/${data.graded} correct` : 'no data'} />
          <Tile label="vs 50/50"
                value={data.pValueVsRandom === null
                  ? 'n<20'
                  : `p=${data.pValueVsRandom.toFixed(3)}`}
                valueClass={pValueClass(data.pValueVsRandom)}
                sub={data.pValueVsRandom === null
                  ? 'sample too small'
                  : data.pValueVsRandom < 0.05
                    ? 'significant edge'
                    : data.pValueVsRandom < 0.20
                      ? 'edge possible'
                      : 'noise so far'} />
          <Tile label="Coverage"
                value={data.oldestDate && data.latestDate
                  ? `${data.oldestDate.slice(5)} → ${data.latestDate.slice(5)}`
                  : '—'}
                sub="captured days" />
        </div>
      </section>

      {/* Per-direction split */}
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-sub mb-2">
          By predicted direction
        </h3>
        <div className="grid grid-cols-2 gap-2">
          <DirectionTile dir="up" stats={data.byDirection.up} />
          <DirectionTile dir="down" stats={data.byDirection.down} />
        </div>
      </section>

      {/* Recent observations */}
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-sub mb-2">
          Recent {Math.min(data.recent.length, 50)} queries
        </h3>
        <div className="border border-border rounded overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead className="bg-surface text-sub border-b border-border">
              <tr>
                <th className="px-2 py-1.5 text-left font-normal">Date</th>
                <th className="px-2 py-1.5 text-left font-normal">Ticker</th>
                <th className="px-2 py-1.5 text-left font-normal">Signal</th>
                <th className="px-2 py-1.5 text-left font-normal">Predicted</th>
                <th className="px-2 py-1.5 text-left font-normal">Actual</th>
                <th className="px-2 py-1.5 text-center font-normal">Hit?</th>
                <th className="px-2 py-1.5 text-right font-normal">DTW</th>
              </tr>
            </thead>
            <tbody>
              {data.recent.map((o, i) => (
                <tr key={`${o.date}-${o.ticker}-${i}`}
                    className="border-b border-border/40 hover:bg-border/10">
                  <td className="px-2 py-1.5 font-mono text-sub">{o.date.slice(5)}</td>
                  <td className="px-2 py-1.5 font-mono text-text">{o.ticker}</td>
                  <td className="px-2 py-1.5">
                    <span className="text-[10px] text-sub uppercase">{o.signal}</span>
                  </td>
                  <td className={`px-2 py-1.5 ${dirClass(o.predictedDir)}`}>
                    {dirArrow(o.predictedDir)} {o.predictedEodAtr >= 0 ? '+' : ''}{o.predictedEodAtr.toFixed(2)}A
                    <span className="ml-1 text-[10px] text-sub">
                      ({o.predictedHitCount}/{o.analogsConsidered})
                    </span>
                  </td>
                  <td className={`px-2 py-1.5 ${dirClass(o.actualDir)}`}>
                    {dirArrow(o.actualDir)} {o.actualEodAtr >= 0 ? '+' : ''}{o.actualEodAtr.toFixed(2)}A
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    {o.correct === null ? (
                      <span className="text-sub">—</span>
                    ) : o.correct ? (
                      <span className="text-teal">✓</span>
                    ) : (
                      <span className="text-red">✗</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-right text-sub tabular-nums">
                    {o.meanDtw.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Methodology note */}
      <section className="text-[11px] text-sub leading-relaxed border-t border-border pt-3">
        <p>
          <strong className="text-text">How this is graded.</strong>{' '}
          For each detection that had analogs attached, predicted = median EOD
          ATR move across the top-K anchored matches; actual = EOD ATR move
          from the same day&apos;s captured 5-min bars (close of last bar minus
          close of bar 6, divided by mean bar high-low over the first 6 bars
          — same ATR proxy the corpus uses). A query is graded when both
          predicted and actual are clearly directional (|move| ≥ 0.05A);
          flat days are recorded but excluded from the hit-rate denominator.
          p-value is a normal-approx two-sided binomial test against the
          50/50 null; reported only when graded ≥ 20.
        </p>
      </section>
    </div>
  )
}

function Tile({ label, value, sub, valueClass }: {
  label: string; value: string; sub?: string; valueClass?: string
}) {
  return (
    <div className="border border-border rounded p-3 bg-surface">
      <div className="text-[10px] uppercase tracking-wider text-sub mb-1">{label}</div>
      <div className={`text-xl font-semibold tabular-nums ${valueClass ?? 'text-text'}`}>
        {value}
      </div>
      {sub && <div className="text-[10px] text-sub mt-0.5">{sub}</div>}
    </div>
  )
}

function DirectionTile({ dir, stats }: {
  dir: 'up' | 'down'
  stats: { graded: number; correct: number; hitRate: number | null }
}) {
  const arrow = dir === 'up' ? '↑' : '↓'
  const arrowClass = dir === 'up' ? 'text-teal' : 'text-red'
  return (
    <div className="border border-border rounded p-3 bg-surface flex items-baseline justify-between">
      <div>
        <div className={`text-lg font-semibold ${arrowClass}`}>{arrow} predicted</div>
        <div className="text-[10px] text-sub">
          {stats.graded > 0 ? `${stats.correct}/${stats.graded} correct` : 'no graded queries'}
        </div>
      </div>
      <div className={`text-xl font-semibold tabular-nums ${rateClass(stats.hitRate)}`}>
        {pctStr(stats.hitRate)}
      </div>
    </div>
  )
}
