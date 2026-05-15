"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { type FeaturedSetup } from "@/components/landing/HeroSetupTape"
import { ParticleHero } from "@/components/landing/ParticleHero"
import { fetchTopSetupsOfWeek } from "@/components/setups/liveCandidateAdapter"

interface Candidate {
  id: number
  symbol: string
  session_date: string
  pattern: string
  direction: "long" | "short"
  fire_ts: number
  consecutive_count: number
  strong_count: number
  score: number
  model_score: number | null
  model_target: string | null
  model_version: string | null
}

/**
 * Home page for aiedge.trade. Three sections:
 *
 *   1. ParticleHero — a GPU-simulated particle reel that plays the
 *      top model-scored setups of the week, bar by bar. Falls back to
 *      HeroSetupTape without WebGL2 or with reduced-motion.
 *
 *   2. Recent high-conviction picks — pulled live from
 *      /api/scanner/candidates. Shows the top model-scored setups from
 *      the last 7 trading days. Doubles as the trader's "what should I
 *      look at right now" landing strip.
 *
 *   3. How it works — three columns explaining the pipeline at a high
 *      level. Functional links into /scanner, /chart, /setups.
 */
export function HomePage() {
  // Hero now cycles the top model-scored setups of the last 7 days
  // (bar-by-bar). Falls back to the hand-crafted SETUPS reel inside
  // HeroSetupTape if the fetch returns nothing — first-paint never
  // shows an empty hero.
  const [topSetups, setTopSetups] = useState<FeaturedSetup[] | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchTopSetupsOfWeek({ limit: 6, daysBack: 7, minModelScore: 0.5 })
      .then((s) => {
        if (cancelled) return
        setTopSetups(s)
      })
      .catch(() => {
        if (cancelled) return
        setTopSetups([])
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <main className="bg-bg">
      <ParticleHero setups={topSetups ?? undefined} />
      <RecentPicks />
      <HowItWorks />
    </main>
  )
}

/* ---------- Recent high-conviction picks ---------------------------- */

function RecentPicks() {
  const [picks, setPicks] = useState<Candidate[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const ac = new AbortController()
    // 7-day rolling window. Server orders by (session_date desc,
    // model_score desc) by default, so we can grab a generous limit
    // and slice locally.
    const since = (() => {
      const d = new Date()
      d.setUTCDate(d.getUTCDate() - 7)
      return d.toISOString().slice(0, 10)
    })()
    const qs = new URLSearchParams({ since, limit: "100", pattern: "tfo" })
    fetch(`/api/scanner/candidates?${qs}`, { signal: ac.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { candidates: Candidate[] }) => {
        // Top-10% practical threshold: the production model's score
        // distribution peaks at ~0.78 and the p90 cutoff sits at 0.67.
        // 0.67 → ~63% win rate against is_good (MFE ≥ 1.5×MAE).
        const top = (d.candidates ?? [])
          .filter((c) => c.model_score != null && c.model_score >= 0.67)
          .sort((a, b) => (b.model_score ?? 0) - (a.model_score ?? 0))
          .slice(0, 5)
        setPicks(top)
      })
      .catch((e: unknown) => {
        if (ac.signal.aborted) return
        setError(e instanceof Error ? e.message : String(e))
      })
    return () => ac.abort()
  }, [])

  return (
    <section className="border-b border-border bg-bg">
      <div className="mx-auto max-w-[1400px] px-4 sm:px-6 lg:px-10 py-8 sm:py-10">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <h2 className="text-base sm:text-lg font-semibold tracking-tight text-text">
              Recent high-conviction picks
            </h2>
            <p className="mt-1 text-xs text-sub">
              Top model-scored TFO setups from the last 7 trading days. Click any to open the chart.
            </p>
          </div>
          <Link
            href="/scanner"
            className="text-xs font-semibold text-teal hover:underline"
          >
            All setups →
          </Link>
        </div>

        {error && (
          <div className="rounded-md border border-red/40 bg-red/10 px-3 py-2 text-xs text-red">
            {error}
          </div>
        )}
        {!error && picks === null && (
          <div className="text-xs text-sub">Loading…</div>
        )}
        {!error && picks !== null && picks.length === 0 && (
          <div className="rounded-md border border-border bg-surface px-3 py-6 text-center text-xs text-sub">
            No high-conviction picks in the last 7 days. Browse all setups on{" "}
            <Link href="/scanner" className="text-teal hover:underline">/scanner</Link>.
          </div>
        )}
        {!error && picks !== null && picks.length > 0 && (
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
            {picks.map((c) => {
              const href = `/setups?ticker=${encodeURIComponent(c.symbol)}&t=${c.fire_ts}&pattern=${c.pattern}&direction=${c.direction}`
              const pct = c.model_score == null ? null : Math.round(c.model_score * 100)
              const dirColor = c.direction === "long" ? "text-teal" : "text-red"
              return (
                <li key={c.id}>
                  <Link
                    href={href}
                    className="block rounded-md border border-border bg-surface px-3 py-3 transition-colors hover:bg-surface-hover focus-visible:bg-surface-hover focus-visible:outline-none"
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-mono text-sm font-semibold text-text">{c.symbol}</span>
                      <span className={`text-[10px] font-semibold uppercase tracking-wide ${dirColor}`}>
                        {c.direction}
                      </span>
                    </div>
                    <div className="mt-1 flex items-baseline justify-between gap-2 font-mono text-[11px] tabular-nums text-sub">
                      <span>{c.session_date}</span>
                      {pct != null && (
                        <span className={pct >= 65 ? "font-semibold text-teal" : "text-text"}>
                          {pct}%
                        </span>
                      )}
                    </div>
                    <div className="mt-1 font-mono text-[10px] tabular-nums text-sub">
                      {c.consecutive_count}× {c.direction === "long" ? "bull" : "bear"} · {c.strong_count} Brooks-strong
                    </div>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </section>
  )
}

/* ---------- How it works ---------------------------------------------- */

function HowItWorks() {
  return (
    <section className="bg-bg">
      <div className="mx-auto max-w-[1400px] px-4 sm:px-6 lg:px-10 py-10 sm:py-12">
        <h2 className="text-base sm:text-lg font-semibold tracking-tight text-text">
          How it works
        </h2>
        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <FeatureCard
            title="Live TFO detection"
            href="/scanner"
            body={
              <>
                A Trend-From-the-Open setup fires when the session low or high prints in the first 4 RTH 5-min bars, then 3+ consecutive in-direction closes follow with at least 2 Brooks-strong. The detector runs live on Fly and writes every fire to Supabase the moment the bar closes.
              </>
            }
            cta="Open the scanner →"
          />
          <FeatureCard
            title="ML-rated probability"
            href="/setups"
            body={
              <>
                Every fire is scored by a calibrated V1 logistic regression on bar-level features. The score is P(setup pays ≥ 1% favorably in the next 2 hours), AUC ~0.65 on 289 cross-validated examples. High-conviction picks (top decile) historically run ~62% win rate.
              </>
            }
            cta="See the animation →"
          />
          <FeatureCard
            title="Click-through analysis"
            href="/chart"
            body={
              <>
                Every scanner row drops you onto a deep-link chart at the fire bar. Gold candle = fire, purple = Brooks-strong confirming bars, cyan dotted line = LOD/HOD anchor. The same chart language across /setups and /symbol — no mental translation.
              </>
            }
            cta="Open a chart →"
          />
        </div>
      </div>
    </section>
  )
}

function FeatureCard({
  title,
  body,
  href,
  cta,
}: {
  title: string
  body: React.ReactNode
  href: string
  cta: string
}) {
  return (
    <div className="rounded-md border border-border bg-surface p-4 sm:p-5">
      <h3 className="text-sm font-semibold tracking-tight text-text">{title}</h3>
      <p className="mt-2 text-xs leading-relaxed text-sub">{body}</p>
      <Link
        href={href}
        className="mt-3 inline-block text-xs font-semibold text-teal hover:underline"
      >
        {cta}
      </Link>
    </div>
  )
}
