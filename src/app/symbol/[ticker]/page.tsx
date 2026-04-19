'use client'

import { use, useEffect, useState } from 'react'
import Link from 'next/link'
import type {
  FilledTrade,
  FilledTradesPayload,
  JournalEntry,
  JournalPayload,
  ScanPayload,
  ScanResult,
  TradeRead,
  TradesPayload,
} from '@/lib/types'
import { ScannerCard } from '@/components/scanner/ScannerCard'
import { TradeCard } from '@/components/trades/TradeCard'
import { JournalCard } from '@/components/journal/JournalCard'

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

export default function SymbolPage({ params }: { params: Promise<{ ticker: string }> }) {
  const { ticker: rawTicker } = use(params)
  const ticker = decodeURIComponent(rawTicker).toUpperCase()

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
  const sortedTrades = [...trades].sort((a, b) => b.date.localeCompare(a.date))

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

      {!hasAnything && (
        <div className="flex items-center justify-center py-20">
          <div className="text-center max-w-md">
            <div className="text-lg text-sub mb-2">No data for {ticker}</div>
            <p className="text-xs text-sub mb-4">
              This symbol has no scanner hits today, no Brooks reads, no broker fills,
              and no journal entries linked to it.
            </p>
            <Link href="/journal" className="text-xs text-teal hover:text-teal/80">
              &larr; Back to Journal
            </Link>
          </div>
        </div>
      )}

      {/* Scanner snapshot (today) */}
      {scanner && (
        <section className="mb-6">
          <SectionHeader
            label="Current scanner state"
            hint={scanDate ? `From ${scanDate} scan` : undefined}
          />
          <ScannerCard result={scanner} />
        </section>
      )}

      {/* Trade reads (with charts) */}
      {sortedTrades.length > 0 && (
        <section className="mb-6">
          <SectionHeader
            label="Brooks trade reads"
            hint={`${sortedTrades.length} read${sortedTrades.length === 1 ? '' : 's'}`}
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
