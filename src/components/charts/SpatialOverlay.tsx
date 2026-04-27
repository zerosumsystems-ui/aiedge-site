'use client'

/** SpatialOverlay — query candles + match candles drawn on shared normalized
 *  axes, EMA polylines stacked behind. Used by /analogs (full-size) and the
 *  scanner card analog section (compact mode). The closer the shapes overlap,
 *  the better the DTW match. */
import type { AnalogShape } from '@/lib/types'

type Bars = AnalogShape

/** Compute the DTW warp path between two normalized 5-channel sequences.
 *  Returns the list of (queryIdx, matchIdx) pairs along the cheapest
 *  alignment path. Mirrors the same DP recurrence the Python matcher
 *  uses (Euclidean per cell, min of 3 predecessors). Sequences are
 *  short (≤ 6 bars) so this runs in microseconds. */
function dtwWarpPath(
  q: { o: number[]; h: number[]; l: number[]; c: number[]; e: number[] },
  m: { o: number[]; h: number[]; l: number[]; c: number[]; e: number[] },
): Array<[number, number]> {
  const n = q.o.length
  const k = m.o.length
  if (n === 0 || k === 0) return []

  const cellDist = (i: number, j: number) => {
    const d = [
      q.o[i] - m.o[j], q.h[i] - m.h[j], q.l[i] - m.l[j],
      q.c[i] - m.c[j], q.e[i] - m.e[j],
    ]
    return Math.sqrt(d.reduce((acc, x) => acc + x * x, 0))
  }

  // Cumulative cost matrix.
  const cost: number[][] = Array.from({ length: n }, () => Array(k).fill(0))
  cost[0][0] = cellDist(0, 0)
  for (let j = 1; j < k; j++) cost[0][j] = cost[0][j - 1] + cellDist(0, j)
  for (let i = 1; i < n; i++) cost[i][0] = cost[i - 1][0] + cellDist(i, 0)
  for (let i = 1; i < n; i++) {
    for (let j = 1; j < k; j++) {
      cost[i][j] = cellDist(i, j) + Math.min(
        cost[i - 1][j], cost[i][j - 1], cost[i - 1][j - 1],
      )
    }
  }

  // Trace back from (n-1, k-1) to (0, 0).
  const path: Array<[number, number]> = []
  let i = n - 1, j = k - 1
  path.push([i, j])
  while (i > 0 || j > 0) {
    if (i === 0) { j -= 1 }
    else if (j === 0) { i -= 1 }
    else {
      const a = cost[i - 1][j], b = cost[i][j - 1], c = cost[i - 1][j - 1]
      if (c <= a && c <= b) { i -= 1; j -= 1 }
      else if (a <= b) { i -= 1 }
      else { j -= 1 }
    }
    path.push([i, j])
  }
  return path.reverse()
}

function normalize(bars: Bars, flipY = false): {
  o: number[]; h: number[]; l: number[]; c: number[]; e: number[]
} {
  const all = [...bars.open, ...bars.high, ...bars.low, ...bars.close, ...bars.ema20]
  const min = Math.min(...all)
  const max = Math.max(...all)
  const span = max - min || 1
  const n = (v: number) => {
    const norm = (v - min) / span
    return flipY ? 1 - norm : norm
  }
  const o = bars.open.map(n)
  const c = bars.close.map(n)
  const e = bars.ema20.map(n)
  const h = flipY ? bars.low.map(n) : bars.high.map(n)
  const l = flipY ? bars.high.map(n) : bars.low.map(n)
  return { o, h, l, c, e }
}

interface SpatialOverlayProps {
  query: Bars
  match: Bars
  /** Set when the corpus entry was vertically mirrored (used by /analogs).
   *  Scanner cards never flip, so this defaults to false. */
  flippedMatch?: boolean
  /** Compact mode shrinks the canvas + drops the legend, suited to
   *  embedding 3 overlays inside a scanner card. */
  compact?: boolean
  /** Draw the DTW warp path as dashed lines connecting query bar i to
   *  the match bar j it aligned to. Helps see *why* DTW called these
   *  similar — especially when a move took longer in one chart than
   *  the other. */
  showWarpPath?: boolean
}

