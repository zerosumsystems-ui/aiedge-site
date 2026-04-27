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

  const flipMatch = (m: AnalogShape, isFlipped: boolean): AnalogShape => {
    if (!isFlipped) return m
    return {
      open: m.open, ema20: m.ema20,
      // Vertical mirror: high↔low swap and y → 1-y handled at normalize.
      high: m.low, low: m.high, close: m.close,
    }
  }

  // Joint normalization across query + all matches.
  const allValues: number[] = []
  for (const arr of [query.open, query.high, query.low, query.close, query.ema20]) {
    for (const v of arr.slice(0, n)) allValues.push(v)
  }
  for (const { shape, flipped } of matches) {
    const m = flipMatch(shape, flipped)
    for (const arr of [m.open, m.high, m.low, m.close, m.ema20]) {
      for (const v of arr.slice(0, n)) allValues.push(v)
    }
  }
  const min = Math.min(...allValues)
  const max = Math.max(...allValues)
  const span = (max - min) || 1
  const normalize = (v: number, flipY = false) => {
    const t = (v - min) / span
    return flipY ? 1 - t : t
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
        {/* Match close-lines first so query candles sit on top. */}
        {matches.map(({ shape, flipped }, mi) => {
          const m = flipMatch(shape, flipped)
          const closes = m.close.slice(0, n).map((v) => normalize(v, flipped))
          const path = closes
            .map((y, i) => `${i === 0 ? 'M' : 'L'} ${xCenter(i)} ${yPx(y)}`)
            .join(' ')
          const color = MATCH_COLORS[mi % MATCH_COLORS.length]
          return (
            <g key={`match-${mi}`}>
              <path d={path} fill="none" stroke={color}
                strokeWidth={1.5} strokeOpacity={0.55} />
              {/* Small dots at each bar so the user can locate the
                  per-bar agreement, not just the curve shape. */}
              {closes.map((y, i) => (
                <circle key={`mp-${mi}-${i}`} cx={xCenter(i)} cy={yPx(y)} r={1.8}
                  fill={color} fillOpacity={0.55} />
              ))}
            </g>
          )
        })}

        {/* Query candles on top, full opacity. */}
        {Array.from({ length: n }).map((_, i) => {
          const o = normalize(query.open[i])
          const h = normalize(query.high[i])
          const l = normalize(query.low[i])
          const c = normalize(query.close[i])
          const isUp = c >= o
          const col = isUp ? QUERY_UP : QUERY_DN
          const x = xCenter(i)
          const yH = yPx(h), yL = yPx(l), yO = yPx(o), yC = yPx(c)
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
