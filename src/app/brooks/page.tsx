'use client'

import { useEffect, useMemo, useState } from 'react'

type ManifestMatch = {
  slug: string
  trade_id: string
  ticker: string
  trading_date: string
  direction: 'long' | 'short'
  entry_pattern: string
  outcome: string | null
  exit_r: number | null
  synced_at: string
}

type Pick = {
  rank: number
  dtw: number
  flipped: boolean
  vol_ratio: number
  length_ratio: number
  figure_number: string
  book_title: string
  image_path: string
  image_filename: string
  narration: string
  passages: string[]
  full_narration?: string
}

type MatchData = {
  trade_id: string
  ticker: string
  trading_date: string
  direction: 'long' | 'short'
  entry_pattern: string
  opening_setup_label: string
  entry_family: string
  fill_time: string
  exit_time: string | null
  entry_price: number
  stop_price: number
  target_2r: number
  outcome: string | null
  exit_r: number
  max_favorable_r: number
  eod_r: number
  trade_chart: string
  picks: Pick[]
  synced_at: string
}

function formatR(r: number | null | undefined): string {
  if (r === null || r === undefined) return '—'
  const sign = r >= 0 ? '+' : ''
  return `${sign}${r.toFixed(1)}R`
}

function rClass(r: number | null | undefined): string {
  if (r === null || r === undefined) return 'text-sub'
  return r > 0 ? 'text-teal' : r < 0 ? 'text-red' : 'text-sub'
}

function dtwStars(dtw: number): string {
  if (dtw < 5.0) return '●●●●●'
  if (dtw < 5.5) return '●●●●○'
  if (dtw < 6.0) return '●●●○○'
  if (dtw < 6.5) return '●●○○○'
  return '●○○○○'
}

