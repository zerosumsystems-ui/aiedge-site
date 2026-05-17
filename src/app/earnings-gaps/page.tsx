import Link from 'next/link'
import {
  fetchEarningsGapScreener,
  getDemoEarningsGapScreener,
  type EarningsGapCandidate,
  type EarningsGapDirection,
  type EarningsGapScreenerResult,
} from '@/lib/finviz'
import { GapBookPanel } from '@/components/earnings-gaps/GapBook'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Earnings Gaps | AI Edge',
  description: 'Earnings-linked gap up and gap down candidates with volume and liquidity evidence.',
}

type SearchParams = Promise<{
  demo?: string
  direction?: string
  lookback?: string
}>

const MIN_CONFIRMED_MOVE_PCT = 3
const DEFAULT_LOOKBACK_DAYS = 35
const LOOKBACK_OPTIONS = [14, 35, 60]

function parseDirection(value: string | undefined): 'all' | EarningsGapDirection {
  return value === 'up' || value === 'down' ? value : 'all'
}

function parseLookbackDays(value: string | undefined): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return DEFAULT_LOOKBACK_DAYS
  return Math.min(Math.max(Math.floor(parsed), 7), 90)
}

function filterByDirection(
  candidates: EarningsGapCandidate[],
  direction: 'all' | EarningsGapDirection,
): EarningsGapCandidate[] {
  if (direction === 'all') return candidates
  return candidates.filter((candidate) => candidate.direction === direction)
}

function formatPct(value: number | null): string {
  if (value == null) return '-'
  const sign = value > 0 ? '+' : ''
  return `${sign}${value.toFixed(1)}%`
}

