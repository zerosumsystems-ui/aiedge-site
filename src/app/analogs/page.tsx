'use client'

import { useEffect, useMemo, useState } from 'react'

type Outcome = {
  open_direction: 'up' | 'down' | 'flat'
  open_move_pct: number
  eod_move_pct: number
  intraday_range_pct: number
  max_continuation_pct: number
  max_reversal_pct: number
  aligned_eod: boolean
  insufficient_data?: boolean
}

type BarLabel = {
  bar_type: string
  close_position: 'top' | 'mid' | 'bottom'
  ema_position: 'above' | 'near' | 'below'
  body_ratio: number
  ema_dist_atr: number
}

type BarsBundle = {
  open: number[]; high: number[]; low: number[]; close: number[];
  ema20: number[]; times: string[]
}

type Entry = {
  date: string
  ticker: string
  slug: string
  outcome: Outcome
  trades_count: number
  trades_directions: string[]
  opening_setups: string[]
  first_6_chart: string
  full_session_chart: string
  first_6_bars: BarsBundle
  full_session: BarsBundle
  first_6_labels?: BarLabel[]
}

type Corpus = {
  n_open_bars: number
  entries: Entry[]
  built_at: string
}

type Match = {
  rank: number
  slug: string
  date: string
  ticker: string
  dtw: number
  flipped: boolean
}

type Matches = {
  k: number
  n_entries: number
  matches: Record<string, Match[]>
  feature_weight: number
}

function pct(n: number | null | undefined, dp = 1): string {
  if (n === null || n === undefined) return '—'
  const sign = n >= 0 ? '+' : ''
  return `${sign}${(n * 100).toFixed(dp)}%`
}

function pctClass(n: number | null | undefined): string {
  if (n === null || n === undefined) return 'text-sub'
  return n > 0 ? 'text-teal' : n < 0 ? 'text-red' : 'text-sub'
}

function dirArrow(dir: string): string {
  if (dir === 'up') return '↑'
  if (dir === 'down') return '↓'
  return '→'
}

const BAR_TYPE_LABEL: Record<string, string> = {
  bull_signal: 'Bull Signal',
  bull_trend:  'Bull Trend',
  bull_minor:  'Bull Minor',
  bear_signal: 'Bear Signal',
  bear_trend:  'Bear Trend',
  bear_minor:  'Bear Minor',
  doji:        'Doji',
  neutral:     'Neutral',
}

const BAR_TYPE_COLOR: Record<string, string> = {
  bull_signal: 'text-teal',
  bull_trend:  'text-teal',
  bull_minor:  'text-teal/70',
  bear_signal: 'text-red',
  bear_trend:  'text-red',
  bear_minor:  'text-red/70',
  doji:        'text-yellow',
  neutral:     'text-sub',
}

/** Conceptually mirror a bar label so a flipped match can be compared on equal footing. */
function flipLabel(l: BarLabel): BarLabel {
  const FLIP_TYPE: Record<string, string> = {
    bull_signal: 'bear_signal', bull_trend: 'bear_trend', bull_minor: 'bear_minor',
    bear_signal: 'bull_signal', bear_trend: 'bull_trend', bear_minor: 'bull_minor',
    doji: 'doji', neutral: 'neutral',
  }
  const FLIP_CLOSE: Record<BarLabel['close_position'], BarLabel['close_position']> = {
    top: 'bottom', bottom: 'top', mid: 'mid',
  }
  const FLIP_EMA: Record<BarLabel['ema_position'], BarLabel['ema_position']> = {
    above: 'below', below: 'above', near: 'near',
  }
  return {
    bar_type: FLIP_TYPE[l.bar_type] ?? l.bar_type,
    close_position: FLIP_CLOSE[l.close_position],
    ema_position: FLIP_EMA[l.ema_position],
    body_ratio: l.body_ratio,
    ema_dist_atr: -l.ema_dist_atr,
  }
}

function BarBadge({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <span className={`text-[10px] uppercase tracking-wide font-semibold ${color}`}>
      {children}
    </span>
  )
}

type Bars = {
  open: number[]; high: number[]; low: number[]; close: number[]; ema20: number[]
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
  // When flipping for bear→bull comparison, swap H↔L too (since flipped highs become lows).
  const o = bars.open.map(n)
  const c = bars.close.map(n)
  const e = bars.ema20.map(n)
  const h = flipY ? bars.low.map(n) : bars.high.map(n)
  const l = flipY ? bars.high.map(n) : bars.low.map(n)
  return { o, h, l, c, e }
}

/** Side-by-side spatial overlay: query candles + match candles on the same
 *  normalized axes, with their EMA lines as smooth curves. The closer the
 *  shapes overlap, the better the match — that's what the DTW score measures. */
