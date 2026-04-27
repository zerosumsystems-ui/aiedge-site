'use client'

/** PostAnchorEvolution — the answer to "what does the analog crowd say
 *  happens after the open?"
 *
 *  Layout:
 *    bars 1..6   — query candles (warm theme)
 *    bar 6 line  — vertical anchor marker
 *    bars 6..N   — per-match close trajectories, plotted as
 *                  (close − anchor_close) / atr_proxy, so different
 *                  instruments at different prices share a single
 *                  vertical scale ("ATR units from anchor close")
 *
 *  Reads:  query candles share their own [0,1] band on the LEFT half of
 *  the chart so the candle bodies render correctly. Match continuations
 *  share an ATR-units axis on the RIGHT half centered at 0 (the anchor
 *  close). The two halves are drawn in their own coordinate frames but
 *  on the same SVG so the user reads it as one timeline.
 *
 *  Tight clump on the right = high consensus on what happens next.
 *  Wide fan = the matches share a morning shape but diverge afterward
 *  (the matcher cannot tell you the next move). */
import type { AnalogShape } from '@/lib/types'

const MATCH_COLORS = ['#7fa7d4', '#b785d0', '#d4a07f', '#7fd4a0', '#d47f9b']

interface MatchEvolution {
  /** Full RTH 5-min session bars for this match. */
  session: AnalogShape
  /** True if the corpus entry was vertically mirrored (legacy /analogs flip). */
  flipped: boolean
  /** DTW distance — drives line opacity + thickness so the tightest
   *  match dominates the visual the same way it dominates the
   *  weighted accuracy aggregation. */
  dtw: number
  ticker: string
  date: string
}

interface Props {
  /** Query candles — bars 1..N where N is the anchor (typically 6). */
  queryShape: AnalogShape
  /** Number of bars in the anchor window (the "open"). Defaults to 6. */
  anchorBars?: number
  /** Matches whose full session is loaded. Drawn after the anchor. */
  matches: MatchEvolution[]
}

/** Mean (high − low) over a slice of bars, used as the per-match ATR
 *  proxy when normalizing post-anchor moves. Same definition the corpus
 *  uses, so values here are directly comparable to corpus outcomes. */
function atrProxy(highs: number[], lows: number[]): number {
  if (!highs.length) return 0
  let sum = 0
  for (let i = 0; i < highs.length; i++) sum += highs[i] - lows[i]
  return sum / highs.length
}

