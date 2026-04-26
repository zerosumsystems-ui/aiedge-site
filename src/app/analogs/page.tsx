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
