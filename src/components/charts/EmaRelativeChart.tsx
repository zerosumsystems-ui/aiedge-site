'use client'

/** EmaRelativeChart — closes plotted as (close − EMA20) per bar, in
 *  ATR units (mean bar high-low used as the per-shape ATR proxy). The
 *  raw price drift is removed; what's left is the intra-trend wiggle.
 *  Useful for comparing days where one moved +5% and another moved
 *  +0.5% but the *shape of the drift* was the same.
 *
 *  Two thin lines (query + match) on a 0-line baseline.
 *  Above 0 = close is above its EMA20 (price extended up from ema).
 *  Below 0 = close is below ema20 (price extended down). */
import type { AnalogShape } from '@/lib/types'

interface Props {
  query: AnalogShape
  match: AnalogShape
  flippedMatch?: boolean
}

function emaRelativeAtr(shape: AnalogShape, flipped = false): number[] {
  const ranges = shape.high.map((h, i) => h - shape.low[i])
  const validRanges = ranges.filter((r) => r > 0)
  if (validRanges.length === 0) return shape.close.map(() => 0)
  const sortedR = [...validRanges].sort((a, b) => a - b)
  const medRange = sortedR[Math.floor(sortedR.length / 2)] || 1
  return shape.close.map((c, i) => {
    const v = (c - shape.ema20[i]) / medRange
    return flipped ? -v : v
  })
}

export function EmaRelativeChart({ query, match, flippedMatch = false }: Props) {
  const W = 720, H = 140, PAD_X = 16, PAD_Y = 16
  const n = Math.min(query.open.length, match.open.length)
  if (n < 2) return null

  const qRel = emaRelativeAtr(query)
  const mRel = emaRelativeAtr(match, flippedMatch)
  const all = [...qRel, ...mRel]
  // Symmetric range around 0 so the baseline reads cleanly.
  const absMax = Math.max(...all.map(Math.abs), 0.5)
  const yPx = (v: number) => {
    const usable = H - PAD_Y * 2
    const t = (v + absMax) / (2 * absMax)
    return PAD_Y + (1 - t) * usable
  }

  const usableW = W - PAD_X * 2
  const xStep = usableW / (n - 0.0001)
  const xCenter = (i: number) => PAD_X + xStep * (i + 0.5)

  const linePath = (vs: number[]) =>
    vs.slice(0, n)
      .map((v, i) => `${i === 0 ? 'M' : 'L'} ${xCenter(i)} ${yPx(v)}`)
      .join(' ')

  const QUERY_LINE = '#34c79b'
  const MATCH_LINE = '#7fa7d4'

  return (
    <div className="border border-border rounded p-2"
         style={{ background: '#1c1815' }}>
      <div className="flex items-center gap-3 mb-1.5 text-[10px]">
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-0.5" style={{ background: QUERY_LINE }} />
          <span className="text-text">query</span>
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-0.5" style={{ background: MATCH_LINE }} />
          <span className="text-text">match{flippedMatch ? ' (flipped)' : ''}</span>
        </span>
        <span className="text-sub">close − EMA20, in ATR units (median bar range)</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" preserveAspectRatio="xMidYMid meet"
           className="block max-w-full">
        {/* Zero baseline */}
        <line x1={PAD_X} x2={W - PAD_X} y1={yPx(0)} y2={yPx(0)}
          stroke="#5a5048" strokeWidth={1} strokeDasharray="2 4" />
        <text x={W - PAD_X - 2} y={yPx(0) - 3} textAnchor="end"
          fontSize={9} fill="#9b9286">EMA20</text>

        {/* Match line (under) */}
        <path d={linePath(mRel)} fill="none"
          stroke={MATCH_LINE} strokeWidth={1.8} strokeOpacity={0.85} />
        {mRel.slice(0, n).map((v, i) => (
          <circle key={`m-${i}`} cx={xCenter(i)} cy={yPx(v)} r={2.4}
            fill={MATCH_LINE} fillOpacity={0.85} />
        ))}

        {/* Query line (on top) */}
        <path d={linePath(qRel)} fill="none"
          stroke={QUERY_LINE} strokeWidth={2} strokeOpacity={0.95} />
        {qRel.slice(0, n).map((v, i) => (
          <circle key={`q-${i}`} cx={xCenter(i)} cy={yPx(v)} r={2.4}
            fill={QUERY_LINE} />
        ))}

        {Array.from({ length: n }).map((_, i) => (
          <text key={`xt-${i}`} x={xCenter(i)} y={H - 3}
            textAnchor="middle" fontSize={9} fill="#9b9286">
            {i + 1}
          </text>
        ))}
      </svg>
    </div>
  )
}