export default function BrooksPage() {
  const [manifest, setManifest] = useState<{ matches: ManifestMatch[] } | null>(null)
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null)
  const [matchData, setMatchData] = useState<MatchData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/brooks-tour/manifest.json', { cache: 'no-store' })
      .then((r) => {
        if (!r.ok) throw new Error(`manifest HTTP ${r.status}`)
        return r.json()
      })
      .then((m: { matches: ManifestMatch[] }) => {
        setManifest(m)
        if (m.matches.length && !selectedSlug) {
          // Default: most recent
          const sorted = [...m.matches].sort((a, b) => b.synced_at.localeCompare(a.synced_at))
          setSelectedSlug(sorted[0].slug)
        }
      })
      .catch((e) => setError(e.message))
  }, [selectedSlug])

  useEffect(() => {
    if (!selectedSlug) return
    setMatchData(null)
    fetch(`/brooks-tour/${selectedSlug}/data.json`, { cache: 'no-store' })
      .then((r) => {
        if (!r.ok) throw new Error(`data HTTP ${r.status}`)
        return r.json()
      })
      .then(setMatchData)
      .catch((e) => setError(e.message))
  }, [selectedSlug])

  const sortedMatches = useMemo(() => {
    if (!manifest) return []
    return [...manifest.matches].sort((a, b) => b.synced_at.localeCompare(a.synced_at))
  }, [manifest])

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <div className="mb-4">
        <h1 className="text-xl font-semibold text-text">Brooks Tour</h1>
        <p className="text-sm text-sub">
          Trade-by-trade visual matches against the Brooks book corpus, with the most-relevant passages
          quoted. Hybrid DTW (5-channel skeleton + 10-channel Brooks features) with vertical-flip search.
        </p>
      </div>

      {error && (
        <div className="mb-4 rounded border border-red/30 bg-red/10 px-3 py-2 text-sm text-red">
          Error: {error}
        </div>
      )}

      {manifest && (
        <div className="mb-6 flex flex-wrap gap-2">
          {sortedMatches.map((m) => {
            const active = m.slug === selectedSlug
            return (
              <button
                key={m.slug}
                onClick={() => setSelectedSlug(m.slug)}
                className={`text-xs rounded px-2 py-1 border transition ${
                  active
                    ? 'bg-teal/20 border-teal text-teal'
                    : 'border-border text-sub hover:border-sub hover:text-text'
                }`}
              >
                <span className="font-semibold text-text">{m.ticker}</span>{' '}
                <span className="text-sub">
                  {m.direction.toUpperCase()} · {m.trading_date}
                </span>{' '}
                <span className={rClass(m.exit_r)}>{formatR(m.exit_r)}</span>
              </button>
            )
          })}
        </div>
      )}

      {matchData && (
        <article className="space-y-6">
          <header>
            <h2 className="text-lg font-semibold text-text">
              {matchData.ticker} {matchData.direction.toUpperCase()} · {matchData.trading_date}
            </h2>
            <p className="text-sm text-sub mt-1">
              {matchData.entry_pattern} · {matchData.opening_setup_label}
            </p>
            <p className="text-sm text-text mt-2">
              fill {matchData.fill_time} ET · exit {matchData.exit_time ?? '?'} ET · entry $
              {matchData.entry_price.toFixed(2)} · stop ${matchData.stop_price.toFixed(2)} · +2R $
              {matchData.target_2r.toFixed(2)}
            </p>
            <p className="text-sm mt-1">
              <span className="text-text">
                <span className="font-semibold">{matchData.outcome}</span> · realized{' '}
              </span>
              <span className={rClass(matchData.exit_r)}>{formatR(matchData.exit_r)}</span>
              <span className="text-text"> · MFE +{matchData.max_favorable_r.toFixed(1)}R · eod </span>
              <span className={rClass(matchData.eod_r)}>{formatR(matchData.eod_r)}</span>
            </p>
          </header>

          <img
            src={`/brooks-tour/${selectedSlug}/${matchData.trade_chart}`}
            alt="trade chart"
            className="w-full h-auto rounded border border-border"
          />

          <div>
            <h3 className="text-base font-semibold text-text mb-3">Top 5 Brooks matches</h3>
            <div className="space-y-8">
              {matchData.picks.map((p) => (
                <section key={p.rank}>
                  <header className="mb-2">
                    <h4 className="text-base font-semibold text-text">
                      #{p.rank} · Fig {p.figure_number}
                      {p.flipped && (
                        <span className="ml-2 text-yellow text-xs font-semibold">[FLIP]</span>
                      )}
                    </h4>
                    <p className="text-xs text-sub mt-0.5">
                      {p.book_title} · DTW {p.dtw.toFixed(3)} · {dtwStars(p.dtw)}
                      {Math.abs(Math.log(p.vol_ratio || 1)) > 0.4 && (
                        <span className="ml-1">· vol×{p.vol_ratio.toFixed(2)}</span>
                      )}
                    </p>
                  </header>
                  <img
                    src={`/brooks-tour/${selectedSlug}/${p.image_filename}`}
                    alt={`Brooks figure ${p.figure_number}`}
                    className="w-full h-auto rounded border border-border"
                  />
                  {p.passages.length > 0 ? (
                    <div className="mt-3 space-y-2">
                      {p.passages.map((s, i) => (
                        <p key={i} className="text-sm text-text/80 pl-3 border-l-2 border-border">
                          {s}
                        </p>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-3 text-sm text-sub italic">
                      (no keyword-rich passages found)
                    </p>
                  )}
                  {p.full_narration && p.full_narration.length > 0 && (
                    <details className="mt-3 group">
                      <summary className="cursor-pointer text-xs text-sub hover:text-text select-none list-none flex items-center gap-1">
                        <span className="inline-block transition-transform group-open:rotate-90">
                          ▸
                        </span>
                        <span>
                          Full passage{' '}
                          <span className="text-sub/70">
                            ({p.full_narration.length.toLocaleString()} chars)
                          </span>
                        </span>
                      </summary>
                      <div className="mt-2 pl-3 border-l-2 border-border text-sm text-text/80 whitespace-pre-wrap leading-relaxed">
                        {p.full_narration}
                      </div>
                    </details>
                  )}
                </section>
              ))}
            </div>
          </div>

          <footer className="pt-4 border-t border-border text-xs text-sub">
            Synced {new Date(matchData.synced_at).toLocaleString()}. Hybrid DTW (skeleton + Brooks
            features) with vertical-flip search and length penalty. [FLIP] = match was against a
            vertically-mirrored corpus figure.
          </footer>
        </article>
      )}

      {!matchData && manifest && (
        <p className="text-sm text-sub">Loading match…</p>
      )}
    </div>
  )
}
