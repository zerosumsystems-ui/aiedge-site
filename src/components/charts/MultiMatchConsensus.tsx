'use client'

/** MultiMatchConsensus — query candles + every top-K match's close-line
 *  drawn at low opacity on the same normalized axes. The visual answers
 *  "how much does the analog crowd agree on the next move shape?" When
 *  the 5 lines clump tightly around the query, conviction is high; when
 *  they fan out, the matches found are diverse and any single one is a
 *  weak read.
 *
 *  Uses joint-min-max normalization across query + every match together
 *  so all series live on the same [0, 1] vertical axis. */
import type { AnalogShape } from '@/lib/types'

interface ConsensusProps {
  query: AnalogShape
  matches: { shape: AnalogShape; flipped: boolean }[]
  /** Number of bars to render. Defaults to query.open.length, but can
   *  be set lower if some matches are shorter. */
  nBars?: number
}

/** Distinct colors per match — picked to read on the warm-dark
 *  background and stay legible at low opacity. */
const MATCH_COLORS = ['#7fa7d4', '#b785d0', '#d4a07f', '#7fd4a0', '#d47f9b']

export function MultiMatchConsensus({ query, matches, nBars }: ConsensusProps) {
  const W = 720, H = 220, PAD_X = 16, PAD_Y = 18
  const n = nBars ?? query.open.length
  if (n < 2 || matches.length === 0) return null

  // Per-series normalization. Joint min/max across all series squashed
  // each chart's variation to a flat line whenever absolute price scales
  // differed (AAPL ~$200 vs SPY ~$500). For shape comparison we want
  // every series occupying the same [0, 1] vertical band so the wiggle
  // is visible — same convention SpatialOverlay uses for one-vs-one.
  const normCloses = (closes: number[], flipY: boolean): number[] => {
    const sub = closes.slice(0, n)
    const lo = Math.min(...sub)
    const hi = Math.max(...sub)
    const span = (hi - lo) || 1
    return sub.map((v) => {
      const t = (v - lo) / span
      return flipY ? 1 - t : t
    })
  }
  // For the query candles we need OHLC normalized together so the candle
  // bodies and wicks stay proportional. Joint within-query min/max.
  const queryAll = [
    ...query.open.slice(0, n), ...query.high.slice(0, n),
    ...query.low.slice(0, n),  ...query.close.slice(0, n),
  ]
  const qLo = Math.min(...queryAll)
  const qHi = Math.max(...queryAll)
  const qSpan = (qHi - qLo) || 1
  const normQ = (v: number) => (v - qLo) / qSpan
  const Q = {
    o: query.open.slice(0, n).map(normQ),
    h: query.high.slice(0, n).map(normQ),
    l: query.low.slice(0, n).map(normQ),
    c: query.close.slice(0, n).map(normQ),
  }

  const usableW = W - PAD_X * 2
  const usableH = H - PAD_Y * 2
  const xStep = usableW / (n - 0.0001)
  const xCenter = (i: number) => PAD_X + xStep * (i + 0.5)
  const yPx = (norm: number) => PAD_Y + (1 - norm) * usableH

  const halfBody = Math.min(xStep * 0.18, 7)

  // Query as full-opacity candles (warm theme).
  const QUERY_UP = '#34c79b', QUERY_DN = '#e07060', WICK = '#b8aea0'

  return (
    <div className="border border-border rounded p-2"
         style={{ background: '#1c1815' }}>
      <div className="flex items-center gap-3 mb-1.5 text-[10px]">
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-2 rounded-sm" style={{ background: QUERY_UP }} />
          <span className="text-text">query (candles)</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="text-sub">match closes:</span>
          {matches.map((_, i) => (
            <span key={i} className="inline-block w-3 h-0.5"
              style={{ background: MATCH_COLORS[i % MATCH_COLORS.length], opacity: 0.85 }} />
          ))}
        </span>
        <span className="text-sub">overlaid on shared [0,1] axis</span>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} width="100%" preserveAspectRatio="xMidYMid meet"
           className="block max-w-full">
        {/* Match close-lines first so query candles sit on top. Each
            match is normalized to its own [0, 1] band — different
            instruments at different absolute prices end up readable
            on the same axis. */}
        {matches.map(({ shape, flipped }, mi) => {
          const closes = normCloses(shape.close, flipped)
          const path = closes
            .map((y, i) => `${i === 0 ? 'M' : 'L'} ${xCenter(i)} ${yPx(y)}`)
            .join(' ')
          const color = MATCH_COLORS[mi % MATCH_COLORS.length]
          return (
            <g key={`match-${mi}`}>
              <path d={path} fill="none" stroke={color}
                strokeWidth={1.5} strokeOpacity={0.55} />
              {closes.map((y, i) => (
                <circle key={`mp-${mi}-${i}`} cx={xCenter(i)} cy={yPx(y)} r={1.8}
                  fill={color} fillOpacity={0.55} />
              ))}
            </g>
          )
        })}

        {/* Query candles on top, full opacity. Already normalized to
            its own [0, 1] band so it sits on the same axis as the
            match lines. */}
        {Array.from({ length: n }).map((_, i) => {
          const isUp = Q.c[i] >= Q.o[i]
          const col = isUp ? QUERY_UP : QUERY_DN
          const x = xCenter(i)
          const yH = yPx(Q.h[i]), yL = yPx(Q.l[i])
          const yO = yPx(Q.o[i]), yC = yPx(Q.c[i])
          const yTop = Math.min(yO, yC), yBot = Math.max(yO, yC)
          return (
            <g key={`q-${i}`}>
              <line x1={x} x2={x} y1={yH} y2={yL}
                stroke={WICK} strokeWidth={1} opacity={0.9} />
              <rect x={x - halfBody} y={yTop} width={halfBody * 2}
                height={Math.max(yBot - yTop, 1)}
                fill={col} fillOpacity={0.95} stroke={col} />
            </g>
          )
        })}

        {Array.from({ length: n }).map((_, i) => (
          <text key={`xt-${i}`} x={xCenter(i)} y={H - 4}
            textAnchor="middle" fontSize={9} fill="#9b9286">
            bar {i + 1}
          </text>
        ))}
      </svg>
    </div>
  )
}
