'use client'

/** CorpusValidation — leave-one-out cross-validation of the analog
 *  matcher across all 2,723 corpus sessions. For each session, the
 *  matcher's top-K majority direction prediction was compared against
 *  the session's actual EOD direction. The data here answers the
 *  question every quant-fund reviewer asks: "does this thing actually
 *  predict, or is it just shape-similar noise?"
 *
 *  Stats are computed offline by scripts/validate_corpus_predictions.py
 *  and shipped as public/analogs/corpus_validation.json. */

import { useEffect, useState } from 'react'

interface SliceStats {
  n: number
  graded: number
  correct: number
  hit_rate: number | null
  p_value: number | null
}

interface ValidationPayload {
  generatedAt: string
  topK: number
  totalObservations: number
  overall: SliceStats
  byTier: Record<string, SliceStats>
  byPredictedDirection: Record<string, SliceStats>
  byTicker: Record<string, SliceStats>
  byMonth: Record<string, SliceStats>
}

function pctStr(p: number | null): string {
  if (p === null) return '—'
  return `${(p * 100).toFixed(1)}%`
}

function rateClass(r: number | null): string {
  if (r === null) return 'text-sub'
  if (r >= 0.55) return 'text-teal'
  if (r >= 0.52) return 'text-yellow'
  if (r >= 0.48) return 'text-sub'
  return 'text-red'
}

function pClass(p: number | null): string {
  if (p === null) return 'text-sub'
  if (p < 0.01) return 'text-teal'
  if (p < 0.05) return 'text-yellow'
  return 'text-sub'
}

function pStr(p: number | null): string {
  if (p === null) return 'n<20'
  if (p < 0.0001) return '<0.0001'
  return p.toFixed(4)
}

const TIER_ORDER = ['tight', 'strong', 'solid', 'loose', 'reaching']
const TIER_LABEL: Record<string, string> = {
  tight: 'Tight twin (DTW < 1.5)',
  strong: 'Strong (DTW 1.5–2.5)',
  solid: 'Solid (DTW 2.5–3.5)',
  loose: 'Loose (DTW 3.5–5.0)',
  reaching: 'Reaching (DTW 5.0+)',
}

