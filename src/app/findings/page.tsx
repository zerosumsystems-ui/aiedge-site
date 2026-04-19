'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { VaultNote, VaultPayload } from '@/lib/types'

type Run = {
  incr: number
  date: string
  headline: string
  recommendation: string
  noteSlug: string | null
  figure: string
  figureCaption: string
}

const RUNS: Run[] = [
  {
    incr: 18,
    date: '2026-04-19',
    headline: '`majority_trend_bars` is gated by the 40 % majority floor, not the body-ratio threshold',
    recommendation:
      'Lower MAJORITY_TREND_BAR_FLOOR from 0.40 → 0.25. At production, classifier fires in 1 of 800 sessions and that one was wrong. At floor 0.25, fires in 78 of 800 with ~90 % directional accuracy.',
    noteSlug: 'Scanner/methodology/trend-contributor-findings-2026-04-19-incr18-majority-floor',
    figure: '/findings/figures/majority_trend_bars_floor_sweep.png',
    figureCaption:
      'Per-floor session fire rate (left) and directional accuracy (right). Production floor = 0.40 (red). Sample: 800 RTH sessions across 387 symbols.',
  },
  {
    incr: 17,
    date: '2026-04-19',
    headline: 'Synthetic-bank caveat CONFIRMED on real data; weighting recommendations REVERSED',
    recommendation:
      'Equal weighting stays. Real-data validation overturns the incr-16 down-weight recommendation: synthetic r = +0.997 collapses to +0.404 on real ES.c.0. Mean uniqueness 5× higher on real than synthetic. trend_state now flows into the dashboard payload (additive).',
    noteSlug: 'Scanner/methodology/trend-contributor-findings-2026-04-19-incr17-followups',
    figure: '/findings/figures/contributor_agreement_real.png',
    figureCaption:
      'Real-data 12×12 Pearson heatmap + side-by-side uniqueness vs the synthetic-fixture bank.',
  },
  {
    incr: 16,
    date: '2026-04-19',
    headline: 'Synthetic-fixture redundancy study — flagged, then mostly overturned by incr 17',
    recommendation:
      'Pairwise Pearson r over 12 contributors on the 5-fixture synthetic bank. Flagged near-duplicate pairs (r ≈ 1) but warned several were sample-bank artifacts. Most flagged pairs collapsed on real data.',
    noteSlug: 'Scanner/methodology/trend-contributor-findings-2026-04-19-incr16-redundancy',
    figure: '/findings/figures/contributor_agreement.png',
    figureCaption:
      'Synthetic-bank 12×12 Pearson heatmap. Several near-perfect correlations turned out to be polarized-fixture artifacts.',
  },
  {
    incr: 15,
    date: '2026-04-19',
    headline: 'Capstone: htf_alignment wired as 12th contributor; inventory complete',
    recommendation:
      '12 of 12 direction-voting contributors live. 602 tests / 905 subtests green. Regime amplifier family formally excluded.',
    noteSlug: 'Scanner/methodology/trend-contributor-findings-2026-04-19-incr15-capstone',
    figure: '/findings/figures/contributor_matrix.png',
    figureCaption:
      'The 12 × 5 control panel — each row a canonical market regime, each column one classifier.',
  },
]

const SITE_LINK = 'https://github.com/zerosumsystems-ui/iPhone-/tree/main/trend-classification'

