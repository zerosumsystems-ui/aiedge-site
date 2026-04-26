'use client'

/** SpatialOverlay — query candles + match candles drawn on shared normalized
 *  axes, EMA polylines stacked behind. Used by /analogs (full-size) and the
 *  scanner card analog section (compact mode). The closer the shapes overlap,
 *  the better the DTW match. */
import type { AnalogShape } from '@/lib/types'

type Bars = AnalogShape

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
}

export function SpatialOverlay({
  query, match, flippedMatch = false, compact = false,
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
