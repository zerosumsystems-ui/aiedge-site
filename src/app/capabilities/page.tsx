import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Capabilities — AI Edge',
  description:
    'Central reference for the skills and capabilities the AI assistant brings to AI Edge: price action, backtesting, live data, ML, chart engineering, and repo ops.',
}

type Capability = {
  title: string
  detail: string
  /** Optional in-app route this capability is actually wired to. */
  href?: string
}

type Section = {
  id: string
  heading: string
  blurb: string
  items: Capability[]
}

const SECTIONS: Section[] = [
  {
    id: 'price-action',
    heading: 'Price action & Al Brooks',
    blurb:
      'Working knowledge of the Brooks corpus and how it maps onto live bar-by-bar action on AI Edge charts.',
    items: [
      {
        title: 'Brooks vocabulary',
        detail:
          'H1/H2/L1/L2, signal vs entry bars, breakout / breakout-pullback / failed-breakout, ii/iii, wedges, double tops/bottoms, final flags, micro double bottoms, magnets, measured moves, climaxes, channels, trading ranges, BTC vs MTR, FTC.',
      },
      {
        title: 'Trend / range diagnosis',
        detail:
          'Always-in long vs short, trend-from-the-open vs trading-range-day, tight vs broad channel, gap context, and how those frames change which setups are takeable.',
      },
      {
        title: 'Probability framing',
        detail:
          'Talking in 40/60 terms, premium vs discount entries, when to take a setup vs when to wait one more bar, when the trade is "always-in but late."',
      },
      {
        title: 'Brooks-tour DTW matching',
        detail:
          'Hybrid DTW (5-channel skeleton + 10-channel Brooks features) against the Brooks book corpus with vertical-flip search and the most-relevant passages pulled per match.',
        href: '/brooks',
      },
      {
        title: 'Wisdom reference',
        detail:
          'Hallmarks, guidelines, and principles quoted verbatim from the Brooks book corpus — each snippet tagged by kind and cited to its source book and figure.',
        href: '/wisdom',
      },
    ],
  },
  {
    id: 'backtesting',
    heading: 'Backtesting & verification',
    blurb:
      'Pulling the actual historical record before trusting an intuition. Trade-by-trade, R-multiple-based, no curve fits.',
    items: [
      {
        title: 'Setup-by-setup ledgers',
        detail:
          '5-min TFO, gap-up + FT, BGU, opening-setup labelers, and Brooks-style patterns each get their own ledger with fill time, exit time, stop, +2R target, realized R, MFE, and EOD R.',
      },
      {
        title: 'Bar-accurate fills',
        detail:
          'Stops and targets resolved against 1-min bars from the live-bars store, so the R number is what would actually have hit — not a daily approximation.',
      },
      {
        title: 'Cohort + regime slicing',
        detail:
          'Splitting trade lists by ticker, direction, opening setup label, entry family, gap %, ATR regime, day-of-week, and synced_at vintage to find where edge concentrates.',
      },
      {
        title: 'History + Analogs',
        detail:
          'Pull the closest historical analogs for a current setup, score them, and use them as a sanity check before the bar closes.',
      },
    ],
  },
  {
    id: 'live-data',
    heading: 'Live data & infra',
    blurb:
      'The Fly aggregator → /api/live-bars → /api/bars → chart pipeline. The skill is keeping it boring and dedup-clean.',
    items: [
      {
        title: 'Aggregator pipeline',
        detail:
          'Fly-hosted live-bars aggregator (Dockerfile.live-bars, fly.live-bars.toml) with deploy via GitHub Actions on push to main.',
      },
      {
        title: 'Subscribe / reconnect discipline',
        detail:
          'Dedup keys, no reconnect-loops, single-source bar truth — the invariants that the aiedge-live-data skill enforces every time the feed is touched.',
      },
      {
        title: 'Operator diagnostics',
        detail:
          'The operator endpoint and Vercel production logs (/logs) used to confirm a feed is healthy before declaring a deploy live.',
      },
      {
        title: 'Supabase + Vercel wiring',
        detail:
          'Server-only service role, .env.local.example as the single source of truth for env vars, no client-side leakage.',
      },
    ],
  },
  {
    id: 'ml',
    heading: 'ML & scoring',
    blurb:
      'Lightweight, explainable models that rate setups the moment the bar closes — not black boxes.',
    items: [
      {
        title: 'Setup probability ratings',
        detail:
          'Every scanner fire is scored at bar close so the surfaced edge is calibrated, not just "it printed."',
      },
      {
        title: 'Feature engineering for bars',
        detail:
          'Brooks-aware features (channel slope, pullback depth, prior-leg measured move, vol ratio, length ratio) feeding both the scoring models and the DTW similarity search.',
      },
      {
        title: 'Repro environment',
        detail:
          'scripts/requirements-ml.txt pinned, models reproducible from raw bars + the labeler outputs; nothing depends on a one-off notebook.',
      },
    ],
  },
  {
    id: 'chart',
    heading: 'Chart engineering',
    blurb:
      'Everything under /chart — indicators, overlays, the ƒx menu, watchlist, live-status badge, settings.',
    items: [
      {
        title: 'Indicator + overlay system',
        detail:
          'EMA / HTF overlays, SR strip, Always-in toggle, ƒx menu — wired through chart conventions captured in the aiedge-chart skill.',
      },
      {
        title: 'Mobile watchlist',
        detail:
          'Behavior tuned for the iPhone width so the 9+ nav routes and the watchlist coexist without cramming.',
      },
      {
        title: 'Smoke testing',
        detail:
          'npm run test:chart for the browser smoke test, plus curl -I on the local /chart route before publishing.',
      },
    ],
  },
  {
    id: 'finance',
    heading: 'Finance & market structure',
    blurb:
      'Enough domain background to talk through trades without translating jargon every sentence.',
    items: [
      {
        title: 'Intraday US equities',
        detail:
          'RTH session structure, opening drive vs opening reversal, lunch chop, last-hour reversion, MOC dynamics, gap classification (gap-up FT, gap-fade, micro-gap).',
      },
      {
        title: 'Risk units in R',
        detail:
          'Per-trade R, MFE, eod_r, +2R targets, stop discipline — the language the journal and review tooling already speak.',
      },
      {
        title: 'Catalyst & calendar context',
        detail:
          'Earnings, FOMC, CPI/NFP, holiday-shortened sessions and how they should change which setups are takeable.',
      },
    ],
  },
  {
    id: 'repo-ops',
    heading: 'Repo & deploy ops',
    blurb:
      'The boring part that keeps shipping safe: Go Live workflow, boundary hook, rollback.',
    items: [
      {
        title: 'Go Live workflow',
        detail:
          'Quality check → concise proof → push origin HEAD:main → poll Vercel Production until Ready → verify the live route. No "live" claim before the URL responds.',
      },
      {
        title: 'Product boundary hook',
        detail:
          '.claude/hooks/check-boundary.sh scans every push for the categories of content that don’t belong on aiedge.trade and blocks the deploy when it finds them. Surfaces, never bypasses.',
      },
      {
        title: 'Smoke / Logs / Rollback',
        detail:
          '/smoke for pre-flight, /logs for Vercel production tail + summarize, /rollback for one-shot revert of the latest production deploy.',
      },
      {
        title: 'Ideas triage',
        detail:
          'Brain-dump → triage → autonomous execution via /ideas when you drop multiple things at once.',
      },
    ],
  },
]

