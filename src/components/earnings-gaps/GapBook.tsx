'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import type {
  EarningsGapBookResult,
  HistoricalEarningsGapEvent,
  MonthlyEarningsGapGroup,
  UpcomingEarningsMonth,
} from '@/lib/earnings-gap-book'

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

function directionClass(direction: 'up' | 'down'): string {
  return direction === 'up' ? 'text-teal' : 'text-red'
}

function formatDateShort(date: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${date}T12:00:00Z`))
}

/**
 * Client-side gap book. The book fans out to ~120 Nasdaq/Yahoo requests, so
 * it loads off the page render path against the CDN-cached
 * `/api/earnings-gaps?view=book` route instead of blocking server render.
 */
export function GapBookPanel({
  demo,
  lookbackDays,
}: {
  demo: boolean
  lookbackDays: number
}) {
  const [book, setBook] = useState<EarningsGapBookResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const ac = new AbortController()
    const params = new URLSearchParams({ view: 'book', lookback: String(lookbackDays) })
    if (demo) params.set('demo', '1')
    fetch(`/api/earnings-gaps?${params}`, { signal: ac.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: EarningsGapBookResult) => setBook(d))
      .catch((e: unknown) => {
        if (ac.signal.aborted) return
        setError(e instanceof Error ? e.message : String(e))
      })
    return () => ac.abort()
  }, [demo, lookbackDays])

  if (error) {
    return (
      <div className="rounded-md border border-border bg-surface p-4 text-xs text-sub">
        <p className="font-semibold text-orange">Gap book unavailable</p>
        <p className="mt-1">{error}</p>
      </div>
    )
  }

  if (!book) {
    return (
      <div className="rounded-md border border-border bg-surface px-3 py-6 text-center text-xs text-sub">
        Loading gap book…
      </div>
    )
  }

  return <GapBookSection book={book} />
}

function GapBookSection({ book }: { book: EarningsGapBookResult }) {
  const historyCount = book.historyGroups.reduce((sum, group) => sum + group.events.length, 0)
  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-sub">
            Monthly Gap Book
          </h2>
          <p className="mt-1 max-w-3xl text-xs text-sub">
            Recent earnings reactions grouped by month, using the first regular-session
            open after the report against the prior daily close.
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-1.5 text-[11px] text-sub">
          <span className="rounded border border-border bg-surface px-2 py-1">
            {book.lookbackDays}D lookback
          </span>
          <span className="rounded border border-border bg-surface px-2 py-1">
            {book.minGapPct}%+ open gap
          </span>
          <span className="rounded border border-border bg-surface px-2 py-1">
            {book.sourceStatus === 'demo' ? 'Demo' : book.sourceStatus === 'partial' ? 'Partial live' : 'Live'}
          </span>
        </div>
      </div>

      {book.errors.length > 0 && (
        <div className="rounded-md border border-border bg-surface px-3 py-2 text-[11px] text-orange">
          Some symbols were skipped while loading the book. Showing the usable gap records.
        </div>
      )}

      <div className="space-y-5">
        <div className="space-y-3">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-sub">
              Recent Months
            </h3>
            <span className="text-[11px] text-sub">
              {historyCount} example{historyCount === 1 ? '' : 's'}
            </span>
          </div>
          {book.historyGroups.length === 0 ? (
            <div className="rounded-md border border-border bg-surface px-3 py-6 text-center text-xs text-sub">
              No {book.minGapPct}%+ earnings gaps found in this lookback.
            </div>
          ) : (
            book.historyGroups.map((group, index) => (
              <HistoryMonthDetails
                key={group.monthKey}
                group={group}
                defaultOpen={index === 0}
              />
            ))
          )}
        </div>

        <UpcomingCalendar month={book.upcomingMonth} />
      </div>
    </section>
  )
}

function HistoryMonthDetails({
  group,
  defaultOpen,
}: {
  group: MonthlyEarningsGapGroup
  defaultOpen: boolean
}) {
  return (
    <details
      open={defaultOpen}
      className="overflow-hidden rounded-md border border-border bg-surface"
    >
      <summary className="flex cursor-pointer items-center justify-between gap-3 bg-bg px-3 py-2 text-xs hover:bg-surface-hover">
        <span className="font-semibold text-text">{group.monthLabel}</span>
        <span className="text-[11px] text-sub">
          {group.events.length} gap{group.events.length === 1 ? '' : 's'}
        </span>
      </summary>
      <HistoricalGapTable events={group.events} />
    </details>
  )
}

function HistoricalGapTable({ events }: { events: HistoricalEarningsGapEvent[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[900px] border-collapse text-sm">
        <thead className="border-b border-border bg-bg text-[11px] uppercase tracking-[0.12em] text-sub">
          <tr>
            <th className="px-3 py-2 text-left">Ticker</th>
            <th className="px-3 py-2 text-left">Report</th>
            <th className="px-3 py-2 text-left">Reaction</th>
            <th className="px-3 py-2 text-right">Open Gap</th>
            <th className="px-3 py-2 text-right">Close vs Prior</th>
            <th className="px-3 py-2 text-right">Open to Close</th>
            <th className="px-3 py-2 text-right">Prior Close</th>
            <th className="px-3 py-2 text-right">Open</th>
            <th className="px-3 py-2 text-right">Volume</th>
          </tr>
        </thead>
        <tbody>
          {events.map((event) => (
            <tr
              key={`${event.ticker}-${event.reactionDate}`}
              className="border-b border-border/60 last:border-b-0 hover:bg-surface-hover"
            >
              <td className="px-3 py-2">
                <Link
                  href={event.chartHref}
                  className="font-semibold text-teal hover:underline"
                >
                  {event.ticker}
                </Link>
                <div className="mt-0.5 max-w-52 truncate text-[11px] text-sub">
                  {event.company}
                </div>
              </td>
              <td className="px-3 py-2 text-xs text-sub">
                <div className="font-mono text-text tabular-nums">{formatDateShort(event.reportDate)}</div>
                <div className="mt-0.5">{event.reportTimeLabel}</div>
              </td>
              <td className="px-3 py-2 font-mono text-xs tabular-nums text-sub">
                {formatDateShort(event.reactionDate)}
              </td>
              <td className={`px-3 py-2 text-right font-mono text-xs font-semibold tabular-nums ${directionClass(event.direction)}`}>
                {formatPct(event.gapPct)}
              </td>
              <td className={`px-3 py-2 text-right font-mono text-xs tabular-nums ${event.closeFromPriorPct >= 0 ? 'text-teal' : 'text-red'}`}>
                {formatPct(event.closeFromPriorPct)}
              </td>
              <td className={`px-3 py-2 text-right font-mono text-xs tabular-nums ${event.changeFromOpenPct >= 0 ? 'text-teal' : 'text-red'}`}>
                {formatPct(event.changeFromOpenPct)}
              </td>
              <td className="px-3 py-2 text-right font-mono text-xs tabular-nums">
                {formatPrice(event.priorClose)}
              </td>
              <td className="px-3 py-2 text-right font-mono text-xs tabular-nums">
                {formatPrice(event.open)}
              </td>
              <td className="px-3 py-2 text-right font-mono text-xs tabular-nums">
                {formatNumber(event.volume)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function UpcomingCalendar({ month }: { month: UpcomingEarningsMonth }) {
  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-sub">
          Next Month
        </h3>
        <span className="text-[11px] text-sub">
          {month.eventCount} report{month.eventCount === 1 ? '' : 's'}
        </span>
      </div>
      <div className="overflow-x-auto rounded-md border border-border bg-surface">
        <div className="min-w-[760px]">
          <div className="border-b border-border bg-bg px-3 py-2">
            <div className="text-sm font-semibold text-text">{month.monthLabel}</div>
          </div>
          <div className="grid grid-cols-7 border-b border-border bg-bg text-center text-[10px] uppercase tracking-[0.12em] text-sub">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
              <div key={day} className="px-2 py-2">
                {day}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {month.cells.map((cell) => (
              <div
                key={cell.date}
                className={`min-h-28 border-b border-r border-border/70 p-2 last:border-r-0 ${
                  cell.inMonth ? 'bg-surface' : 'bg-bg/60 text-sub'
                } ${cell.isWeekend ? 'opacity-70' : ''}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[11px] tabular-nums text-sub">
                    {cell.dayOfMonth}
                  </span>
                  {cell.events.length > 0 && (
                    <span className="rounded border border-border bg-bg px-1.5 py-0.5 text-[10px] text-sub">
                      {cell.events.length}
                    </span>
                  )}
                </div>
                <div className="mt-2 space-y-1">
                  {cell.events.slice(0, 3).map((event) => (
                    <Link
                      key={`${event.date}-${event.symbol}`}
                      href={`/chart?symbol=${encodeURIComponent(event.symbol)}`}
                      className="block rounded border border-border bg-bg px-2 py-1 hover:border-border-hover hover:bg-surface-hover"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-[11px] font-semibold text-teal">
                          {event.symbol}
                        </span>
                        <span className="truncate text-[10px] text-sub">
                          {event.reportTimeLabel}
                        </span>
                      </div>
                      {event.epsForecast && (
                        <div className="mt-0.5 truncate text-[10px] text-sub">
                          EPS {event.epsForecast}
                        </div>
                      )}
                    </Link>
                  ))}
                  {cell.events.length > 3 && (
                    <div className="rounded border border-border bg-bg px-2 py-1 text-[10px] text-sub">
                      +{cell.events.length - 3} more
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