function formatNumber(value: number | null): string {
  if (value == null) return '-'
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(0)}K`
  return value.toFixed(0)
}

function formatPrice(value: number | null): string {
  return value == null ? '-' : `$${value.toFixed(2)}`
}

function formatRelVol(value: number | null): string {
  return value == null ? '-' : `${value.toFixed(value >= 10 ? 0 : 1)}x`
}

function directionClass(direction: EarningsGapCandidate['direction']): string {
  if (direction === 'up') return 'text-teal'
  if (direction === 'down') return 'text-red'
  return 'text-sub'
}

function directionLabel(direction: EarningsGapCandidate['direction']): string {
  if (direction === 'up') return 'Gap up'
  if (direction === 'down') return 'Gap down'
  return 'Watch'
}

function makeEarningsHref({
  direction,
  demo,
  lookbackDays,
}: {
  direction: 'all' | EarningsGapDirection
  demo: boolean
  lookbackDays: number
}): string {
  const params = new URLSearchParams()
  if (direction !== 'all') params.set('direction', direction)
  if (demo) params.set('demo', '1')
  if (lookbackDays !== DEFAULT_LOOKBACK_DAYS) params.set('lookback', String(lookbackDays))
  const qs = params.toString()
  return qs ? `/earnings-gaps?${qs}` : '/earnings-gaps'
}

async function loadPayload(demo: boolean): Promise<{
  payload: EarningsGapScreenerResult | null
  error: string | null
}> {
  try {
    return {
      payload: demo ? getDemoEarningsGapScreener() : await fetchEarningsGapScreener(),
      error: null,
    }
  } catch (err) {
    return {
      payload: null,
      error: err instanceof Error ? err.message : 'Failed to load earnings gap radar',
    }
  }
}

export default async function EarningsGapsPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const params = await searchParams
  const demo = params.demo === '1'
  const direction = parseDirection(params.direction)
  const lookbackDays = parseLookbackDays(params.lookback)
  const { payload, error } = await loadPayload(demo)

  const candidates = filterByDirection(payload?.candidates ?? [], direction)
  const confirmedMovers = candidates.filter(
    (candidate) =>
      candidate.bucket === 'confirmed_mover' &&
      Math.abs(candidate.movePct ?? 0) >= MIN_CONFIRMED_MOVE_PCT,
  )
  const afterCloseWatch = candidates
    .filter((candidate) => candidate.bucket === 'after_close_watch')
    .slice(0, 25)

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6">
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-text">Earnings Gap Radar</h1>
          <p className="mt-1 max-w-3xl text-xs text-sub">
            Earnings-linked gap up and gap down candidates ranked by move size,
            relative volume, liquidity, and timing.
          </p>
        </div>
        <div className="text-right text-[11px] text-sub">
          {payload ? (
            <>
              <div>{payload.sourceStatus === 'demo' ? 'Demo fixture' : 'Finviz Elite'}</div>
              <div>{new Date(payload.fetchedAt).toLocaleString()}</div>
            </>
          ) : (
            <div>Finviz Elite</div>
          )}
        </div>
      </header>

      <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
        <span className="text-sub">Direction:</span>
        <FilterLink
          href={makeEarningsHref({ direction: 'all', demo, lookbackDays })}
          active={direction === 'all'}
        >
          All
        </FilterLink>
        <FilterLink
          href={makeEarningsHref({ direction: 'up', demo, lookbackDays })}
          active={direction === 'up'}
        >
          Gap up
        </FilterLink>
        <FilterLink
          href={makeEarningsHref({ direction: 'down', demo, lookbackDays })}
          active={direction === 'down'}
        >
          Gap down
        </FilterLink>
        {demo ? (
          <Link
            href={makeEarningsHref({ direction, demo: false, lookbackDays })}
            className="ml-2 rounded-full border border-border bg-surface px-3 py-1 font-semibold text-sub hover:bg-surface-hover hover:text-text"
          >
            Live
          </Link>
        ) : (
          <Link
            href={makeEarningsHref({ direction, demo: true, lookbackDays })}
            className="ml-2 rounded-full border border-border bg-surface px-3 py-1 font-semibold text-sub hover:bg-surface-hover hover:text-text"
          >
            Demo
          </Link>
        )}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
        <span className="text-sub">Lookback:</span>
        {LOOKBACK_OPTIONS.map((option) => (
          <FilterLink
            key={option}
            href={makeEarningsHref({ direction, demo, lookbackDays: option })}
            active={lookbackDays === option}
          >
            {option}D
          </FilterLink>
        ))}
      </div>

      <div className="mb-5 flex flex-wrap gap-1.5">
        {(payload?.filters ?? []).map((filter) => (
          <span
            key={filter.code}
            className="rounded border border-border bg-surface px-2 py-1 text-[11px] text-sub"
          >
            {filter.label}
          </span>
        ))}
        <span className="rounded border border-border bg-surface px-2 py-1 text-[11px] text-sub">
          Confirmed movers: {MIN_CONFIRMED_MOVE_PCT}%+ move
        </span>
      </div>

      <div className="space-y-7">
        {error ? (
          <div className="rounded-md border border-border bg-surface p-4 text-xs text-sub">
            <p className="font-semibold text-orange">Earnings gap radar unavailable</p>
            <p className="mt-1">{error}</p>
            {error.includes('FINVIZ_AUTH_TOKEN') && (
              <p className="mt-2">
                Set <code className="text-text">FINVIZ_AUTH_TOKEN</code> for live data, or open{' '}
                <Link href="/earnings-gaps?demo=1" className="font-semibold text-teal hover:underline">
                  the demo radar
                </Link>
                .
              </p>
            )}
          </div>
        ) : (
          <>
            <CandidateSection
              title="Confirmed Earnings Movers"
              subtitle={`${confirmedMovers.length} candidate${confirmedMovers.length === 1 ? '' : 's'}`}
              candidates={confirmedMovers}
            />
            <CandidateSection
              title="After-Close Watchlist"
              subtitle={`${afterCloseWatch.length} upcoming report${afterCloseWatch.length === 1 ? '' : 's'}`}
              candidates={afterCloseWatch}
              compact
            />
          </>
        )}

        <GapBookPanel
          key={`${demo ? 'demo' : 'live'}-${lookbackDays}`}
          demo={demo}
          lookbackDays={lookbackDays}
        />
      </div>
    </main>
  )
}

function FilterLink({
  active,
  href,
  children,
}: {
  active: boolean
  href: string
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
        active
          ? 'border-teal bg-teal/10 text-teal'
          : 'border-border bg-surface text-sub hover:bg-surface-hover hover:text-text'
      }`}
    >
      {children}
    </Link>
  )
}