export function CorpusValidation() {
  const [data, setData] = useState<ValidationPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/analogs/corpus_validation.json', { cache: 'no-store' })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((d: ValidationPayload) => { setData(d); setLoading(false) })
      .catch((e) => { setError(e.message); setLoading(false) })
  }, [])

  if (loading) {
    return <div className="py-6 text-center text-sm text-sub">Loading historical validation…</div>
  }
  if (error || !data) {
    return (
      <div className="rounded border border-red/30 bg-red/10 px-3 py-2 text-sm text-red">
        Couldn&apos;t load validation data{error ? `: ${error}` : ''}.
      </div>
    )
  }

  // Top tickers — sort by graded count desc, take all
  const tickerEntries = Object.entries(data.byTicker)
    .sort(([, a], [, b]) => b.graded - a.graded)
  const monthEntries = Object.entries(data.byMonth).sort(([a], [b]) => a.localeCompare(b))

  return (
    <div className="border border-border rounded p-4 mb-6 bg-surface">
      <header className="mb-3">
        <h3 className="text-sm font-semibold text-text">
          Historical corpus validation — leave-one-out
        </h3>
        <p className="text-[11px] text-sub mt-1 leading-relaxed">
          For each of {data.totalObservations.toLocaleString()} corpus sessions, predicted direction =
          DTW-weighted majority across top-{data.topK} matches (excluding self). Actual = sign of
          EOD ATR. Tells you the matcher&apos;s true predictive edge before live data lands —
          and where that edge lives.
        </p>
      </header>

      {/* Headline */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
        <Tile label="Sessions" value={data.totalObservations.toLocaleString()}
              sub={`${data.overall.graded.toLocaleString()} graded`} />
        <Tile label="Hit rate"
              value={pctStr(data.overall.hit_rate)}
              valueClass={rateClass(data.overall.hit_rate)}
              sub={data.overall.graded > 0
                ? `${data.overall.correct.toLocaleString()} correct`
                : ''} />
        <Tile label="vs 50/50 p-value"
              value={pStr(data.overall.p_value)}
              valueClass={pClass(data.overall.p_value)}
              sub={data.overall.p_value !== null && data.overall.p_value < 0.05
                ? 'edge is real'
                : 'noise'} />
        <Tile label="Edge over coinflip"
              value={data.overall.hit_rate !== null
                ? `${((data.overall.hit_rate - 0.5) * 100).toFixed(1)}pp`
                : '—'}
              sub="hit rate − 50%" />
      </div>

      {/* By DTW tier */}
      <section className="mb-4">
        <h4 className="text-[11px] uppercase tracking-wider text-sub mb-2">
          By DTW tier — does match closeness predict reliability?
        </h4>
        <div className="border border-border rounded overflow-hidden">
          <table className="w-full text-[11px]">
            <thead className="bg-bg/50 text-sub">
              <tr>
                <th className="text-left px-2 py-1 font-normal">Tier</th>
                <th className="text-right px-2 py-1 font-normal">N graded</th>
                <th className="text-right px-2 py-1 font-normal">Correct</th>
                <th className="text-right px-2 py-1 font-normal">Hit rate</th>
                <th className="text-right px-2 py-1 font-normal">p-value</th>
              </tr>
            </thead>
            <tbody>
              {TIER_ORDER.filter((t) => t in data.byTier).map((t) => {
                const s = data.byTier[t]
                return (
                  <tr key={t} className="border-t border-border/40">
                    <td className="px-2 py-1 text-text">{TIER_LABEL[t]}</td>
                    <td className="px-2 py-1 text-right tabular-nums text-sub">{s.graded.toLocaleString()}</td>
                    <td className="px-2 py-1 text-right tabular-nums text-sub">{s.correct.toLocaleString()}</td>
                    <td className={`px-2 py-1 text-right tabular-nums font-semibold ${rateClass(s.hit_rate)}`}>
                      {pctStr(s.hit_rate)}
                    </td>
                    <td className={`px-2 py-1 text-right tabular-nums ${pClass(s.p_value)}`}>
                      {pStr(s.p_value)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* By predicted direction */}
      <section className="mb-4">
        <h4 className="text-[11px] uppercase tracking-wider text-sub mb-2">
          By predicted direction — is the matcher better at calling ups or downs?
        </h4>
        <div className="grid grid-cols-2 gap-2">
          {(['up', 'down'] as const).map((d) => {
            const s = data.byPredictedDirection[d]
            if (!s) return null
            return (
              <div key={d} className="border border-border rounded p-2 bg-bg/40">
                <div className="flex items-baseline justify-between mb-1">
                  <span className={`font-semibold ${d === 'up' ? 'text-teal' : 'text-red'}`}>
                    {d === 'up' ? '↑ predicted up' : '↓ predicted down'}
                  </span>
                  <span className="text-[10px] text-sub">n={s.graded.toLocaleString()}</span>
                </div>
                <div className="flex items-baseline gap-3">
                  <span className={`text-lg font-semibold tabular-nums ${rateClass(s.hit_rate)}`}>
                    {pctStr(s.hit_rate)}
                  </span>
                  <span className={`text-[11px] tabular-nums ${pClass(s.p_value)}`}>
                    p={pStr(s.p_value)}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* By ticker — the headline finding */}
      <section className="mb-4">
        <h4 className="text-[11px] uppercase tracking-wider text-sub mb-2">
          By ticker — where the edge actually lives
        </h4>
        <div className="border border-border rounded overflow-hidden">
          <table className="w-full text-[11px]">
            <thead className="bg-bg/50 text-sub">
              <tr>
                <th className="text-left px-2 py-1 font-normal">Ticker</th>
                <th className="text-right px-2 py-1 font-normal">N</th>
                <th className="text-right px-2 py-1 font-normal">Hit rate</th>
                <th className="text-right px-2 py-1 font-normal">p-value</th>
                <th className="text-left px-2 py-1 font-normal">Verdict</th>
              </tr>
            </thead>
            <tbody>
              {tickerEntries.map(([ticker, s]) => {
                const verdict = s.p_value === null ? '—'
                  : s.p_value < 0.01 ? 'real edge'
                  : s.p_value < 0.05 ? 'borderline'
                  : 'noise'
                const verdictClass = s.p_value === null ? 'text-sub'
                  : s.p_value < 0.01 ? 'text-teal font-semibold'
                  : s.p_value < 0.05 ? 'text-yellow'
                  : 'text-sub'
                return (
                  <tr key={ticker} className="border-t border-border/40">
                    <td className="px-2 py-1 font-mono text-text">{ticker}</td>
                    <td className="px-2 py-1 text-right tabular-nums text-sub">{s.graded}</td>
                    <td className={`px-2 py-1 text-right tabular-nums font-semibold ${rateClass(s.hit_rate)}`}>
                      {pctStr(s.hit_rate)}
                    </td>
                    <td className={`px-2 py-1 text-right tabular-nums ${pClass(s.p_value)}`}>
                      {pStr(s.p_value)}
                    </td>
                    <td className={`px-2 py-1 ${verdictClass}`}>{verdict}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* By month — drift over time */}
      <section>
        <h4 className="text-[11px] uppercase tracking-wider text-sub mb-2">
          By month — regime stability
        </h4>
        <div className="border border-border rounded overflow-hidden">
          <table className="w-full text-[11px]">
            <thead className="bg-bg/50 text-sub">
              <tr>
                <th className="text-left px-2 py-1 font-normal">Month</th>
                <th className="text-right px-2 py-1 font-normal">N</th>
                <th className="text-right px-2 py-1 font-normal">Hit rate</th>
                <th className="text-right px-2 py-1 font-normal">p-value</th>
              </tr>
            </thead>
            <tbody>
              {monthEntries.map(([month, s]) => (
                <tr key={month} className="border-t border-border/40">
                  <td className="px-2 py-1 font-mono text-text">{month}</td>
                  <td className="px-2 py-1 text-right tabular-nums text-sub">{s.graded}</td>
                  <td className={`px-2 py-1 text-right tabular-nums font-semibold ${rateClass(s.hit_rate)}`}>
                    {pctStr(s.hit_rate)}
                  </td>
                  <td className={`px-2 py-1 text-right tabular-nums ${pClass(s.p_value)}`}>
                    {pStr(s.p_value)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <p className="text-[10px] text-sub mt-3">
        Generated {new Date(data.generatedAt).toLocaleString()} ·
        run <code className="text-sub/80">scripts/validate_corpus_predictions.py</code> to refresh.
      </p>
    </div>
  )
}

function Tile({ label, value, sub, valueClass }: {
  label: string; value: string; sub?: string; valueClass?: string
}) {
  return (
    <div className="border border-border rounded p-3 bg-bg/40">
      <div className="text-[10px] uppercase tracking-wider text-sub mb-1">{label}</div>
      <div className={`text-lg font-semibold tabular-nums ${valueClass ?? 'text-text'}`}>
        {value}
      </div>
      {sub && <div className="text-[10px] text-sub mt-0.5">{sub}</div>}
    </div>
  )
}