export default function CapabilitiesPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold text-text">Capabilities</h1>
        <p className="text-sm text-sub mt-2 leading-relaxed">
          A running index of what the AI Edge collaborator can actually do — price action,
          backtesting, live data, ML, chart engineering, finance, and repo ops. Use it as a
          central place to keep track and to ask &ldquo;what should we add?&rdquo;
        </p>
      </header>

      <nav className="mb-8 flex flex-wrap gap-2" aria-label="Capability sections">
        {SECTIONS.map((s) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            className="text-xs rounded px-2 py-1 border border-border text-sub hover:border-sub hover:text-text transition-colors"
          >
            {s.heading}
          </a>
        ))}
      </nav>

      <div className="flex flex-col gap-10">
        {SECTIONS.map((s) => (
          <section key={s.id} id={s.id} className="scroll-mt-20">
            <h2 className="text-lg font-semibold text-text">{s.heading}</h2>
            <p className="text-sm text-sub mt-1 leading-relaxed">{s.blurb}</p>
            <ul className="mt-4 flex flex-col gap-3">
              {s.items.map((item) => (
                <li
                  key={item.title}
                  className="border border-border rounded-[var(--radius)] bg-surface/40 p-4"
                >
                  <h3 className="text-sm font-semibold text-text">
                    {item.href ? (
                      <Link href={item.href} className="text-teal hover:underline">
                        {item.title} →
                      </Link>
                    ) : (
                      item.title
                    )}
                  </h3>
                  <p className="text-sm text-sub mt-1 leading-relaxed">{item.detail}</p>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <footer className="mt-12 pt-6 border-t border-border text-xs text-sub">
        Living document. Ask &ldquo;what should we add to capabilities?&rdquo; any time and the
        list gets a proposed diff.
      </footer>
    </div>
  )
}