export default function FindingsPage() {
  const [notes, setNotes] = useState<VaultNote[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/vault')
      .then((r) => r.json())
      .then((data: VaultPayload) => {
        setNotes(data.notes || [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const slugSet = new Set(notes.map((n) => n.slug))
  const featured = RUNS[0]
  const history = RUNS.slice(1)

  return (
    <article className="max-w-4xl mx-auto px-4 md:px-6 py-6 md:py-8">
      <header className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-teal mb-1">
          Trend research
        </p>
        <h1 className="text-2xl md:text-3xl font-bold text-text mb-2">Findings</h1>
        <p className="text-sm text-sub leading-relaxed max-w-2xl">
          Increment-by-increment research log on the canonical TrendState aggregator and its
          12 direction-voting contributors. Each run is read-only with respect to the scanner.
          Recommendations require explicit sign-off before any production change lands.
        </p>
      </header>

      <section className="mb-10 bg-surface border border-border rounded-lg p-5 md:p-6">
        <div className="flex items-baseline gap-3 mb-3 flex-wrap">
          <span className="text-xs font-semibold uppercase tracking-wider text-teal/80">
            Most recent · incr {featured.incr}
          </span>
          <span className="text-xs text-sub">{featured.date}</span>
        </div>
        <h2 className="text-lg md:text-xl font-bold text-text mb-3 leading-snug">
          {featured.headline}
        </h2>

        <div className="bg-bg/60 border-l-2 border-teal/60 pl-4 py-3 mb-5 rounded-r">
          <p className="text-xs font-semibold uppercase tracking-wider text-sub mb-1">
            Recommendation (needs your nod)
          </p>
          <p className="text-sm text-text/90 leading-relaxed">{featured.recommendation}</p>
        </div>

        <figure className="mb-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={featured.figure}
            alt={featured.figureCaption}
            className="w-full h-auto border border-border rounded"
          />
          <figcaption className="text-xs text-sub italic mt-2 text-center">
            {featured.figureCaption}
          </figcaption>
        </figure>

        {featured.noteSlug && slugSet.has(featured.noteSlug) && (
          <Link
            href={`/knowledge/${featured.noteSlug.split('/').map(encodeURIComponent).join('/')}`}
            className="inline-flex items-center gap-1 mt-4 text-sm text-teal hover:text-teal/80 underline underline-offset-2"
          >
            Read the full note →
          </Link>
        )}
      </section>

      <section className="mb-10">
        <h2 className="text-base font-semibold text-text mb-4 pb-2 border-b border-border">
          Headline numbers (incr 18)
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Sessions analysed', value: '800' },
            { label: 'Symbols', value: '387' },
            { label: 'Bars analysed', value: '45,437' },
            { label: 'Production fire rate', value: '0.12 %' },
            { label: 'Recommended floor', value: '0.25' },
            { label: 'Fire rate at 0.25', value: '9.75 %' },
            { label: 'Up-pred accuracy', value: '92.2 %' },
            { label: 'Down-pred accuracy', value: '87.0 %' },
          ].map((kpi) => (
            <div
              key={kpi.label}
              className="bg-surface border border-border rounded p-3"
            >
              <div className="text-xs text-sub mb-1">{kpi.label}</div>
              <div className="text-xl font-bold text-text">{kpi.value}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="mb-10">
        <h2 className="text-base font-semibold text-text mb-4 pb-2 border-b border-border">
          Run history
        </h2>
        <div className="space-y-4">
          {history.map((run) => (
            <div
              key={run.incr}
              className="bg-surface border border-border rounded-lg p-4 md:p-5"
            >
              <div className="flex items-baseline gap-3 mb-2 flex-wrap">
                <span className="text-xs font-semibold uppercase tracking-wider text-teal/80">
                  incr {run.incr}
                </span>
                <span className="text-xs text-sub">{run.date}</span>
              </div>
              <h3 className="text-sm md:text-base font-semibold text-text mb-2 leading-snug">
                {run.headline}
              </h3>
              <p className="text-xs md:text-sm text-text/80 leading-relaxed mb-3">
                {run.recommendation}
              </p>
              <div className="grid md:grid-cols-2 gap-4 items-start">
                <figure>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={run.figure}
                    alt={run.figureCaption}
                    className="w-full h-auto border border-border rounded"
                  />
                  <figcaption className="text-[11px] text-sub italic mt-1.5">
                    {run.figureCaption}
                  </figcaption>
                </figure>
                <div className="text-xs text-sub">
                  {loading ? (
                    <span>Loading vault…</span>
                  ) : run.noteSlug && slugSet.has(run.noteSlug) ? (
                    <Link
                      href={`/knowledge/${run.noteSlug.split('/').map(encodeURIComponent).join('/')}`}
                      className="text-teal hover:text-teal/80 underline underline-offset-2"
                    >
                      Open the full note →
                    </Link>
                  ) : (
                    <span className="italic">Note not yet synced to the live vault.</span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-border pt-6 text-xs text-sub">
        <p>
          Findings site (phone-readable):{' '}
          <a
            href={SITE_LINK}
            className="text-teal hover:text-teal/80 underline underline-offset-2"
            target="_blank"
            rel="noopener"
          >
            github.com/zerosumsystems-ui/iPhone-/tree/main/trend-classification
          </a>
        </p>
        <p className="mt-2">
          Long-form notes live in <Link href="/knowledge" className="text-teal hover:text-teal/80 underline underline-offset-2">Knowledge Base</Link>{' '}
          under <code className="bg-bg/60 rounded px-1.5 py-0.5 text-text/80">Scanner / methodology</code>.
        </p>
      </footer>
    </article>
  )
}