function CandidateSection({
  title,
  subtitle,
  candidates,
  compact = false,
}: {
  title: string
  subtitle: string
  candidates: EarningsGapCandidate[]
  compact?: boolean
}) {
  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-sub">
          {title}
        </h2>
        <span className="text-[11px] text-sub">{subtitle}</span>
      </div>
      {candidates.length === 0 ? (
        <div className="rounded-md border border-border bg-surface px-3 py-6 text-center text-xs text-sub">
          No candidates match this view.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border border-border bg-surface">
          <table className="w-full min-w-[980px] border-collapse text-sm">
            <thead className="border-b border-border bg-bg text-[11px] uppercase tracking-[0.12em] text-sub">
              <tr>
                <th className="px-3 py-2 text-left">Ticker</th>
                <th className="px-3 py-2 text-left">Direction</th>
                <th className="px-3 py-2 text-right">Move</th>
                <th className="px-3 py-2 text-right">Gap</th>
                <th className="px-3 py-2 text-right">Change</th>
                <th className="px-3 py-2 text-right">Rel Vol</th>
                <th className="px-3 py-2 text-right">Volume</th>
                <th className="px-3 py-2 text-right">Price</th>
                <th className="px-3 py-2 text-left">Earnings</th>
                <th className="px-3 py-2 text-right">Score</th>
                <th className="px-3 py-2 text-left">Reasons</th>
              </tr>
            </thead>
            <tbody>
              {candidates.map((candidate) => (
                <tr
                  key={`${candidate.bucket}-${candidate.ticker}`}
                  className="border-b border-border/60 last:border-b-0 hover:bg-surface-hover"
                >
                  <td className="px-3 py-2">
                    <Link
                      href={candidate.chartHref}
                      className="font-semibold text-teal hover:underline"
                    >
                      {candidate.ticker}
                    </Link>
                    {!compact && candidate.company && (
                      <div className="mt-0.5 max-w-52 truncate text-[11px] text-sub">
                        {candidate.company}
                      </div>
                    )}
                  </td>
                  <td className={`px-3 py-2 text-xs font-semibold ${directionClass(candidate.direction)}`}>
                    {directionLabel(candidate.direction)}
                  </td>
                  <td className={`px-3 py-2 text-right font-mono text-xs tabular-nums ${directionClass(candidate.direction)}`}>
                    {formatPct(candidate.movePct)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs tabular-nums">
                    {formatPct(candidate.gapPct)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs tabular-nums">
                    {formatPct(candidate.changePct)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs tabular-nums">
                    {formatRelVol(candidate.relativeVolume)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs tabular-nums">
                    {formatNumber(candidate.volume)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs tabular-nums">
                    {formatPrice(candidate.price)}
                  </td>
                  <td className="px-3 py-2 text-xs text-sub">
                    <span className="font-medium text-text">{candidate.signalLabel}</span>
                    {candidate.earningsDate && (
                      <span className="ml-2 font-mono text-[11px] tabular-nums">
                        {candidate.earningsDate}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs font-semibold tabular-nums">
                    {candidate.score.toFixed(1)}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {candidate.reasons.slice(0, compact ? 2 : 4).map((reason) => (
                        <span
                          key={`${candidate.ticker}-${reason}`}
                          className="rounded border border-border bg-bg px-1.5 py-0.5 text-[11px] text-sub"
                        >
                          {reason}
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
