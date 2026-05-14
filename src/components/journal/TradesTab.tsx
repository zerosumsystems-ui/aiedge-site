'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import type {
  FilledTrade,
  FilledTradesPayload,
  PairedTrade,
  RoundTrip,
} from '@/lib/types'
import type { EquityStats } from '@/lib/stats'
import { BarsChart } from '@/components/charts/BarsChart'
import { BrooksAnalysisPanel } from './BrooksAnalysisPanel'

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: 'America/New_York',
    })
  } catch {
    return iso
  }
}

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

function formatDuration(ms: number): string {
  const mins = Math.round(ms / 60_000)
  if (mins < 60) return `${mins}m`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ${mins % 60}m`
  const days = Math.floor(hours / 24)
  const hoursPart = hours % 24
  return hoursPart > 0 ? `${days}d ${hoursPart}h` : `${days}d`
}

function formatPct(n: number): string {
  const sign = n > 0 ? '+' : ''
  return `${sign}${(n * 100).toFixed(2)}%`
}

function formatR(n: number): string {
  const sign = n > 0 ? '+' : ''
  return `${sign}${n.toFixed(2)}R`
}

function formatWinRate(n: number): string {
  return `${(n * 100).toFixed(0)}%`
}

export function TradesTab() {
  const [payload, setPayload] = useState<FilledTradesPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'closed' | 'open' | 'paired' | 'orphan'>('closed')

  useEffect(() => {
    fetch('/api/snaptrade/sync')
      .then((r) => r.json())
      .then((data) => {
        setPayload(data as FilledTradesPayload)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const filtered = useMemo(() => {
    const trips = payload?.roundTrips ?? []
    switch (filter) {
      case 'closed':
        return trips.filter((t) => !t.isOpen)
      case 'open':
        return trips.filter((t) => t.isOpen)
      case 'paired':
        return trips.filter((t) => t.pairedReadId != null)
      case 'orphan':
        return trips.filter((t) => t.pairedReadId == null && !t.isOpen)
      default:
        return trips
    }
  }, [payload?.roundTrips, filter])

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="skeleton h-14 w-full" />
        ))}
      </div>
    )
  }

  const trips = payload?.roundTrips ?? []
  const fills = payload?.fills ?? []

  if (trips.length === 0 && fills.length === 0) {
    return (
      <div className="text-center py-16 text-sub text-sm">
        No trades yet. Fills get paired into round-trips (BUY → SELL) on sync.
        Connect a broker and hit <em>Sync now</em> on the <strong>Broker</strong> tab.
      </div>
    )
  }

  // Headline stats for closed round-trips
  const closed = trips.filter((t) => !t.isOpen && t.realizedPnL != null)
  const wins = closed.filter((t) => (t.realizedPnL ?? 0) > 0).length
  const losses = closed.filter((t) => (t.realizedPnL ?? 0) < 0).length
  const decisive = wins + losses
  const totalPnL = closed.reduce((s, t) => s + (t.realizedPnL ?? 0), 0)
  const winRate = decisive > 0 ? wins / decisive : 0
  const avgWin =
    wins > 0
      ? closed.filter((t) => (t.realizedPnL ?? 0) > 0).reduce((s, t) => s + (t.realizedPnL ?? 0), 0) / wins
      : 0
  const avgLoss =
    losses > 0
      ? Math.abs(
          closed.filter((t) => (t.realizedPnL ?? 0) < 0).reduce((s, t) => s + (t.realizedPnL ?? 0), 0) / losses
        )
      : 0
  const expectancy = decisive > 0 ? totalPnL / decisive : 0
  const profitFactor =
    avgLoss > 0 && losses > 0 ? (avgWin * wins) / (avgLoss * losses) : null

  const filterTabs: { key: typeof filter; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: trips.length },
    { key: 'closed', label: 'Closed', count: trips.filter((t) => !t.isOpen).length },
    { key: 'open', label: 'Open', count: trips.filter((t) => t.isOpen).length },
    { key: 'paired', label: 'Paired', count: trips.filter((t) => t.pairedReadId != null).length },
    { key: 'orphan', label: 'No read', count: trips.filter((t) => t.pairedReadId == null && !t.isOpen).length },
  ]

  return (
    <div className="space-y-4">
      {/* Headline stats — Van Tharp style: win-rate, expectancy, profit factor */}
      <div className="bg-surface border border-border rounded-lg p-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatBox label="Closed" value={String(closed.length)} />
        <StatBox
          label="Win rate"
          value={decisive > 0 ? formatWinRate(winRate) : '—'}
          tone={winRate >= 0.5 ? 'good' : decisive > 0 ? 'bad' : 'neutral'}
        />
        <StatBox
          label="Total PnL"
          value={formatMoney(totalPnL)}
          tone={totalPnL > 0 ? 'good' : totalPnL < 0 ? 'bad' : 'neutral'}
        />
        <StatBox
          label="Expectancy"
          value={decisive > 0 ? formatMoney(expectancy) : '—'}
          tone={expectancy > 0 ? 'good' : expectancy < 0 ? 'bad' : 'neutral'}
        />
        <StatBox
          label="Avg W / L"
          value={
            wins + losses > 0
              ? `${avgWin > 0 ? formatMoney(avgWin) : '—'} / ${avgLoss > 0 ? formatMoney(avgLoss) : '—'}`
              : '—'
          }
        />
        <StatBox
          label="Profit factor"
          value={profitFactor != null ? profitFactor.toFixed(2) : '—'}
          tone={
            profitFactor != null && profitFactor >= 1.5
              ? 'good'
              : profitFactor != null && profitFactor < 1
              ? 'bad'
              : 'neutral'
          }
        />
      </div>

      {/* Per-setup expectancy/R-multiples (paired fills only) */}
      <SetupStatsPanel stats={payload?.stats ?? {}} />

      {/* Filters */}
      <div className="flex gap-1 border-b border-border pb-2 overflow-x-auto scrollbar-none">
        {filterTabs.map((t) => {
          const active = filter === t.key
          return (
            <button
              key={t.key}
              onClick={() => setFilter(t.key)}
              className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
                active ? 'bg-teal/10 text-teal' : 'text-sub hover:text-text hover:bg-bg'
              }`}
            >
              {t.label}
              <span className={`ml-1 text-[10px] ${active ? 'text-teal/70' : 'text-gray'}`}>
                {t.count}
              </span>
            </button>
          )
        })}
      </div>

      {/* Round-trip rows */}
      <div className="space-y-2">
        {filtered.length === 0 && (
          <div className="text-center py-12 text-sub text-xs">No trades match this filter.</div>
        )}
        {filtered.map((trip) => (
          <RoundTripCard key={trip.id} trip={trip} />
        ))}
      </div>

      {/* Raw fills tape — collapsed footer */}
      {fills.length > 0 && (
        <RawFillsFooter payload={payload!} />
      )}
    </div>
  )
}

