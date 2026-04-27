'use client'

/** BrooksBarStrip — per-bar Brooks-vocabulary tags rendered as a
 *  color-coded strip. Two rows (query, match), one column per bar.
 *  Same-color cells = the bar types agree at that position. Visual
 *  read of the same data the collapsible "Bar-by-bar labels" table
 *  shows, designed to be glanceable next to the spatial overlay. */

interface BarLabel {
  bar_type: string
  close_position: 'top' | 'mid' | 'bottom'
  ema_position: 'above' | 'near' | 'below'
  body_ratio: number
  ema_dist_atr: number
}

const BAR_TYPE_FILL: Record<string, string> = {
  bull_signal: '#34c79b',
  bull_trend:  '#34c79b',
  bull_minor:  '#34c79b66',
  bear_signal: '#e07060',
  bear_trend:  '#e07060',
  bear_minor:  '#e0706066',
  doji:        '#f5c842',
  neutral:     '#5a5048',
}

const BAR_TYPE_LABEL: Record<string, string> = {
  bull_signal: 'B-SIG',
  bull_trend:  'B-TR',
  bull_minor:  'b-min',
  bear_signal: 'S-SIG',
  bear_trend:  'S-TR',
  bear_minor:  's-min',
  doji:        'doji',
  neutral:     '—',
}

/** Conceptually mirror a bar label so a flipped match is comparable. */
function flipLabel(l: BarLabel): BarLabel {
  const flipType: Record<string, string> = {
    bull_signal: 'bear_signal', bull_trend: 'bear_trend', bull_minor: 'bear_minor',
    bear_signal: 'bull_signal', bear_trend: 'bull_trend', bear_minor: 'bull_minor',
    doji: 'doji', neutral: 'neutral',
  }
  return { ...l, bar_type: flipType[l.bar_type] ?? l.bar_type }
}

interface Props {
  queryLabels: BarLabel[]
  matchLabels: BarLabel[]
  flippedMatch?: boolean
}

export function BrooksBarStrip({ queryLabels, matchLabels, flippedMatch = false }: Props) {
  const n = Math.min(queryLabels.length, matchLabels.length)
  if (n === 0) return null

  return (
    <div className="border border-border rounded p-2 text-[10px]"
         style={{ background: '#1c1815' }}>
      <div className="flex items-center gap-3 mb-1.5">
        <span className="text-sub">Brooks bar types</span>
        <span className="text-sub/70">teal = bull · red = bear · yellow = doji</span>
      </div>
      <div className="grid gap-px"
           style={{ gridTemplateColumns: `28px repeat(${n}, 1fr)` }}>
        {/* Query row */}
        <div className="text-sub uppercase tracking-wider self-center">Q</div>
        {queryLabels.slice(0, n).map((l, i) => {
          const fill = BAR_TYPE_FILL[l.bar_type] ?? BAR_TYPE_FILL.neutral
          return (
            <div key={`q-${i}`}
              className="text-center px-1 py-1 rounded text-text font-mono font-semibold"
              style={{ background: fill, color: l.bar_type === 'doji' ? '#1c1815' : '#fff' }}
              title={`bar ${i + 1}: ${l.bar_type} · close@${l.close_position} · ${l.ema_position} EMA`}>
              {BAR_TYPE_LABEL[l.bar_type] ?? l.bar_type}
            </div>
          )
        })}

        {/* Match row */}
        <div className="text-sub uppercase tracking-wider self-center">M</div>
        {matchLabels.slice(0, n).map((raw, i) => {
          const l = flippedMatch ? flipLabel(raw) : raw
          const fill = BAR_TYPE_FILL[l.bar_type] ?? BAR_TYPE_FILL.neutral
          const queryType = queryLabels[i]?.bar_type
          const matches = queryType === l.bar_type
          return (
            <div key={`m-${i}`}
              className={`text-center px-1 py-1 rounded text-text font-mono font-semibold ${
                matches ? '' : 'ring-1 ring-yellow/60'
              }`}
              style={{ background: fill, color: l.bar_type === 'doji' ? '#1c1815' : '#fff' }}
              title={`bar ${i + 1}: ${l.bar_type}${flippedMatch ? ' (flipped)' : ''} · close@${l.close_position} · ${l.ema_position} EMA${matches ? '' : ' · differs from query'}`}>
              {BAR_TYPE_LABEL[l.bar_type] ?? l.bar_type}
            </div>
          )
        })}

        {/* Bar-number row */}
        <div className="text-sub" />
        {Array.from({ length: n }).map((_, i) => (
          <div key={`n-${i}`} className="text-sub text-center text-[9px] mt-0.5">
            {i + 1}
          </div>
        ))}
      </div>
      <p className="text-[10px] text-sub mt-1.5">
        Same color in both rows = agreeing bar types. Yellow ring = disagreement.
      </p>
    </div>
  )
}