export function PostAnchorEvolution({ queryShape, anchorBars = 6, matches }: Props) {
  const W = 720
  const H = 280
  const PAD_X = 16
  const PAD_TOP = 22
  const PAD_BOT = 28
  const usableW = W - PAD_X * 2
  const usableH = H - PAD_TOP - PAD_BOT

  // Find the longest match session so the x-axis spans bar 1 → max length.
  const maxAfter = matches.reduce(
    (acc, m) => Math.max(acc, m.session.open.length - anchorBars),
    0,
  )
  const totalBars = anchorBars + maxAfter
  if (totalBars < 2) return null

  const xStep = usableW / (totalBars - 0.0001)
  const xCenter = (i: number) => PAD_X + xStep * (i + 0.5)
  const halfBody = Math.min(xStep * 0.18, 7)

  // Per-match: anchor close + ATR proxy + post-anchor close trajectory.
  const evolutions = matches.map((m, mi) => {
    const sess = m.session
    const n = sess.open.length
    if (n <= anchorBars) {
      return null
    }
    const anchorClose = sess.close[anchorBars - 1]
    // ATR proxy: mean bar range over the WHOLE session, so the
    // normalization is independent of the post-anchor noise level.
    const atr = atrProxy(sess.high, sess.low)
    if (atr <= 0) return null
    const after = sess.close.slice(anchorBars - 1)  // include anchor as t=0
    const atrUnits = after.map((c) => {
      const v = (c - anchorClose) / atr
      return m.flipped ? -v : v
    })
    return {
      atrUnits,
      color: MATCH_COLORS[mi % MATCH_COLORS.length],
      dtw: m.dtw,
      ticker: m.ticker,
      date: m.date,
    }
  }).filter((x): x is NonNullable<typeof x> => x !== null)

  // Pick an ATR range that covers the matches symmetrically around 0.
  const allAtr = evolutions.flatMap((e) => e.atrUnits)
  const absMax = Math.max(...allAtr.map(Math.abs), 1.0)
  const atrPad = absMax * 1.1

  // Right-half coordinate system: ATR units → pixels.
  const yPxAtr = (v: number) => {
    const t = (v + atrPad) / (2 * atrPad)
    return PAD_TOP + (1 - t) * usableH
  }

  // Left-half (query candles): joint OHLC normalize in the query's own
  // band, then plot. To make the candles visually align with the right
  // side at bar 6 (anchor close = ATR 0), we MAP the query's bar-6 close
  // to ATR 0 too: shift the query's normalized values so close[anchor-1]
  // sits at 0.5 in the local norm, which maps to ATR 0 in pixels.
  const qOpenN = queryShape.open.slice(0, anchorBars)
  const qHighN = queryShape.high.slice(0, anchorBars)
  const qLowN = queryShape.low.slice(0, anchorBars)
  const qCloseN = queryShape.close.slice(0, anchorBars)
  const qLo = Math.min(...qOpenN, ...qHighN, ...qLowN, ...qCloseN)
  const qHi = Math.max(...qOpenN, ...qHighN, ...qLowN, ...qCloseN)
  const qSpan = (qHi - qLo) || 1
  const norm = (v: number) => (v - qLo) / qSpan
  const anchorNorm = norm(qCloseN[anchorBars - 1])
  // Local query-band center on screen = pixel where ATR 0 sits.
  const qBandCenterPx = yPxAtr(0)
  // Query band height: scale so [0, 1] norm covers ~half the chart vertically.
  const qBandHalfHeight = usableH * 0.30
  const yPxQuery = (v: number) => qBandCenterPx + (anchorNorm - norm(v)) * (qBandHalfHeight * 2)

  const QUERY_UP = '#34c79b', QUERY_DN = '#e07060', WICK = '#b8aea0'

  // Reference grid lines at ±1, ±2 ATR.
  const gridLines = [-2, -1, 0, 1, 2].filter((v) => Math.abs(v) <= atrPad - 0.05)

  return (
    <div className="border border-border rounded p-2"
         style={{ background: '#1c1815' }}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-1.5 text-[10px]">
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-2 rounded-sm" style={{ background: QUERY_UP }} />
          <span className="text-text">query (open)</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="text-sub">match continuations:</span>
          {evolutions.map((e, i) => (
            <span key={i} className="inline-flex items-center gap-0.5">
              <span className="inline-block w-3 h-0.5"
                style={{ background: e.color, opacity: 0.85 }} />
              <span className="text-sub text-[9px] font-mono">{e.ticker}</span>
            </span>
          ))}
        </span>
        <span className="text-sub">post-anchor close, ATR units from bar {anchorBars}</span>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} width="100%" preserveAspectRatio="xMidYMid meet"
           className="block max-w-full">
        {/* Horizontal grid lines */}
        {gridLines.map((v) => (
          <g key={`grid-${v}`}>
            <line x1={PAD_X} x2={W - PAD_X} y1={yPxAtr(v)} y2={yPxAtr(v)}
              stroke="#5a5048"
              strokeWidth={v === 0 ? 1 : 0.6}
              strokeDasharray={v === 0 ? "0" : "2 4"}
              strokeOpacity={v === 0 ? 0.7 : 0.4} />
            <text x={W - PAD_X - 2} y={yPxAtr(v) - 3} textAnchor="end"
              fontSize={9} fill="#9b9286">
              {v === 0 ? 'anchor' : `${v > 0 ? '+' : ''}${v} ATR`}
            </text>
          </g>
        ))}

        {/* Vertical anchor line at bar 6 */}
        <line
          x1={xCenter(anchorBars - 1) + xStep / 2}
          x2={xCenter(anchorBars - 1) + xStep / 2}
          y1={PAD_TOP} y2={H - PAD_BOT}
          stroke="#5a5048" strokeWidth={1} strokeDasharray="3 3" strokeOpacity={0.7} />
        <text
          x={xCenter(anchorBars - 1) + xStep / 2 + 4}
          y={PAD_TOP + 10}
          fontSize={9} fill="#9b9286"
          fontStyle="italic">
          ← morning · what happens next →
        </text>

        {/* Query candles, bars 1..anchorBars, in their own band */}
        {Array.from({ length: anchorBars }).map((_, i) => {
          const o = qOpenN[i], h = qHighN[i], l = qLowN[i], c = qCloseN[i]
          const isUp = c >= o
          const col = isUp ? QUERY_UP : QUERY_DN
          const x = xCenter(i)
          const yH = yPxQuery(h), yL = yPxQuery(l), yO = yPxQuery(o), yC = yPxQuery(c)
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

        {/* Match continuations */}
        {(() => {
          const weights = evolutions.map((e) => 1 / (e.dtw + 0.1))
          const wMax = Math.max(...weights, 1e-9)
          return evolutions.map((e, mi) => {
            const wNorm = weights[mi] / wMax
            const opacity = 0.35 + wNorm * 0.55
            const strokeWidth = 1.2 + wNorm * 1.6
            // Plot starting at bar (anchorBars - 1) so the line begins at
            // the anchor (where t=0 in atrUnits).
            const path = e.atrUnits
              .map((v, k) => {
                const x = xCenter(anchorBars - 1 + k)
                return `${k === 0 ? 'M' : 'L'} ${x} ${yPxAtr(v)}`
              }).join(' ')
            const lastIdx = e.atrUnits.length - 1
            return (
              <g key={`m-${mi}`}>
                <path d={path} fill="none" stroke={e.color}
                  strokeWidth={strokeWidth} strokeOpacity={opacity}
                  strokeLinecap="round" strokeLinejoin="round" />
                {/* Endpoint marker — where each match ended the day */}
                <circle
                  cx={xCenter(anchorBars - 1 + lastIdx)}
                  cy={yPxAtr(e.atrUnits[lastIdx])}
                  r={3} fill={e.color} fillOpacity={opacity} />
              </g>
            )
          })
        })()}

        {/* Bar-number axis (every 6 bars) */}
        {Array.from({ length: totalBars }).map((_, i) => {
          if (i !== 0 && i !== anchorBars - 1 && (i + 1) % 12 !== 0 && i !== totalBars - 1) return null
          const label = i === anchorBars - 1
            ? `bar ${i + 1} (anchor)`
            : `bar ${i + 1}`
          return (
            <text key={`xt-${i}`} x={xCenter(i)} y={H - 8}
              textAnchor="middle" fontSize={9} fill="#9b9286">
              {label}
            </text>
          )
        })}
      </svg>
    </div>
  )
}