interface StatBoxProps {
  label: string
  value: string
  tone?: 'good' | 'bad' | 'neutral'
}

function StatBox({ label, value, tone = 'neutral' }: StatBoxProps) {
  const toneCls = tone === 'good' ? 'text-teal' : tone === 'bad' ? 'text-red-400' : 'text-text'
  return (
    <div className="bg-bg rounded-lg p-2">
      <div className="text-[9px] uppercase tracking-wider text-sub mb-0.5">{label}</div>
      <div className={`text-sm font-semibold tabular-nums truncate ${toneCls}`}>{value}</div>
    </div>
  )
}

function SetupStatsPanel({ stats }: { stats: Record<string, EquityStats> }) {
  const rows = Object.entries(stats)
    .map(([setup, s]) => ({ setup, ...s }))
    .filter((r) => r.completedCount > 0)
    .sort((a, b) => b.totalPnL - a.totalPnL)

  if (rows.length === 0) return null

  return (
    <div className="bg-surface border border-border rounded-lg overflow-hidden">
      <div className="px-3 py-2 text-[11px] uppercase tracking-wide text-gray border-b border-border">
        Per-setup R-multiples (paired fills only)
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-gray">
            <tr>
              <th className="text-left font-medium px-3 py-2">Setup</th>
              <th className="text-right font-medium px-3 py-2">N</th>
              <th className="text-right font-medium px-3 py-2">Win rate</th>
              <th className="text-right font-medium px-3 py-2">Expectancy</th>
              <th className="text-right font-medium px-3 py-2">Total R</th>
              <th className="text-right font-medium px-3 py-2">Max DD</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.setup} className="border-t border-border/50">
                <td className="px-3 py-2 font-semibold text-text uppercase">{r.setup}</td>
                <td className="px-3 py-2 text-right text-sub tabular-nums">{r.completedCount}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  <span className={r.winRate >= 0.5 ? 'text-teal' : 'text-sub'}>
                    {formatWinRate(r.winRate)}
                  </span>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  <span className={r.expectancy > 0 ? 'text-teal' : r.expectancy < 0 ? 'text-red-400' : 'text-sub'}>
                    {formatR(r.expectancy)}
                  </span>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  <span className={r.totalPnL > 0 ? 'text-teal' : r.totalPnL < 0 ? 'text-red-400' : 'text-sub'}>
                    {formatR(r.totalPnL)}
                  </span>
                </td>
                <td className="px-3 py-2 text-right text-gray tabular-nums">
                  {r.maxDrawdown > 0 ? `-${r.maxDrawdown.toFixed(2)}R` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function RawFillsFooter({ payload }: { payload: FilledTradesPayload }) {
  const [open, setOpen] = useState(false)
  const fills = payload.fills
  const pairedById = useMemo(() => {
    const m = new Map<string, PairedTrade>()
    for (const p of payload.paired ?? []) m.set(p.fill.id, p)
    return m
  }, [payload.paired])

  const pairedCount = payload.paired?.filter((p) => p.pairedReadId).length ?? 0
  const orphanCount = fills.length - pairedCount
  const dates = new Set(fills.map((f) => f.date))

  return (
    <details
      className="bg-surface border border-border rounded-lg overflow-hidden"
      onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}
    >
      <summary className="list-none cursor-pointer px-3 py-2 flex items-center justify-between gap-2 text-xs text-sub hover:text-text select-none [&::-webkit-details-marker]:hidden">
        <span className="font-medium">
          Raw fills tape{' '}
          <span className="text-gray">
            · {fills.length} fill{fills.length === 1 ? '' : 's'} across {dates.size} day
            {dates.size === 1 ? '' : 's'} · {pairedCount} paired · {orphanCount} orphan
          </span>
        </span>
        <div className="flex items-center gap-2">
          {payload.syncedAt && (
            <span className="text-gray text-[10px]">
              Synced {new Date(payload.syncedAt).toLocaleString('en-US', { timeZone: 'America/New_York' })} ET
            </span>
          )}
          <span className="text-gray">{open ? '▾' : '▸'}</span>
        </div>
      </summary>

      {open && <RawFillsTable fills={fills} pairedById={pairedById} />}

      {payload.lastSyncError && (
        <div className="bg-red-500/10 border-t border-red-500/30 text-red-300 text-xs p-3">
          Last sync error: {payload.lastSyncError}
        </div>
      )}
    </details>
  )
}

function RawFillsTable({
  fills,
  pairedById,
}: {
  fills: FilledTrade[]
  pairedById: Map<string, PairedTrade>
}) {
  const grouped = fills.reduce((acc, fill) => {
    if (!acc[fill.date]) acc[fill.date] = []
    acc[fill.date].push(fill)
    return acc
  }, {} as Record<string, FilledTrade[]>)
  const sortedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a))
  for (const date of sortedDates) {
    grouped[date].sort((a, b) => b.fillTime.localeCompare(a.fillTime))
  }

  return (
    <div className="border-t border-border space-y-4 p-3">
      {sortedDates.map((date) => {
        const d = new Date(date + 'T12:00:00')
        const dayName = d.toLocaleDateString('en-US', { weekday: 'long' })
        const monthDay = d.toLocaleDateString('en-US', {
          month: 'long',
          day: 'numeric',
          year: 'numeric',
        })
        return (
          <div key={date}>
            <div className="flex items-baseline gap-2 mb-1.5">
              <h3 className="text-xs font-semibold text-text">{dayName}</h3>
              <span className="text-[11px] text-sub">{monthDay}</span>
              <span className="text-[10px] text-gray">
                {grouped[date].length} fill{grouped[date].length === 1 ? '' : 's'}
              </span>
            </div>
            <div className="bg-bg border border-border rounded overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-gray">
                  <tr>
                    <th className="text-left font-medium px-2 py-1.5 w-16">Time</th>
                    <th className="text-left font-medium px-2 py-1.5 w-12">Side</th>
                    <th className="text-left font-medium px-2 py-1.5">Ticker</th>
                    <th className="text-right font-medium px-2 py-1.5">Qty</th>
                    <th className="text-right font-medium px-2 py-1.5">Price</th>
                    <th className="text-right font-medium px-2 py-1.5">Notional</th>
                    <th className="text-right font-medium px-2 py-1.5">Fees</th>
                    <th className="text-left font-medium px-2 py-1.5">Read</th>
                    <th className="text-left font-medium px-2 py-1.5">Account</th>
                  </tr>
                </thead>
                <tbody>
                  {grouped[date].map((fill) => {
                    const paired = pairedById.get(fill.id)
                    const r = paired?.rMultiple
                    return (
                      <tr key={fill.id} className="border-t border-border/50">
                        <td className="px-2 py-1.5 text-sub tabular-nums">{formatTime(fill.fillTime)}</td>
                        <td className="px-2 py-1.5">
                          <span
                            className={`inline-block px-1 py-0.5 rounded text-[10px] font-semibold ${
                              fill.action === 'BUY'
                                ? 'bg-teal/15 text-teal'
                                : 'bg-red-500/15 text-red-400'
                            }`}
                          >
                            {fill.action}
                          </span>
                        </td>
                        <td className="px-2 py-1.5 font-semibold text-text">
                          <Link
                            href={`/symbol/${encodeURIComponent(fill.ticker)}`}
                            className="hover:text-teal transition-colors"
                          >
                            {fill.ticker}
                          </Link>
                        </td>
                        <td className="px-2 py-1.5 text-right text-sub tabular-nums">
                          {fill.qty.toLocaleString('en-US')}
                        </td>
                        <td className="px-2 py-1.5 text-right text-sub tabular-nums">
                          {formatMoney(fill.price)}
                        </td>
                        <td className="px-2 py-1.5 text-right text-text tabular-nums">
                          {formatMoney(fill.amount)}
                        </td>
                        <td className="px-2 py-1.5 text-right text-gray tabular-nums">
                          {fill.commission + fill.fees > 0
                            ? formatMoney(fill.commission + fill.fees)
                            : '—'}
                        </td>
                        <td className="px-2 py-1.5">
                          {paired?.pairedReadId ? (
                            <span
                              className={`inline-flex items-center gap-1 text-[11px] tabular-nums ${
                                r != null && r > 0
                                  ? 'text-teal'
                                  : r != null && r < 0
                                  ? 'text-red-400'
                                  : 'text-sub'
                              }`}
                            >
                              paired{r != null && <> · {formatR(r)}</>}
                            </span>
                          ) : (
                            <span className="text-[11px] text-gray">—</span>
                          )}
                        </td>
                        <td className="px-2 py-1.5 text-gray truncate max-w-[140px]">
                          {fill.accountName ?? '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function RoundTripCard({ trip }: { trip: RoundTrip }) {
  const [open, setOpen] = useState(false)
  const pnl = trip.realizedPnL
  const pnlTone = pnl == null ? 'text-sub' : pnl > 0 ? 'text-teal' : pnl < 0 ? 'text-red-400' : 'text-sub'

  return (
    <details
      className="bg-surface border border-border rounded-lg overflow-hidden group hover:border-border-hover"
      onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}
    >
      <summary className="list-none cursor-pointer px-3 py-2.5 select-none [&::-webkit-details-marker]:hidden">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Link
              href={`/symbol/${encodeURIComponent(trip.ticker)}`}
              onClick={(e) => e.stopPropagation()}
              className="text-sm font-bold text-text hover:text-teal tabular-nums"
            >
              {trip.ticker}
            </Link>
            <span
              className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                trip.side === 'long'
                  ? 'bg-teal/15 text-teal'
                  : 'bg-red-500/15 text-red-400'
              }`}
            >
              {trip.side.toUpperCase()}
            </span>
            {trip.isOpen && (
              <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold bg-yellow-500/15 text-yellow-400">
                OPEN
              </span>
            )}
            {trip.pairedReadId && (
              <span
                className="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold bg-teal/15 text-teal"
                title="Paired to pre-trade Brooks read"
              >
                paired
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 shrink-0 text-xs tabular-nums">
            <span className="text-sub">{trip.qty} sh</span>
            {pnl != null ? (
              <span className={`font-semibold ${pnlTone}`}>{formatMoney(pnl)}</span>
            ) : (
              <span className="text-gray">—</span>
            )}
            {trip.returnPct != null && (
              <span className={`${pnlTone}`}>{formatPct(trip.returnPct)}</span>
            )}
          </div>
        </div>
        <div className="flex items-center justify-between gap-2 mt-1 text-[11px] text-sub tabular-nums">
          <span className="truncate">
            {formatDateTime(trip.entryTime)} @ ${trip.entryPrice.toFixed(2)}
            {trip.exitTime && (
              <>
                {' → '}
                {formatDateTime(trip.exitTime)} @ ${trip.exitPrice?.toFixed(2)}
              </>
            )}
          </span>
          {trip.durationMs != null && (
            <span className="text-gray shrink-0">{formatDuration(trip.durationMs)}</span>
          )}
        </div>
      </summary>

      {open && <ExpandedBody trip={trip} />}
    </details>
  )
}

function ExpandedBody({ trip }: { trip: RoundTrip }) {
  const [showBrooks, setShowBrooks] = useState(false)
  const chartHref = `/chart?symbol=${encodeURIComponent(trip.ticker)}`
  return (
    <div className="border-t border-border p-3 space-y-3 animate-[fadeIn_0.15s_ease]">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="text-[10px] uppercase tracking-wider text-sub">
          {trip.pairedReadId ? 'Chart + Brooks analysis' : 'Chart'}
        </span>
        <div className="flex items-center gap-2">
          <Link
            href={chartHref}
            target="_blank"
            rel="noopener"
            className="px-2.5 py-1 rounded text-[11px] font-semibold border border-teal/40 text-teal hover:bg-teal/10 transition-colors"
            title="Open this ticker in the full chart terminal"
          >
            Open in /chart →
          </Link>
          <button
            onClick={() => setShowBrooks((v) => !v)}
            aria-pressed={showBrooks}
            title={
              trip.pairedReadId
                ? 'Toggle the Brooks read + execution grade'
                : 'No paired read — click to see why'
            }
            className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-colors border ${
              showBrooks
                ? 'bg-teal/20 text-teal border-teal/40'
                : 'border-border text-sub hover:text-text hover:border-teal/30'
            }`}
          >
            {showBrooks ? 'Hide Brooks analysis' : 'Brooks analysis'}
          </button>
        </div>
      </div>
      {showBrooks && <BrooksAnalysisPanel trip={trip} />}
      <RoundTripChart trip={trip} />
    </div>
  )
}

function RoundTripChart({ trip }: { trip: RoundTrip }) {
  const from = trip.entryTime.slice(0, 10)
  const to = trip.exitTime ? trip.exitTime.slice(0, 10) : new Date().toISOString().slice(0, 10)
  const entryTs = Math.floor(new Date(trip.entryTime).getTime() / 1000)
  const exitTs = trip.exitTime ? Math.floor(new Date(trip.exitTime).getTime() / 1000) : null
  const direction = trip.side === 'long' ? 'long' : 'short'
  const annotations = {
    entryPrice: trip.entryPrice,
    exitPrice: trip.exitPrice ?? undefined,
    entryMarker: { time: entryTs, direction: direction as 'long' | 'short' },
    exitMarker:
      exitTs != null
        ? { time: exitTs, direction: (direction === 'long' ? 'short' : 'long') as 'long' | 'short' }
        : undefined,
  }
  return (
    <BarsChart
      ticker={trip.ticker}
      from={from}
      to={to}
      annotations={annotations}
      label={`Chart · ${trip.ticker}`}
      showEma
    />
  )
}
