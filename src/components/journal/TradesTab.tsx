'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import type {
  Bar,
  ChartData,
  ChartTimeframe,
  FilledTradesPayload,
  RoundTrip,
} from '@/lib/types'
import { LightweightChart } from '@/components/charts/LightweightChart'

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

  if (trips.length === 0) {
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

  const filterTabs: { key: typeof filter; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: trips.length },
    { key: 'closed', label: 'Closed', count: trips.filter((t) => !t.isOpen).length },
    { key: 'open', label: 'Open', count: trips.filter((t) => t.isOpen).length },
    { key: 'paired', label: 'Paired', count: trips.filter((t) => t.pairedReadId != null).length },
    { key: 'orphan', label: 'No read', count: trips.filter((t) => t.pairedReadId == null && !t.isOpen).length },
  ]

  return (
    <div className="space-y-4">
      {/* Headline stats */}
      <div className="bg-surface border border-border rounded-lg p-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatBox label="Closed" value={String(closed.length)} />
        <StatBox
          label="Win rate"
          value={decisive > 0 ? `${(winRate * 100).toFixed(0)}%` : '—'}
          tone={winRate >= 0.5 ? 'good' : decisive > 0 ? 'bad' : 'neutral'}
        />
        <StatBox
          label="Total PnL"
          value={formatMoney(totalPnL)}
          tone={totalPnL > 0 ? 'good' : totalPnL < 0 ? 'bad' : 'neutral'}
        />
        <StatBox
          label="Avg W / L"
          value={
            wins + losses > 0
              ? `${avgWin > 0 ? formatMoney(avgWin) : '—'} / ${avgLoss > 0 ? formatMoney(avgLoss) : '—'}`
              : '—'
          }
        />
      </div>

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
        {/* Mobile: two rows. Desktop: one row. */}
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

      {open && (
        <div className="border-t border-border p-3 animate-[fadeIn_0.15s_ease]">
          <RoundTripChart trip={trip} />
        </div>
      )}
    </details>
  )
}

function RoundTripChart({ trip }: { trip: RoundTrip }) {
  const [chart, setChart] = useState<ChartData | null>(null)
  const [effectiveTf, setEffectiveTf] = useState<ChartTimeframe | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const from = trip.entryTime.slice(0, 10) // YYYY-MM-DD
    const to = trip.exitTime ? trip.exitTime.slice(0, 10) : new Date().toISOString().slice(0, 10)
    const qs = new URLSearchParams({ ticker: trip.ticker, from, to, tf: 'auto' })

    setLoading(true)
    setError(null)
    fetch(`/api/bars?${qs}`)
      .then(async (r) => {
        const data = await r.json()
        if (!r.ok) throw new Error(data.error ?? `bars fetch ${r.status}`)
        return data as {
          bars: Bar[]
          timeframe: ChartTimeframe
          effectiveTimeframe: ChartTimeframe
        }
      })
      .then((data) => {
        const entryTs = Math.floor(new Date(trip.entryTime).getTime() / 1000)
        const exitTs = trip.exitTime ? Math.floor(new Date(trip.exitTime).getTime() / 1000) : null
        const direction = trip.side === 'long' ? 'long' : 'short'
        setChart({
          bars: data.bars,
          timeframe: data.effectiveTimeframe,
          annotations: {
            entryPrice: trip.entryPrice,
            exitPrice: trip.exitPrice ?? undefined,
            entryMarker: { time: entryTs, direction },
            // Exit flips the direction for the marker shape
            exitMarker:
              exitTs != null
                ? { time: exitTs, direction: direction === 'long' ? 'short' : 'long' }
                : undefined,
          },
        })
        setEffectiveTf(data.effectiveTimeframe)
        setLoading(false)
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : String(err))
        setLoading(false)
      })
  }, [trip.ticker, trip.entryTime, trip.exitTime, trip.entryPrice, trip.exitPrice, trip.side])

  if (loading) {
    return <div className="skeleton h-[340px] w-full rounded" />
  }
  if (error || !chart || chart.bars.length === 0) {
    return (
      <div className="text-center py-12 text-sub text-xs">
        {error ? `Chart unavailable: ${error}` : 'No bars returned for this range.'}
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2 text-[10px] uppercase tracking-wider text-sub">
        <span>Chart · {trip.ticker}</span>
        <span className="text-gray">{effectiveTf} bars · Yahoo</span>
      </div>
      <LightweightChart chart={chart} height={340} />
    </div>
  )
}
