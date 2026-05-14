'use client'

import { use, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import type {
  ChartAnnotations,
  FilledTrade,
  FilledTradesPayload,
  JournalEntry,
  JournalPayload,
  ScanPayload,
  ScanResult,
  SignalDirection,
  TradeRead,
  TradesPayload,
} from '@/lib/types'
import { HelpLabel } from '@/components/ui/HelpLabel'
import { ScannerCard } from '@/components/scanner/ScannerCard'
import { TradeCard } from '@/components/trades/TradeCard'
import { JournalCard } from '@/components/journal/JournalCard'
import { BarsChart } from '@/components/charts/BarsChart'

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: 'America/New_York',
    })
  } catch {
    return iso
  }
}

function formatMoney(n: number): string {
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

interface FireMarker {
  fireTs: number
  direction: SignalDirection
  pattern: string
}

export default function SymbolPage({ params }: { params: Promise<{ ticker: string }> }) {
  const { ticker: rawTicker } = use(params)
  const ticker = decodeURIComponent(rawTicker).toUpperCase()

  // Deep-link from /scanner: ?t=epoch_seconds&pattern=tfo&direction=long
  // surfaces the candidate's fire bar on the chart. Absent params = default view.
  const searchParams = useSearchParams()
  const fireMarker = useMemo<FireMarker | null>(() => {
    const tRaw = searchParams?.get('t')
    const t = tRaw ? Number(tRaw) : NaN
    const dir = searchParams?.get('direction')
    const pattern = searchParams?.get('pattern')
    if (!Number.isFinite(t) || t <= 0) return null
    if (dir !== 'long' && dir !== 'short') return null
    return { fireTs: t, direction: dir, pattern: pattern ?? 'fire' }
  }, [searchParams])

  const [scanner, setScanner] = useState<ScanResult | null>(null)
  const [scanDate, setScanDate] = useState<string>('')
  const [trades, setTrades] = useState<TradeRead[]>([])
  const [fills, setFills] = useState<FilledTrade[]>([])
  const [entries, setEntries] = useState<JournalEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    Promise.all([
      fetch('/api/scan').then((r) => (r.ok ? r.json() as Promise<ScanPayload> : null)).catch(() => null),
      fetch(`/api/trades?ticker=${encodeURIComponent(ticker)}`)
        .then((r) => (r.ok ? r.json() as Promise<TradesPayload> : null))
        .catch(() => null),
      fetch('/api/snaptrade/sync').then((r) => (r.ok ? r.json() as Promise<FilledTradesPayload> : null)).catch(() => null),
      fetch('/api/journal').then((r) => (r.ok ? r.json() as Promise<JournalPayload> : null)).catch(() => null),
    ]).then(([scanData, tradesData, fillsData, journalData]) => {
      if (cancelled) return

      const match = scanData?.results?.find((r) => r.ticker.toUpperCase() === ticker) ?? null
      setScanner(match)
      setScanDate(scanData?.date ?? '')

      setTrades(tradesData?.trades ?? [])

      const allFills = fillsData?.fills ?? []
      setFills(allFills.filter((f) => f.ticker.toUpperCase() === ticker))

      const allEntries = journalData?.entries ?? []
      setEntries(
        allEntries.filter((e) =>
          (e.linkedTickers ?? []).some((t) => t.toUpperCase() === ticker)
        )
      )

      setLoading(false)
    })

    return () => {
      cancelled = true
    }
  }, [ticker])

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto p-6">
        <div className="skeleton h-8 w-40 mb-2" />
        <div className="skeleton h-4 w-64 mb-6" />
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="skeleton h-20 w-full" />
          ))}
        </div>
      </div>
    )
  }

  const hasAnything =
    scanner !== null || trades.length > 0 || fills.length > 0 || entries.length > 0

  // Sort trades desc by date
  // In deep-link mode (reviewing a scanner candidate) we narrow the Brooks
  // trade-read section to just that session date. Outside deep-link mode the
  // section still shows every Brooks read for the ticker.
  const sessionDateForFilter = fireMarker
    ? new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/New_York',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date(fireMarker.fireTs * 1000))
    : null
  const tradesForView = sessionDateForFilter
    ? trades.filter((t) => t.date === sessionDateForFilter)
    : trades
  const sortedTrades = [...tradesForView].sort((a, b) => b.date.localeCompare(a.date))

  // Group fills by date
  const fillsByDate = fills.reduce((acc, f) => {
    if (!acc[f.date]) acc[f.date] = []
    acc[f.date].push(f)
    return acc
  }, {} as Record<string, FilledTrade[]>)
  const fillDates = Object.keys(fillsByDate).sort((a, b) => b.localeCompare(a))
  for (const d of fillDates) {
    fillsByDate[d].sort((a, b) => b.fillTime.localeCompare(a.fillTime))
  }

  const sortedEntries = [...entries].sort((a, b) => b.date.localeCompare(a.date))

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-[11px] text-sub mb-3">
        <Link href="/journal" className="hover:text-text transition-colors">Journal</Link>
        <span className="text-gray">/</span>
        <span className="text-text/70">{ticker}</span>
      </div>

      {/* Header */}
      <header className="flex items-baseline justify-between mb-4 pb-3 border-b border-border">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-text">{ticker}</h1>
          <p className="text-xs text-sub mt-1">
            Everything linked to this symbol — scanner, trades, fills, and journal.
          </p>
        </div>
        <SummaryStrip
          scannerActive={scanner !== null}
          tradeCount={trades.length}
          fillCount={fills.length}
          entryCount={entries.length}
        />
      </header>

      {/* Setup banner — only when deep-linked from /scanner. Clearly names
       *  the session date + pattern + direction above the chart. */}
      {fireMarker && (
        <SetupBanner ticker={ticker} fireMarker={fireMarker} />
      )}

      {/* Symbol chart — always shown so clicking any ticker surfaces price */}
      <section className="mb-6">
        <SymbolChart ticker={ticker} fireMarker={fireMarker} />
      </section>

      {/* Trader feedback — closes the labeling loop on a candidate. */}
      {fireMarker && (
        <CandidateFeedback ticker={ticker} fireMarker={fireMarker} />
      )}

      {/* Similar past sessions, replacing the today's-context blocks when
       *  the user is reviewing a historical setup. */}
      {fireMarker && (
        <SimilarCharts ticker={ticker} fireTs={fireMarker.fireTs} />
      )}

      {/* "No linked context" hint only makes sense in default mode. */}
      {!fireMarker && !hasAnything && (
        <div className="flex items-center justify-center py-12">
          <div className="text-center max-w-md">
            <div className="text-sm text-sub mb-2">No linked context for {ticker}</div>
            <p className="text-xs text-sub mb-4">
              No scanner hits today, no Brooks reads, no broker fills, no journal entries.
              The chart above is the only context available right now.
            </p>
            <Link href="/journal" className="text-xs text-teal hover:text-teal/80">
              &larr; Back to Journal
            </Link>
          </div>
        </div>
      )}

      {/* Today's scanner snapshot — irrelevant when reviewing a historical
       *  candidate from /scanner, so hidden on deep-link. */}
      {!fireMarker && scanner && (
        <section className="mb-6">
          <SectionHeader
            label="Current scanner state"
            hint={scanDate ? `From ${scanDate} scan` : undefined}
          />
          <ScannerCard result={scanner} scanDate={scanDate ?? ""} />
        </section>
      )}

      {/* Trade reads (with charts). In deep-link mode the list is filtered
       *  to just this candidate's session date, with an empty state when
       *  no Brooks read exists for it yet. */}
      {fireMarker && sortedTrades.length === 0 && (
        <section className="mb-6">
          <SectionHeader label="Brooks trade read" hint={sessionDateForFilter ?? undefined} />
          <div className="rounded-md border border-border bg-surface px-3 py-6 text-center text-xs text-sub">
            No Brooks read for this session yet.
          </div>
        </section>
      )}
      {sortedTrades.length > 0 && (
        <section className="mb-6">
          <SectionHeader
            label={fireMarker ? 'Brooks trade read' : 'Brooks trade reads'}
            hint={
              fireMarker
                ? sessionDateForFilter ?? undefined
                : `${sortedTrades.length} read${sortedTrades.length === 1 ? '' : 's'}`
            }
          />
          <div>
            {sortedTrades.map((trade) => (
              <TradeCard key={trade.id} trade={trade} />
            ))}
          </div>
        </section>
      )}

      {/* Broker fills */}
      {fills.length > 0 && (
        <section className="mb-6">
          <SectionHeader
            label="Broker fills"
            hint={`${fills.length} fill${fills.length === 1 ? '' : 's'} across ${fillDates.length} day${fillDates.length === 1 ? '' : 's'}`}
          />
          <div className="bg-surface border border-border rounded-lg overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-[var(--surface-alt,rgba(255,255,255,0.02))] text-gray">
                <tr>
                  <th className="text-left font-medium px-3 py-2 w-24">Date</th>
                  <th className="text-left font-medium px-3 py-2 w-20">Time</th>
                  <th className="text-left font-medium px-3 py-2 w-16">Side</th>
                  <th className="text-right font-medium px-3 py-2">Qty</th>
                  <th className="text-right font-medium px-3 py-2">Price</th>
                  <th className="text-right font-medium px-3 py-2">Notional</th>
                  <th className="text-left font-medium px-3 py-2">Account</th>
                </tr>
              </thead>
              <tbody>
                {fillDates.map((date) =>
                  fillsByDate[date].map((fill) => (
                    <tr
                      key={fill.id}
                      className="border-t border-border/50 hover:bg-[var(--surface-hover,rgba(255,255,255,0.02))]"
                    >
                      <td className="px-3 py-2 text-sub tabular-nums">{fill.date}</td>
                      <td className="px-3 py-2 text-sub tabular-nums">{formatTime(fill.fillTime)}</td>
                      <td className="px-3 py-2">
                        <span
                          className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                            fill.action === 'BUY'
                              ? 'bg-teal/15 text-teal'
                              : 'bg-red-500/15 text-red-400'
                          }`}
                        >
                          {fill.action}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right text-sub tabular-nums">
                        {fill.qty.toLocaleString('en-US')}
                      </td>
                      <td className="px-3 py-2 text-right text-sub tabular-nums">
                        {formatMoney(fill.price)}
                      </td>
                      <td className="px-3 py-2 text-right text-text tabular-nums">
                        {formatMoney(fill.amount)}
                      </td>
                      <td className="px-3 py-2 text-gray truncate max-w-[200px]">
                        {fill.accountName ?? '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Journal entries */}
      {sortedEntries.length > 0 && (
        <section className="mb-6">
          <SectionHeader
            label="Journal entries"
            hint={`${sortedEntries.length} entr${sortedEntries.length === 1 ? 'y' : 'ies'}`}
          />
          <div>
            {sortedEntries.map((entry) => (
              <JournalCard key={entry.id} entry={entry} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

/**
 * Fetch the single setup_candidates row pinned by (ticker, pattern,
 * direction, session_date). Used by both SetupBanner (to render
 * detection details + outcome) and SymbolChart (to paint Brooks-strong
 * confirming bars). The /api/scanner/candidates pinned-lookup serves
 * Cache-Control: no-store so post-save reads are fresh; we don't need
 * a client-side dedupe here.
 */
function useCandidate(ticker: string, fireMarker: FireMarker | null): CandidateRow | null {
  const sessionDateIso = useMemo(() => {
    if (!fireMarker) return null
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(fireMarker.fireTs * 1000))
  }, [fireMarker])

  const [candidate, setCandidate] = useState<CandidateRow | null>(null)
  useEffect(() => {
    if (!fireMarker || !sessionDateIso) return
    const ac = new AbortController()
    const qs = new URLSearchParams({
      symbol: ticker,
      pattern: fireMarker.pattern,
      direction: fireMarker.direction,
      date: sessionDateIso,
      limit: '1',
    })
    fetch(`/api/scanner/candidates?${qs}`, { signal: ac.signal, cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { candidates: CandidateRow[] }) => {
        setCandidate(d.candidates[0] ?? null)
      })
      .catch(() => {
        // Soft-fail — callers render without detection details.
      })
    return () => ac.abort()
  }, [ticker, fireMarker, sessionDateIso])

  return candidate
}

function SymbolChart({ ticker, fireMarker }: { ticker: string; fireMarker: FireMarker | null }) {
  // Deep-link mode: clamp to that single RTH session at 5-min granularity
  // so the marker snaps to the exact fire bar (the detector emits 5-min-
  // aligned timestamps) and the user can see the LOD + 3 confirming
  // closes in detail. Default mode: 14 days, auto timeframe.
  const { from, to } = useMemo(() => {
    if (fireMarker) {
      // fire_ts is epoch seconds at a 5-min boundary somewhere between
      // 09:45 and 16:00 ET, which is always the same UTC date as the ET
      // session date — so toISOString().slice(0,10) is safe here.
      const iso = new Date(fireMarker.fireTs * 1000).toISOString().slice(0, 10)
      return { from: iso, to: iso }
    }
    const toDate = new Date()
    const fromDate = new Date()
    fromDate.setDate(fromDate.getDate() - 14)
    return { from: fromDate.toISOString().slice(0, 10), to: toDate.toISOString().slice(0, 10) }
  }, [fireMarker])

  // Pull the candidate so we can paint Brooks-strong bars purple along
  // the confirming run. Shared with SetupBanner — same pinned lookup,
  // edge-cached upstream.
  const candidate = useCandidate(ticker, fireMarker)

  const annotations = useMemo<ChartAnnotations | undefined>(() => {
    if (!fireMarker) return undefined
    // Per-bar body paint: Brooks-strong purple → fire bar gold (later
    // wins). The pivot bar gets a horizontal dotted cyan price line
    // instead of a colored candle — it's a structural level, not a
    // single bar to call out. All timestamps come straight from the
    // detector via setup_candidates.{strong_bar_ts, fire_ts, pivot_ts}.
    const bars: { time: number; color: string }[] = []
    if (candidate?.strong_bar_ts) {
      for (const t of candidate.strong_bar_ts) {
        bars.push({ time: t, color: '#a78bfa' })
      }
    }
    bars.push({ time: fireMarker.fireTs, color: '#fbbf24' })
    const ann: ChartAnnotations = { highlightBars: bars }
    if (candidate?.pivot_ts != null) {
      ann.pivotPriceLine = {
        time: candidate.pivot_ts,
        direction: fireMarker.direction,
        color: '#38bdf8',
      }
    }
    return ann
  }, [fireMarker, candidate])

  return (
    <BarsChart
      ticker={ticker}
      from={from}
      to={to}
      annotations={annotations}
      initialTf={fireMarker ? '5min' : 'auto'}
      session={fireMarker ? 'rth' : undefined}
      label={fireMarker ? `${fireMarker.pattern.toUpperCase()} · ${ticker}` : `Price · ${ticker}`}
    />
  )
}

function SectionHeader({ label, hint }: { label: string; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between mb-2">
      <h2 className="text-sm font-semibold text-text">{label}</h2>
      {hint && <span className="text-[11px] text-sub">{hint}</span>}
    </div>
  )
}

function SummaryStrip({
  scannerActive,
  tradeCount,
  fillCount,
  entryCount,
}: {
  scannerActive: boolean
  tradeCount: number
  fillCount: number
  entryCount: number
}) {
  const items = [
    { label: 'Scanner', value: scannerActive ? 'Active' : '—', accent: scannerActive },
    { label: 'Trades', value: tradeCount.toString(), accent: tradeCount > 0 },
    { label: 'Fills', value: fillCount.toString(), accent: fillCount > 0 },
    { label: 'Journal', value: entryCount.toString(), accent: entryCount > 0 },
  ]
  return (
    <div className="hidden sm:flex gap-3 text-right">
      {items.map((i) => (
        <div key={i.label} className="min-w-[3.5rem]">
          <div className="text-[10px] uppercase tracking-wider text-sub">{i.label}</div>
          <div className={`text-sm font-semibold ${i.accent ? 'text-teal' : 'text-sub'}`}>
            {i.value}
          </div>
        </div>
      ))}
    </div>
  )
}

interface CandidateRow {
  id?: number
  symbol: string
  session_date: string
  pattern: string
  direction: 'long' | 'short'
  fire_ts: number
  pivot_index: number
  fired_bar_index: number
  consecutive_count: number
  strong_count: number
  score: number
  status?: string
  note?: string
  outcome_net_pct?: number | null
  outcome_mfe_pct?: number | null
  outcome_mae_pct?: number | null
  outcome_window_bars?: number | null
  outcome_bars_seen?: number | null
  outcome_computed_at?: string | null
  model_score?: number | null
  model_target?: string | null
  model_version?: string | null
  model_scored_at?: string | null
  pivot_ts?: number | null
  strong_bar_ts?: number[] | null
}

const TFO_CRITERIA = [
  { label: '⓵', text: 'Low (or High) of day forms within the first 4 RTH 5-min bars' },
  { label: '⓶', text: '3+ consecutive bull (or bear) closes after the pivot bar' },
  { label: '⓷', text: '2+ of those closes are Brooks-strong: body ≥50% of range, close in the top 25% (longs) or bottom 25% (shorts)' },
]

function SetupBanner({ ticker, fireMarker }: { ticker: string; fireMarker: FireMarker }) {
  // Display the session date in ET, not UTC. The fire bar is mid-RTH so
  // the ET date and UTC date match — but format with ET zone for clarity.
  const sessionDateEt = new Date(fireMarker.fireTs * 1000).toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
  const fireTime = new Date(fireMarker.fireTs * 1000).toLocaleTimeString('en-US', {
    timeZone: 'America/New_York',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  const dirColor = fireMarker.direction === 'long' ? 'text-teal' : 'text-red'

  const candidate = useCandidate(ticker, fireMarker)

  const isTfo = fireMarker.pattern.toLowerCase() === 'tfo'
  const pivotName = fireMarker.direction === 'long' ? 'LOD' : 'HOD'
  const closeName = fireMarker.direction === 'long' ? 'bull' : 'bear'

  return (
    <section className="mb-4 rounded-md border border-border bg-surface">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-4 py-3">
        <div className="text-[10px] uppercase tracking-[0.16em] text-sub">Setup</div>
        <div className="text-sm font-semibold text-text">{ticker}</div>
        <div className="text-sm text-text">{sessionDateEt}</div>
        <div className="text-xs uppercase tracking-wide text-sub">
          {fireMarker.pattern} ·{' '}
          <span className={`font-semibold ${dirColor}`}>{fireMarker.direction}</span>
        </div>
        <div className="ml-auto flex items-center gap-3">
          {candidate && candidate.model_score != null && (
            <span className="font-mono text-[11px] tabular-nums text-text">
              <HelpLabel
                label="model"
                title={`Model: ${candidate.model_target ?? 'mfe_ge_1pct'}`}
                body={
                  <>
                    Calibrated P(this setup pays ≥ 1% favorably within the next 2 hours).
                    Trained on 285 historical TFO fires, cross-validated AUC 0.75.
                    Model version: <span className="font-mono">{candidate.model_version ?? 'v1'}</span>.
                  </>
                }
              />{' '}
              <span className="font-semibold">{Math.round(candidate.model_score * 100)}%</span>
            </span>
          )}
          {candidate && (
            <span className="font-mono text-[11px] tabular-nums text-text">
              <HelpLabel
                label="score"
                title="Rule-based score"
                body="consecutive_count × 1.0 + strong_count × 0.5. Higher = longer / cleaner confirming run. Pre-ML ranking signal; the model column is the post-ML one."
              />{' '}
              <span className="font-semibold">{candidate.score.toFixed(1)}</span>
            </span>
          )}
          <span className="font-mono text-[11px] tabular-nums text-sub">
            fire bar @ {fireTime} ET
          </span>
        </div>
      </div>

      {isTfo && (
        <div className="border-t border-border/60 px-4 py-3">
          <div className="mb-2 text-[10px] uppercase tracking-[0.16em] text-sub">Criteria</div>
          <ul className="space-y-1 text-xs leading-relaxed text-sub">
            {TFO_CRITERIA.map((c) => (
              <li key={c.label} className="flex gap-2">
                <span className="shrink-0 font-mono text-text/70">{c.label}</span>
                <span>{c.text}</span>
              </li>
            ))}
          </ul>
          {candidate && (
            <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] sm:grid-cols-4">
              <Metric
                label={`${pivotName} bar`}
                value={`bar ${candidate.pivot_index + 1} / 4`}
                help={{
                  title: `${pivotName} bar position`,
                  body: `Which of the first 4 RTH 5-min bars formed the ${pivotName === 'LOD' ? 'session low' : 'session high'}. The setup requires this to happen in bars 1–4 and to stay the ${pivotName === 'LOD' ? 'low' : 'high'} for the rest of the session.`,
                }}
              />
              <Metric
                label={`${closeName} closes`}
                value={`${candidate.consecutive_count}`}
                help={{
                  title: 'Consecutive in-direction closes',
                  body: `Total run of ${closeName} closes after the pivot bar. The setup needs at least 3; longer / cleaner runs score higher.`,
                }}
              />
              <Metric
                label="strong"
                value={`${candidate.strong_count} / ${candidate.consecutive_count}`}
                help={{
                  title: 'Brooks-strong bars',
                  body: 'How many of the confirming closes are Brooks-strong: body ≥ 50% of range, close in the top 25% of range (longs) or bottom 25% (shorts). The setup needs at least 2.',
                }}
              />
              <Metric
                label="fire bar"
                value={`bar ${candidate.fired_bar_index + 1}`}
                help={{
                  title: 'Fire bar',
                  body: 'The bar whose close confirmed the 3rd in-direction close — the moment the setup triggered. Time-stamped in the header.',
                }}
              />
            </div>
          )}
          {/* Chart-paint legend. Mirrors what LightweightChart applies on
              the chart below, so a reader can decode the colored bars
              without scrolling away or guessing. */}
          {candidate && (
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-sub">
              <span className="text-[9px] uppercase tracking-[0.16em]">Chart colors</span>
              <span className="inline-flex items-center gap-1.5">
                {/* Dotted strip swatch to indicate a price-line, not a
                    candle body. Matches the dotted style applied to the
                    chart's pivot line. */}
                <span
                  className="inline-block h-0 w-3"
                  style={{ borderTop: '2px dotted #38bdf8' }}
                  aria-hidden
                />
                <HelpLabel
                  label={pivotName + ' line'}
                  title={`Cyan dotted line = ${pivotName} level`}
                  body={
                    pivotName === 'LOD'
                      ? 'Horizontal price line at the session low. Drawn at the low of the bar that printed the LOD within the first 4 RTH 5-min bars — the structural anchor every confirming bull close measures against.'
                      : 'Horizontal price line at the session high. Drawn at the high of the bar that printed the HOD within the first 4 RTH 5-min bars — the structural anchor every confirming bear close measures against.'
                  }
                />
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-sm"
                  style={{ backgroundColor: '#a78bfa' }}
                  aria-hidden
                />
                <HelpLabel
                  label="Brooks-strong"
                  title="Purple = Brooks-strong"
                  body={
                    <>
                      Confirming-run bars that pass the Brooks-strong rule: body ≥ 50% of range, close in the top 25% of range (longs) or bottom 25% (shorts). For this candidate, {candidate.strong_count} of {candidate.consecutive_count} confirming bars qualify.
                    </>
                  }
                />
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-sm"
                  style={{ backgroundColor: '#fbbf24' }}
                  aria-hidden
                />
                <HelpLabel
                  label="fire bar"
                  title="Gold = fire bar"
                  body="The 3rd consecutive in-direction close — the bar that confirmed the setup."
                />
              </span>
            </div>
          )}
        </div>
      )}

      {candidate && candidate.outcome_computed_at && (
        <div className="border-t border-border/60 px-4 py-3">
          <div className="mb-2 flex items-baseline gap-3">
            <span className="text-[10px] uppercase tracking-[0.16em] text-sub">Outcome</span>
            <span className="text-[10px] text-sub/80">
              <HelpLabel
                label={`next ${candidate.outcome_bars_seen ?? candidate.outcome_window_bars} × 5min`}
                title="Evaluation window"
                body="The 24 × 5-min bars after the fire bar — a 2-hour forward window. Outcomes (net / MFE / MAE) are measured inside this window only; the model is calibrated against the same horizon."
              />
            </span>
          </div>
          <div className="grid grid-cols-3 gap-x-4 gap-y-1 text-[11px]">
            <Metric
              label="net"
              value={`${(candidate.outcome_net_pct ?? 0) >= 0 ? '+' : ''}${(candidate.outcome_net_pct ?? 0).toFixed(2)}%`}
              help={{
                title: 'Net move',
                body: "Close-to-close move from the fire bar's close to the close of the last bar in the window, signed in the setup's direction (positive = paid). Random walks dominate this metric — use it as one signal, not a verdict.",
              }}
            />
            <Metric
              label="MFE"
              value={`+${(candidate.outcome_mfe_pct ?? 0).toFixed(2)}%`}
              help={{
                title: 'Maximum Favorable Excursion',
                body: "Best price reached in the setup's direction during the window, vs the fire-bar close. Tells you the most a trader could have made if they timed the exit perfectly. The V1 model predicts P(MFE ≥ 1%).",
              }}
            />
            <Metric
              label="MAE"
              value={`-${(candidate.outcome_mae_pct ?? 0).toFixed(2)}%`}
              help={{
                title: 'Maximum Adverse Excursion',
                body: "Worst price against the setup's direction during the window, vs the fire-bar close. Tells you how much heat a trade would've taken — useful for setting stops.",
              }}
            />
          </div>
        </div>
      )}
    </section>
  )
}

function Metric({
  label,
  value,
  help,
}: {
  label: string
  value: string
  help?: { title: string; body: React.ReactNode }
}) {
  return (
    <div>
      <div className="text-[9px] uppercase tracking-wide text-sub">
        {help ? <HelpLabel label={label} title={help.title} body={help.body} /> : label}
      </div>
      <div className="font-mono tabular-nums text-text">{value}</div>
    </div>
  )
}

type FeedbackStatus = 'new' | 'good' | 'bad' | 'traded'
const FEEDBACK_STATUSES: { value: FeedbackStatus; label: string }[] = [
  { value: 'new', label: 'New' },
  { value: 'good', label: 'Good' },
  { value: 'bad', label: 'Bad' },
  { value: 'traded', label: 'Traded' },
]

function CandidateFeedback({ ticker, fireMarker }: { ticker: string; fireMarker: FireMarker }) {
  const sessionDateIso = useMemo(() => {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(fireMarker.fireTs * 1000))
  }, [fireMarker.fireTs])

  const [candidate, setCandidate] = useState<CandidateRow | null>(null)
  const [draftStatus, setDraftStatus] = useState<FeedbackStatus>('new')
  const [draftNote, setDraftNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    const ac = new AbortController()
    const qs = new URLSearchParams({
      symbol: ticker,
      pattern: fireMarker.pattern,
      direction: fireMarker.direction,
      date: sessionDateIso,
      limit: '1',
    })
    fetch(`/api/scanner/candidates?${qs}`, { signal: ac.signal, cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { candidates: CandidateRow[] }) => {
        const c = d.candidates[0]
        if (!c) {
          setLoaded(true)
          return
        }
        setCandidate(c)
        setDraftStatus((c.status as FeedbackStatus) ?? 'new')
        setDraftNote(c.note ?? '')
        setLoaded(true)
      })
      .catch(() => setLoaded(true))
    return () => ac.abort()
  }, [ticker, fireMarker.pattern, fireMarker.direction, sessionDateIso])

  const dirty =
    candidate != null &&
    (draftStatus !== (candidate.status ?? 'new') || draftNote !== (candidate.note ?? ''))

  async function save() {
    if (!candidate?.id) return
    setSaving(true)
    setSaveMsg(null)
    try {
      const resp = await fetch(`/api/scanner/candidates/${candidate.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: draftStatus, note: draftNote }),
      })
      const data = await resp.json()
      if (!resp.ok) throw new Error(data.error ?? `HTTP ${resp.status}`)
      setCandidate({ ...candidate, status: data.candidate.status, note: data.candidate.note })
      setSaveMsg('Saved')
      window.setTimeout(() => setSaveMsg(null), 2_000)
    } catch (e) {
      setSaveMsg(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  if (loaded && !candidate) {
    // No row to attach feedback to — shouldn't happen for a real /scanner
    // deep-link but render nothing instead of crashing.
    return null
  }

  return (
    <section className="mb-6">
      <SectionHeader
        label="Your read"
        hint={candidate?.status && candidate.status !== 'new' ? `currently: ${candidate.status}` : undefined}
      />
      <div className="rounded-md border border-border bg-surface px-4 py-3">
        <div className="mb-3 flex flex-wrap gap-2">
          {FEEDBACK_STATUSES.map((s) => {
            const active = draftStatus === s.value
            return (
              <button
                key={s.value}
                type="button"
                onClick={() => setDraftStatus(s.value)}
                className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                  active
                    ? s.value === 'good'
                      ? 'border-teal bg-teal/15 text-teal'
                      : s.value === 'bad'
                        ? 'border-red bg-red/15 text-red'
                        : s.value === 'traded'
                          ? 'border-amber-500 bg-amber-500/15 text-amber-400'
                          : 'border-border bg-surface-hover text-text'
                    : 'border-border bg-bg text-sub hover:bg-surface-hover hover:text-text'
                }`}
              >
                {s.label}
              </button>
            )
          })}
        </div>
        <textarea
          value={draftNote}
          onChange={(e) => setDraftNote(e.target.value)}
          placeholder="Notes — what made this setup good / bad / why you skipped or took it…"
          rows={3}
          className="block w-full resize-y rounded-md border border-border bg-bg px-3 py-2 text-xs text-text placeholder:text-sub/60 focus:outline-none focus:ring-1 focus:ring-teal/60"
        />
        <div className="mt-2 flex items-center justify-end gap-3">
          {saveMsg && (
            <span className={`text-[11px] ${saveMsg === 'Saved' ? 'text-teal' : 'text-red'}`}>{saveMsg}</span>
          )}
          <button
            type="button"
            disabled={!dirty || saving}
            onClick={save}
            className="rounded-md border border-teal/60 bg-teal/10 px-3 py-1 text-xs font-semibold text-teal disabled:cursor-not-allowed disabled:border-border disabled:bg-surface-hover disabled:text-sub"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </section>
  )
}

interface AnalogMatch {
  rank: number
  slug: string
  date: string
  ticker: string
  dtw: number
  flipped: boolean
}

function SimilarCharts({ ticker, fireTs }: { ticker: string; fireTs: number }) {
  const [matches, setMatches] = useState<AnalogMatch[] | null>(null)
  const [inCorpus, setInCorpus] = useState<boolean | null>(null)
  const [error, setError] = useState<string | null>(null)

  const sessionDate = useMemo(() => {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(fireTs * 1000))
  }, [fireTs])

  useEffect(() => {
    const ac = new AbortController()
    fetch(`/api/scanner/analogs?date=${sessionDate}&ticker=${ticker}&limit=5`, {
      signal: ac.signal,
    })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return (await r.json()) as { matches: AnalogMatch[]; inCorpus: boolean }
      })
      .then((d) => {
        setMatches(d.matches)
        setInCorpus(d.inCorpus)
      })
      .catch((e: unknown) => {
        if (ac.signal.aborted) return
        setError(e instanceof Error ? e.message : String(e))
      })
    return () => ac.abort()
  }, [sessionDate, ticker])

  return (
    <section className="mb-6">
      <SectionHeader
        label="Similar past sessions"
        hint={
          matches === null
            ? 'Loading…'
            : inCorpus === false
              ? 'This session is not in the analog corpus yet'
              : `Top ${matches.length} chart-shape matches by DTW`
        }
      />
      {error && (
        <div className="rounded-md border border-red/40 bg-red/10 px-3 py-2 text-xs text-red">
          {error}
        </div>
      )}
      {!error && matches !== null && matches.length === 0 && (
        <div className="rounded-md border border-border bg-surface px-3 py-6 text-center text-xs text-sub">
          {inCorpus === false
            ? `No analogs computed for ${ticker} on ${sessionDate} — the EOD corpus refresh adds new sessions nightly.`
            : 'No similar sessions found.'}
        </div>
      )}
      {!error && matches !== null && matches.length > 0 && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {matches.map((m) => (
            <Link
              key={m.slug}
              href={`/history?tab=analogs&date=${sessionDate}&ticker=${ticker}`}
              className="block rounded-md border border-border bg-surface px-3 py-3 hover:bg-surface-hover"
            >
              <div className="flex items-baseline justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold text-text">{m.ticker}</div>
                  <div className="text-xs text-sub">{m.date}</div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] uppercase tracking-wide text-sub">DTW</div>
                  <div className="font-mono text-xs tabular-nums text-text">{m.dtw.toFixed(2)}</div>
                </div>
              </div>
              {m.flipped && (
                <div className="mt-1 text-[10px] uppercase tracking-wide text-red/80">
                  Flipped (mirrored shape)
                </div>
              )}
            </Link>
          ))}
        </div>
      )}
    </section>
  )
}