function SpatialOverlay({
  query, match, flippedMatch,
}: { query: Bars; match: Bars; flippedMatch: boolean }) {
  const W = 560, H = 200, PAD_X = 12, PAD_Y = 12
  const n = Math.min(query.open.length, match.open.length)
  if (n < 2) return null

  const Q = normalize(query, false)
  const M = normalize(match, flippedMatch)

  const usableW = W - PAD_X * 2
  const usableH = H - PAD_Y * 2
  const xStep = usableW / (n - 0.0001)
  const xCenter = (i: number) => PAD_X + xStep * (i + 0.5)
  const yPx = (v: number) => PAD_Y + (1 - v) * usableH

  // Slight horizontal nudge so query and match candles don't overlap exactly.
  const halfBody = Math.min(xStep * 0.18, 8)
  const offset = halfBody + 2

  const QUERY_UP = '#1f7a57', QUERY_DN = '#9f3a2d'
  const MATCH_UP = '#3b82f6', MATCH_DN = '#a855f7'   // blue/purple = match

  const renderSeries = (
    bars: ReturnType<typeof normalize>, xOffset: number, upColor: string, downColor: string
  ) => {
    const elements: React.ReactNode[] = []
    // Wicks + bodies
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

  // EMA polylines
  const emaPath = (bars: ReturnType<typeof normalize>, xOffset: number) =>
    bars.e.map((v, i) => `${i === 0 ? 'M' : 'L'} ${xCenter(i) + xOffset} ${yPx(v)}`).join(' ')

  return (
    <div className="bg-bg border border-border rounded p-2">
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
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" preserveAspectRatio="xMidYMid meet"
           className="block max-w-full">
        {/* Match drawn first so query sits on top */}
        {renderSeries(M, +offset, MATCH_UP, MATCH_DN)}
        <path d={emaPath(M, +offset)} fill="none"
          stroke="#7c3aed" strokeWidth={1.5} strokeOpacity={0.7} />
        {renderSeries(Q, -offset, QUERY_UP, QUERY_DN)}
        <path d={emaPath(Q, -offset)} fill="none"
          stroke="#0e3b6b" strokeWidth={1.5} strokeOpacity={0.7} />
        {/* X-axis bar numbers */}
        {Array.from({ length: n }).map((_, i) => (
          <text key={`xt-${i}`} x={xCenter(i)} y={H - 2}
            textAnchor="middle" fontSize={9} fill="#808080">
            bar {i + 1}
          </text>
        ))}
      </svg>
    </div>
  )
}

type DirectionMode = 'same' | 'include_flips'
const SHOW_K = 5  // how many matches to display after filtering

export default function AnalogsPage() {
  const [corpus, setCorpus] = useState<Corpus | null>(null)
  const [matches, setMatches] = useState<Matches | null>(null)
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [directionMode, setDirectionMode] = useState<DirectionMode>('include_flips')

  useEffect(() => {
    Promise.all([
      fetch('/analogs/corpus.json', { cache: 'no-store' }).then((r) => r.json()),
      fetch('/analogs/matches.json', { cache: 'no-store' }).then((r) => r.json()),
    ])
      .then(([c, m]) => {
        setCorpus(c)
        setMatches(m)
        if (c.entries.length && !selectedSlug) {
          // Default to the most recent entry
          const sorted = [...c.entries].sort((a, b) => b.date.localeCompare(a.date))
          setSelectedSlug(sorted[0].slug)
        }
      })
      .catch((e) => setError(e.message))
  }, [selectedSlug])

  const entryBySlug = useMemo(() => {
    const m = new Map<string, Entry>()
    if (corpus) for (const e of corpus.entries) m.set(e.slug, e)
    return m
  }, [corpus])

  const sortedEntries = useMemo(() => {
    if (!corpus) return []
    return [...corpus.entries].sort((a, b) => b.date.localeCompare(a.date))
  }, [corpus])

  const selected = selectedSlug ? entryBySlug.get(selectedSlug) ?? null : null
  const allSelectedMatches: Match[] = selectedSlug && matches ? matches.matches[selectedSlug] ?? [] : []
  const selectedMatches: Match[] = useMemo(() => {
    const filtered = directionMode === 'same'
      ? allSelectedMatches.filter((m) => !m.flipped)
      : allSelectedMatches
    // Re-rank to 1..N after filtering so the displayed numbers are contiguous.
    return filtered.slice(0, SHOW_K).map((m, i) => ({ ...m, rank: i + 1 }))
  }, [allSelectedMatches, directionMode])
  const flippedCount = allSelectedMatches.filter((m) => m.flipped).length
  const sameCount    = allSelectedMatches.filter((m) => !m.flipped).length

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <div className="mb-4">
        <h1 className="text-xl font-semibold text-text">Analogs</h1>
        <p className="text-sm text-sub">
          Past trading days whose first {corpus?.n_open_bars ?? 6} bars look like the selected
          morning. Pick a date/ticker to see the 5 most-similar analogs and what happened
          after each open.
        </p>
      </div>

      {error && (
        <div className="mb-4 rounded border border-red/30 bg-red/10 px-3 py-2 text-sm text-red">
          Error: {error}
        </div>
      )}

      {corpus && (
        <div className="mb-6 flex flex-wrap gap-1.5">
          {sortedEntries.map((e) => {
            const active = e.slug === selectedSlug
            return (
              <button
                key={e.slug}
                onClick={() => setSelectedSlug(e.slug)}
                className={`text-[11px] rounded px-2 py-1 border transition ${
                  active
                    ? 'bg-teal/20 border-teal text-teal'
                    : 'border-border text-sub hover:border-sub hover:text-text'
                }`}
              >
                <span className="font-mono text-text">{e.ticker}</span>
                <span className="text-sub ml-1.5">{e.date}</span>
                <span
                  className={`ml-1.5 ${pctClass(e.outcome.eod_move_pct)}`}
                  title="EOD move from open"
                >
                  {dirArrow(e.outcome.open_direction)}
                </span>
              </button>
            )
          })}
        </div>
      )}

      {selected && (
        <article className="space-y-6">
          <header>
            <h2 className="text-lg font-semibold text-text">
              {selected.ticker} · {selected.date}
            </h2>
            <p className="text-sm text-text mt-2">
              <span className="text-sub">open went</span>{' '}
              <span className={pctClass(selected.outcome.open_move_pct)}>
                {dirArrow(selected.outcome.open_direction)} {pct(selected.outcome.open_move_pct)}
              </span>
              <span className="text-sub"> over the first {corpus?.n_open_bars} bars · then</span>{' '}
              <span className={pctClass(selected.outcome.max_continuation_pct)}>
                {pct(selected.outcome.max_continuation_pct)} continuation
              </span>
              <span className="text-sub"> /</span>{' '}
              <span className={pctClass(-selected.outcome.max_reversal_pct)}>
                {pct(-selected.outcome.max_reversal_pct)} reversal
              </span>
              <span className="text-sub"> · EOD</span>{' '}
              <span className={pctClass(selected.outcome.eod_move_pct)}>
                {pct(selected.outcome.eod_move_pct)}
              </span>
              {selected.outcome.aligned_eod && (
                <span className="ml-2 text-teal text-xs">✓ open-aligned EOD</span>
              )}
            </p>
            <p className="text-xs text-sub mt-1">
              {selected.opening_setups.join(' · ')}
            </p>
          </header>

          <div>
            <p className="text-xs text-sub mb-1">First {corpus?.n_open_bars} bars (the open you matched on)</p>
            <img
              src={`/analogs/${selected.slug}/${selected.first_6_chart}`}
              alt={`${selected.ticker} ${selected.date} open`}
              className="w-full h-auto rounded border border-border"
            />
          </div>

          <div>
            <p className="text-xs text-sub mb-1">Full RTH session — what happened after</p>
            <img
              src={`/analogs/${selected.slug}/${selected.full_session_chart}`}
              alt={`${selected.ticker} ${selected.date} full session`}
              className="w-full h-auto rounded border border-border"
            />
          </div>

          <div className="pt-4">
            <div className="flex items-baseline justify-between gap-3 mb-3">
              <h3 className="text-base font-semibold text-text">
                {selectedMatches.length} most-similar past morning{selectedMatches.length === 1 ? '' : 's'}
              </h3>
              <div className="inline-flex items-center gap-0.5 text-[11px] rounded border border-border p-0.5">
                <button
                  onClick={() => setDirectionMode('same')}
                  className={`px-2 py-0.5 rounded transition ${
                    directionMode === 'same'
                      ? 'bg-teal/20 text-teal'
                      : 'text-sub hover:text-text'
                  }`}
                  title="Show only matches where the open went the same direction"
                >
                  Same direction · {sameCount}
                </button>
                <button
                  onClick={() => setDirectionMode('include_flips')}
                  className={`px-2 py-0.5 rounded transition ${
                    directionMode === 'include_flips'
                      ? 'bg-teal/20 text-teal'
                      : 'text-sub hover:text-text'
                  }`}
                  title="Include matches where the corpus open was vertically mirrored"
                >
                  Include flips · {sameCount + flippedCount}
                </button>
              </div>
            </div>
            <div className="space-y-8">
              {selectedMatches.map((m) => {
                const e = entryBySlug.get(m.slug)
                if (!e) return null
                return (
                  <section key={m.slug}>
                    <header className="mb-2">
                      <h4 className="text-base font-semibold text-text">
                        #{m.rank} · {e.ticker} · {e.date}
                        {m.flipped && (
                          <span className="ml-2 text-yellow text-xs font-semibold">[FLIP]</span>
                        )}
                      </h4>
                      <p className="text-xs text-sub mt-0.5">
                        DTW {m.dtw.toFixed(3)} · open {dirArrow(e.outcome.open_direction)}{' '}
                        {pct(e.outcome.open_move_pct)} · EOD{' '}
                        <span className={pctClass(e.outcome.eod_move_pct)}>
                          {pct(e.outcome.eod_move_pct)}
                        </span>
                        {e.outcome.aligned_eod && (
                          <span className="ml-1.5 text-teal">✓ aligned</span>
                        )}
                      </p>
                    </header>
                    <p className="text-[11px] text-sub mb-1">first {corpus?.n_open_bars} bars</p>
                    <img
                      src={`/analogs/${m.slug}/${e.first_6_chart}`}
                      alt={`${e.ticker} ${e.date} open`}
                      className="w-full h-auto rounded border border-border"
                    />
                    <p className="text-[11px] text-sub mb-1 mt-3">full session — what happened next</p>
                    <img
                      src={`/analogs/${m.slug}/${e.full_session_chart}`}
                      alt={`${e.ticker} ${e.date} full session`}
                      className="w-full h-auto rounded border border-border"
                    />
                    {/* Spatial overlay — the actual data the matcher compares */}
                    <div className="mt-3">
                      <p className="text-[11px] text-sub mb-1">
                        Spatial overlay — query (green/red) vs match (blue/purple), normalized to
                        [0,1] on the same axes. The closer the shapes line up, the higher the DTW
                        score.
                      </p>
                      <SpatialOverlay
                        query={selected.first_6_bars}
                        match={e.first_6_bars}
                        flippedMatch={m.flipped}
                      />
                    </div>
                    {selected.first_6_labels && e.first_6_labels && (
                      <details className="mt-3 group">
                        <summary className="cursor-pointer text-xs text-sub hover:text-text select-none list-none flex items-center gap-1">
                          <span className="inline-block transition-transform group-open:rotate-90">▸</span>
                          <span>Bar-by-bar Brooks labels</span>
                        </summary>
                        <table className="mt-2 w-full text-[11px] border-collapse">
                          <thead>
                            <tr className="text-sub border-b border-border">
                              <th className="text-left py-1 font-normal">Bar</th>
                              <th className="text-left py-1 font-normal">Query · {selected.ticker}</th>
                              <th className="text-left py-1 font-normal">
                                Match · {e.ticker}
                                {m.flipped && <span className="ml-1 text-yellow">(flipped)</span>}
                              </th>
                              <th className="text-center py-1 font-normal">Agree</th>
                            </tr>
                          </thead>
                          <tbody>
                            {selected.first_6_labels.map((q, i) => {
                              const raw = e.first_6_labels![i]
                              if (!raw) return null
                              const c = m.flipped ? flipLabel(raw) : raw
                              const agreeType  = q.bar_type === c.bar_type
                              const agreeClose = q.close_position === c.close_position
                              const agreeEma   = q.ema_position === c.ema_position
                              const score = (agreeType ? 1 : 0) + (agreeClose ? 1 : 0) + (agreeEma ? 1 : 0)
                              const dot = (ok: boolean) => (
                                <span className={ok ? 'text-teal' : 'text-red/70'}>{ok ? '●' : '○'}</span>
                              )
                              return (
                                <tr key={i} className="border-b border-border/40">
                                  <td className="py-1 font-mono text-sub">{i + 1}</td>
                                  <td className="py-1">
                                    <BarBadge color={BAR_TYPE_COLOR[q.bar_type] ?? 'text-sub'}>
                                      {BAR_TYPE_LABEL[q.bar_type] ?? q.bar_type}
                                    </BarBadge>{' '}
                                    <span className="text-sub">· close@{q.close_position}</span>{' '}
                                    <span className="text-sub">· {q.ema_position} EMA</span>
                                  </td>
                                  <td className="py-1">
                                    <BarBadge color={BAR_TYPE_COLOR[c.bar_type] ?? 'text-sub'}>
                                      {BAR_TYPE_LABEL[c.bar_type] ?? c.bar_type}
                                    </BarBadge>{' '}
                                    <span className="text-sub">· close@{c.close_position}</span>{' '}
                                    <span className="text-sub">· {c.ema_position} EMA</span>
                                  </td>
                                  <td className="py-1 text-center font-mono">
                                    {dot(agreeType)}{dot(agreeClose)}{dot(agreeEma)}
                                    <span className="ml-1 text-sub">{score}/3</span>
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                        <p className="mt-2 text-[10px] text-sub">
                          ● bar-type · close-in-range · EMA-distance. Three Brooks-vocabulary tags
                          per bar. The matcher also compares raw OHLC + EMA via DTW (the numbers behind these labels) — this table is the *plain-English* view of what's being compared.
                        </p>
                      </details>
                    )}
                  </section>
                )
              })}
            </div>
          </div>

          <details className="pt-4 border-t border-border group">
            <summary className="cursor-pointer text-sm font-semibold text-text hover:text-teal select-none list-none flex items-center gap-1.5">
              <span className="inline-block transition-transform group-open:rotate-90">▸</span>
              How DTW works, what the score means, and what it can&apos;t see
            </summary>
            <div className="mt-3 space-y-5 text-sm text-text/85 leading-relaxed">

              {/* Section 1 */}
              <section>
                <h4 className="text-text font-semibold mb-1.5 text-base">1. What DTW is</h4>
                <p>
                  <span className="font-semibold text-text">Dynamic Time Warping</span> measures
                  how similar two time-series are when one may be slightly stretched or
                  compressed in time relative to the other. Regular point-by-point distance
                  (Euclidean) fails if a move takes 4 bars in one chart and 5 in another, even
                  though they&apos;re structurally the same. DTW handles this by finding the best
                  <em> alignment</em> between the two sequences before computing distance.
                </p>
                <p className="mt-1.5">
                  The algorithm was introduced for speech recognition by{' '}
                  <a className="text-teal hover:underline" target="_blank" rel="noopener"
                     href="https://doi.org/10.1109/TASSP.1978.1163055">
                    Sakoe &amp; Chiba (1978)
                  </a>
                  {' '}and adapted to time-series data mining by{' '}
                  <a className="text-teal hover:underline" target="_blank" rel="noopener"
                     href="https://www.aaai.org/Papers/Workshops/1994/WS-94-03/WS94-03-031.pdf">
                    Berndt &amp; Clifford (1994)
                  </a>.
                </p>
              </section>

              {/* Section 2 */}
              <section>
                <h4 className="text-text font-semibold mb-1.5 text-base">2. The algorithm</h4>
                <p>
                  Given two sequences <span className="font-mono">X = x₁ … xₙ</span> and{' '}
                  <span className="font-mono">Y = y₁ … yₘ</span> (each <span className="font-mono">xᵢ</span> and{' '}
                  <span className="font-mono">yⱼ</span> can be a vector), DTW builds an{' '}
                  <span className="font-mono">n × m</span> cost matrix where cell{' '}
                  <span className="font-mono">D(i, j)</span> is the cumulative cost of the best
                  alignment ending at <span className="font-mono">(xᵢ, yⱼ)</span>:
                </p>
                <pre className="mt-2 bg-bg border border-border rounded px-3 py-2 text-xs overflow-x-auto">
{`D(i, j) = ‖xᵢ − yⱼ‖ + min { D(i−1, j),     // step in X only
                          D(i, j−1),     // step in Y only
                          D(i−1, j−1) }  // diagonal step`}
                </pre>
                <p className="mt-2">
                  with boundary conditions{' '}
                  <span className="font-mono">D(0, 0) = 0</span> and{' '}
                  <span className="font-mono">D(i, 0) = D(0, j) = ∞</span>. The DTW score is{' '}
                  <span className="font-mono">D(n, m)</span>: the cost of the cheapest path from{' '}
                  <span className="font-mono">(1, 1)</span> to{' '}
                  <span className="font-mono">(n, m)</span> through the matrix. Each step in
                  the path corresponds to one alignment between a query bar and a match bar.
                  Time and space complexity are both <span className="font-mono">O(n·m)</span>{' '}
                  — for our 6×6 charts that&apos;s 36 cells, runs in microseconds.
                </p>

                <div className="bg-bg border border-border rounded p-3 mt-3">
                  <p className="text-xs text-sub mb-2 font-semibold">Visual intuition</p>
                  <svg viewBox="0 0 560 140" width="100%" preserveAspectRatio="xMidYMid meet"
                       className="block max-w-full">
                    {(() => {
                      const ya = [70, 55, 38, 28, 32, 50, 65, 70]
                      const yb = [85, 70, 50, 45, 30, 35, 60, 75]
                      const xs = ya.map((_, i) => 40 + i * 65)
                      const linePath = (ys: number[]) =>
                        ys.map((y, i) => `${i === 0 ? 'M' : 'L'} ${xs[i]} ${y}`).join(' ')
                      return (
                        <>
                          {[
                            [0, 0], [1, 0], [1, 1], [2, 2], [3, 3], [4, 3], [4, 4], [5, 5], [6, 6], [7, 7],
                          ].map(([qi, ci], k) => (
                            <line key={`w-${k}`} x1={xs[qi]} y1={ya[qi]} x2={xs[ci]} y2={yb[ci] + 50}
                              stroke="#808080" strokeWidth={0.7} strokeDasharray="2,3" opacity={0.7} />
                          ))}
                          <path d={linePath(ya)} fill="none" stroke="#1f7a57" strokeWidth={2} />
                          {ya.map((y, i) => (
                            <circle key={`a-${i}`} cx={xs[i]} cy={y} r={3.5} fill="#1f7a57" />
                          ))}
                          <path d={linePath(yb.map((y) => y + 50))}
                            fill="none" stroke="#3b82f6" strokeWidth={2} />
                          {yb.map((y, i) => (
                            <circle key={`b-${i}`} cx={xs[i]} cy={y + 50} r={3.5} fill="#3b82f6" />
                          ))}
                          <text x={10} y={42} fontSize={10} fill="#1f7a57" fontWeight={600}>query</text>
                          <text x={10} y={130} fontSize={10} fill="#3b82f6" fontWeight={600}>match</text>
                        </>
                      )
                    })()}
                  </svg>
                  <p className="text-[11px] text-sub mt-1.5">
                    Dashed lines = the warp path. Bar 1 of query maps to bars 1 AND 2 of match
                    (move took longer there); bar 4 of query maps to bars 3 AND 4 of match
                    (slight compression). DTW score is the sum of point-distances along these
                    dashed lines.
                  </p>
                </div>
              </section>

              {/* Section 3 */}
              <section>
                <h4 className="text-text font-semibold mb-1.5 text-base">3. Our specific recipe</h4>
                <p>
                  We use the <strong>multi-dimensional DTW</strong> generalization (each cell
                  cost is a vector distance, not scalar), implemented by the{' '}
                  <a className="text-teal hover:underline" target="_blank" rel="noopener"
                     href="https://github.com/wannesm/dtaidistance">
                    dtaidistance
                  </a>
                  {' '}library&apos;s C-optimized{' '}
                  <span className="font-mono text-xs">dtw_ndim.distance_fast</span>. Multi-dim
                  DTW for time-series classification has subtle pitfalls — see{' '}
                  <a className="text-teal hover:underline" target="_blank" rel="noopener"
                     href="https://link.springer.com/article/10.1007/s10618-016-0455-0">
                    Shokoohi-Yekta et al. (2017)
                  </a>
                  {' '}for the comprehensive treatment.
                </p>
                <p className="mt-2 font-semibold text-text">For each (query, match) pair we sum two DTWs:</p>
                <ul className="list-disc pl-5 space-y-1.5 mt-1">
                  <li>
                    <span className="font-semibold text-text">Skeleton DTW</span> — 5-channel
                    per-bar vector{' '}
                    <span className="font-mono text-xs">[open, high, low, close, ema20]</span>,
                    joint-min-max normalized to [0, 1] per chart. This is the <em>spatial</em>{' '}
                    comparison shown in the overlay above each match.
                  </li>
                  <li>
                    <span className="font-semibold text-text">Brooks-feature DTW</span> —
                    10-channel per-bar feature vector with thresholds matching{' '}
                    <a className="text-teal hover:underline" target="_blank" rel="noopener"
                       href="https://www.wiley.com/en-us/Trading+Price+Action+Trends%3A+Technical+Analysis+of+Price+Charts+Bar+by+Bar+for+the+Serious+Trader-p-9781118066515">
                      Brooks&apos;s Trading Price Action
                    </a>
                    {' '}vocabulary: is_doji, bull/bear trend bar, bull/bear signal bar,
                    body_ratio, close_in_range, bar_size_rel, ema_distance, bar_direction.
                  </li>
                  <li>
                    <span className="font-semibold text-text">Combined score</span>:{' '}
                    <span className="font-mono text-xs">total = skeleton + 0.5 × features</span>.
                    Both contribute; raw shape carries more weight.
                  </li>
                  <li>
                    <span className="font-semibold text-text">Vertical-flip search</span> — we
                    also try the mirrored query (bull-shape ↔ bear-shape) and keep whichever DTW
                    is lower. The mirror swaps high↔low channels and applies{' '}
                    <span className="font-mono">y → 1 − y</span> so the inverted shape is
                    comparable on the same axes. Matches won by the flipped query are tagged{' '}
                    <span className="text-yellow font-semibold">[FLIP]</span>.
                  </li>
                </ul>
                <p className="mt-2">
                  Equal Sakoe-Chiba band constraint{' '}
                  (<a className="text-teal hover:underline" target="_blank" rel="noopener"
                      href="https://link.springer.com/article/10.1007/s10115-004-0154-9">
                    Keogh &amp; Ratanamahatana, 2005
                  </a>)
                  {' '}is <em>not</em> applied — at 6 bars the unconstrained warp is fine.
                </p>
              </section>

              {/* Section 4 */}
              <section>
                <h4 className="text-text font-semibold mb-1.5 text-base">4. Score quality table</h4>
                <p className="mb-2 text-sub text-xs">
                  Calibrated empirically from 43 × 42 = 1,806 pairwise DTWs on the corpus.
                  Distribution is roughly log-normal with mean ~3.0, median ~2.7, 90th percentile ~5.0.
                </p>
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="text-sub border-b border-border">
                      <th className="text-left py-1 font-normal">DTW Score</th>
                      <th className="text-left py-1 font-normal">Quality tier</th>
                      <th className="text-left py-1 font-normal">What you&apos;ll see in the overlay</th>
                    </tr>
                  </thead>
                  <tbody className="text-text/85">
                    <tr className="border-b border-border/40">
                      <td className="py-1 font-mono text-teal">&lt; 1.5</td>
                      <td className="py-1">Tight twin</td>
                      <td className="py-1 text-sub">Candle bodies almost overlap; same ticker different day, or sister tickers (QQQ↔TQQQ).</td>
                    </tr>
                    <tr className="border-b border-border/40">
                      <td className="py-1 font-mono text-teal">1.5 – 2.5</td>
                      <td className="py-1">Strong match</td>
                      <td className="py-1 text-sub">Same shape, minor pace or magnitude differences. EMA lines track closely.</td>
                    </tr>
                    <tr className="border-b border-border/40">
                      <td className="py-1 font-mono text-yellow">2.5 – 3.5</td>
                      <td className="py-1">Solid</td>
                      <td className="py-1 text-sub">Same overall arc; some local divergence (one bar deeper, one wick longer).</td>
                    </tr>
                    <tr className="border-b border-border/40">
                      <td className="py-1 font-mono text-yellow">3.5 – 5.0</td>
                      <td className="py-1">Loose</td>
                      <td className="py-1 text-sub">Same direction, similar momentum, geometry diverges in 2–3 bars.</td>
                    </tr>
                    <tr>
                      <td className="py-1 font-mono text-red">5.0+</td>
                      <td className="py-1">Reaching</td>
                      <td className="py-1 text-sub">DTW had to warp aggressively. Treat the match skeptically.</td>
                    </tr>
                  </tbody>
                </table>
              </section>

              {/* Section 5 */}
              <section>
                <h4 className="text-text font-semibold mb-1.5 text-base">5. Limitations</h4>
                <ol className="list-decimal pl-5 space-y-1.5">
                  <li>
                    <span className="font-semibold text-text">No absolute magnitude.</span> Each
                    chart is normalized to [0, 1] before DTW. A 0.5R intraday range and a 5R
                    range that share the same shape will score identically.
                  </li>
                  <li>
                    <span className="font-semibold text-text">No volume or volatility regime.</span>{' '}
                    Two days with identical open shapes but very different ATRs or volume
                    profiles look the same to DTW.
                  </li>
                  <li>
                    <span className="font-semibold text-text">No drawn structure.</span> Trendlines,
                    S/R levels, prior-day high/low, and gap fills are invisible. We only see
                    OHLC + EMA20.
                  </li>
                  <li>
                    <span className="font-semibold text-text">No time-of-day.</span> A six-bar
                    window starting at 9:30 looks identical to the matcher as one starting at
                    14:00. For our analogs corpus we always use the first 6 bars (9:30–10:00 ET),
                    so this is consistent in practice — but the matcher itself doesn&apos;t know.
                  </li>
                  <li>
                    <span className="font-semibold text-text">Warp can mask differences.</span>{' '}
                    DTW <em>will</em> find some alignment, even when the shapes differ. A
                    weakly-similar pair returns a non-zero score, not a flag of &quot;these
                    aren&apos;t alike&quot;. The score is a continuous similarity measure, not a
                    binary classification.
                  </li>
                  <li>
                    <span className="font-semibold text-text">Sample size.</span> The current
                    corpus is 43 mornings (one per unique date×ticker in our 120-day strong-trend
                    trade-intake). Many setup variations are under-represented; expanding the
                    corpus to every Databento-cached day would help. Statistical significance of
                    any individual match is low.
                  </li>
                  <li>
                    <span className="font-semibold text-text">Same-corpus bias.</span> Every
                    candidate match was already pre-selected as a &quot;trend-from-open
                    continuation&quot; day. The matcher cannot return a chop day or a reversal day
                    because none are in the corpus.
                  </li>
                  <li>
                    <span className="font-semibold text-text">Equal channel weights.</span> We
                    treat O, H, L, C, EMA equally. If the close turns out to be more predictive
                    of next-day behavior than the high or low, the matcher doesn&apos;t know — we
                    haven&apos;t tuned weights against any outcome label. Could be improved with
                    Soft-DTW (
                    <a className="text-teal hover:underline" target="_blank" rel="noopener"
                       href="https://arxiv.org/abs/1703.01541">Cuturi &amp; Blondel, 2017</a>
                    ) plus a learned weighter.
                  </li>
                  <li>
                    <span className="font-semibold text-text">Six bars is short.</span> Only the
                    first 30 minutes of a 5-minute session. Mid-day and afternoon setups, the
                    bulk of intraday opportunity, are not what this matcher captures.
                  </li>
                </ol>
              </section>

              {/* Section 6 */}
              <section>
                <h4 className="text-text font-semibold mb-1.5 text-base">6. References</h4>
                <ul className="list-none pl-0 space-y-1 text-xs text-text/80">
                  <li>
                    Sakoe, H., &amp; Chiba, S. (1978).{' '}
                    <em>Dynamic programming algorithm optimization for spoken word recognition</em>.
                    IEEE Transactions on Acoustics, Speech, and Signal Processing, 26(1), 43–49.{' '}
                    <a className="text-teal hover:underline" target="_blank" rel="noopener"
                       href="https://doi.org/10.1109/TASSP.1978.1163055">DOI</a>
                  </li>
                  <li>
                    Berndt, D. J., &amp; Clifford, J. (1994).{' '}
                    <em>Using dynamic time warping to find patterns in time series</em>.
                    KDD Workshop, 10(16), 359–370.{' '}
                    <a className="text-teal hover:underline" target="_blank" rel="noopener"
                       href="https://www.aaai.org/Papers/Workshops/1994/WS-94-03/WS94-03-031.pdf">PDF</a>
                  </li>
                  <li>
                    Keogh, E., &amp; Ratanamahatana, C. A. (2005).{' '}
                    <em>Exact indexing of dynamic time warping</em>.
                    Knowledge and Information Systems, 7(3), 358–386.{' '}
                    <a className="text-teal hover:underline" target="_blank" rel="noopener"
                       href="https://link.springer.com/article/10.1007/s10115-004-0154-9">DOI</a>
                  </li>
                  <li>
                    Shokoohi-Yekta, M., Hu, B., Jin, H., Wang, J., &amp; Keogh, E. (2017).{' '}
                    <em>Generalizing DTW to the multi-dimensional case requires an adaptive approach</em>.
                    Data Mining and Knowledge Discovery, 31(1), 1–31.{' '}
                    <a className="text-teal hover:underline" target="_blank" rel="noopener"
                       href="https://link.springer.com/article/10.1007/s10618-016-0455-0">DOI</a>
                  </li>
                  <li>
                    Cuturi, M., &amp; Blondel, M. (2017). <em>Soft-DTW: a Differentiable Loss
                    Function for Time-Series</em>. ICML 2017.{' '}
                    <a className="text-teal hover:underline" target="_blank" rel="noopener"
                       href="https://arxiv.org/abs/1703.01541">arXiv</a>
                  </li>
                  <li>
                    Müller, M. (2007). <em>Information Retrieval for Music and Motion</em>,
                    Chapter 4: Dynamic Time Warping. Springer.{' '}
                    <a className="text-teal hover:underline" target="_blank" rel="noopener"
                       href="https://link.springer.com/chapter/10.1007/978-3-540-74048-3_4">DOI</a>
                  </li>
                  <li>
                    Brooks, A. (2012). <em>Trading Price Action Trends · Trading Ranges · Reversals · Reading Price Charts Bar by Bar</em>. Wiley.
                  </li>
                  <li>
                    Meert, W., et al.{' '}
                    <em>dtaidistance</em>: time-series distances in Python.{' '}
                    <a className="text-teal hover:underline" target="_blank" rel="noopener"
                       href="https://github.com/wannesm/dtaidistance">github.com/wannesm/dtaidistance</a>
                  </li>
                </ul>
              </section>

            </div>
          </details>

          <footer className="pt-4 mt-4 border-t border-border text-xs text-sub">
            Corpus built {corpus && new Date(corpus.built_at).toLocaleString()} ·{' '}
            {corpus?.entries.length} mornings · trend-from-open trade-intake (120-day causal SPBL).
          </footer>
        </article>
      )}
    </div>
  )
}
