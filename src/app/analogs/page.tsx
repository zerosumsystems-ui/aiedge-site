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

          <footer className="pt-4 border-t border-border text-xs text-sub">
            Corpus built {corpus && new Date(corpus.built_at).toLocaleString()} ·{' '}
            {corpus?.entries.length} mornings · trend-from-open trade-intake (120-day causal SPBL).
            DTW = hybrid skeleton (OHLC+EMA20) + Brooks features (signal/trend/doji bars), with
            vertical-flip search. [FLIP] = match was against a vertically-mirrored past morning.
          </footer>
        </article>
      )}
    </div>
  )
}