export function SpatialOverlay({
  query, match, flippedMatch = false, compact = false, showWarpPath = false,
}: SpatialOverlayProps) {
  const W = compact ? 320 : 560
  const H = compact ? 120 : 200
  const PAD_X = compact ? 6 : 12
  const PAD_Y = compact ? 6 : 12

  const n = Math.min(query.open.length, match.open.length)
  if (n < 2) return null

  const Q = normalize(query, false)
  const M = normalize(match, flippedMatch)

  const usableW = W - PAD_X * 2
  const usableH = H - PAD_Y * 2
  const xStep = usableW / (n - 0.0001)
  const xCenter = (i: number) => PAD_X + xStep * (i + 0.5)
  const yPx = (v: number) => PAD_Y + (1 - v) * usableH

  const halfBody = Math.min(xStep * 0.18, compact ? 5 : 8)
  const offset = halfBody + (compact ? 1 : 2)

  const QUERY_UP = '#34c79b', QUERY_DN = '#e07060'
  const MATCH_UP = '#7fa7d4', MATCH_DN = '#b785d0'

  const renderSeries = (
    bars: ReturnType<typeof normalize>, xOffset: number, upColor: string, downColor: string
  ) => {
    const elements: React.ReactNode[] = []
    for (let i = 0; i < n; i++) {
      const x = xCenter(i) + xOffset
      const isUp = bars.c[i] >= bars.o[i]
      const col = isUp ? upColor : downColor
      const yH = yPx(bars.h[i])
      const yL = yPx(bars.l[i])
      const yO = yPx(bars.o[i])
      const yC = yPx(bars.c[i])
      const yTop = Math.min(yO, yC)
      const yBot = Math.max(yO, yC)
      elements.push(
        <line key={`w-${i}`} x1={x} x2={x} y1={yH} y2={yL}
          stroke={col} strokeWidth={1} opacity={0.85} />
      )
      elements.push(
        <rect key={`b-${i}`} x={x - halfBody} y={yTop}
          width={halfBody * 2} height={Math.max(yBot - yTop, 1)}
          fill={col} fillOpacity={0.7} stroke={col} strokeOpacity={0.9} />
      )
    }
    return elements
  }

  const emaPath = (bars: ReturnType<typeof normalize>, xOffset: number) =>
    bars.e.map((v, i) => `${i === 0 ? 'M' : 'L'} ${xCenter(i) + xOffset} ${yPx(v)}`).join(' ')

  return (
    <div
      className="border border-border rounded p-2"
      style={{ background: '#1c1815' }}
    >
      {!compact && (
        <div className="flex items-center gap-3 mb-1.5 text-[10px]">
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-2 rounded-sm" style={{ background: QUERY_UP }} />
            <span className="text-text">query</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-2 rounded-sm" style={{ background: MATCH_UP }} />
            <span className="text-text">match{flippedMatch ? ' (flipped)' : ''}</span>
          </span>
          <span className="text-sub">overlaid on normalized [0,1] axes</span>
        </div>
      )}
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" preserveAspectRatio="xMidYMid meet"
           className="block max-w-full">
        {renderSeries(M, +offset, MATCH_UP, MATCH_DN)}
        <path d={emaPath(M, +offset)} fill="none"
          stroke="#b785d0" strokeWidth={1.5} strokeOpacity={0.7} />
        {renderSeries(Q, -offset, QUERY_UP, QUERY_DN)}
        <path d={emaPath(Q, -offset)} fill="none"
          stroke="#7fa7d4" strokeWidth={1.5} strokeOpacity={0.7} />
        {/* DTW warp path — dashed lines from query bar i to match bar j
            along the alignment. Skip diagonal i==j cells (those are
            "no warp"); render the off-diagonals so the visual surfaces
            where time stretched. */}
        {showWarpPath && (() => {
          const path = dtwWarpPath(Q, M)
          return path.map(([qi, mj], k) => {
            if (qi === mj) return null
            const x1 = xCenter(qi) - offset
            const y1 = yPx(Q.c[qi])
            const x2 = xCenter(mj) + offset
            const y2 = yPx(M.c[mj])
            return (
              <line key={`warp-${k}`}
                x1={x1} y1={y1} x2={x2} y2={y2}
                stroke="#e6dfd1" strokeWidth={0.8} strokeOpacity={0.55}
                strokeDasharray="2 3" />
            )
          })
        })()}
        {!compact && Array.from({ length: n }).map((_, i) => (
          <text key={`xt-${i}`} x={xCenter(i)} y={H - 2}
            textAnchor="middle" fontSize={9} fill="#9b9286">
            bar {i + 1}
          </text>
        ))}
      </svg>
    </div>
  )
}
