'use client'

import { use, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import type { ChartData, JournalEntry, ScanPayload, ScanResult, TradeRead } from '@/lib/types'
import { ScannerCard } from '@/components/scanner/ScannerCard'
import { TradeCard } from '@/components/trades/TradeCard'
import { JournalTimeline } from '@/components/journal/JournalTimeline'
import { LightweightChart } from '@/components/charts/LightweightChart'

export default function SymbolPage({ params }: { params: Promise<{ ticker: string }> }) {
  const { ticker: rawTicker } = use(params)
  const ticker = decodeURIComponent(rawTicker).toUpperCase()

  const [scan, setScan] = useState<ScanResult | null>(null)
  const [scanTimestamp, setScanTimestamp] = useState<string>('')
  const [trades, setTrades] = useState<TradeRead[]>([])
  const [journal, setJournal] = useState<JournalEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      fetch('/api/scan').then((r) => r.json()).catch(() => null),
      fetch(`/api/trades?ticker=${encodeURIComponent(ticker)}`).then((r) => r.json()).catch(() => null),
      fetch('/api/journal').then((r) => r.json()).catch(() => null),
    ]).then(([scanData, tradesData, journalData]: [ScanPayload | null, { trades: TradeRead[] } | null, { entries: JournalEntry[] } | null]) => {
      if (scanData) {
        const match = scanData.results?.find((r) => r.ticker.toUpperCase() === ticker) ?? null
        setScan(match)
        setScanTimestamp(scanData.timestamp ? `${scanData.timestamp} · ${scanData.date}` : '')
      }
      if (tradesData?.trades) {
        setTrades(tradesData.trades)
      }
      if (journalData?.entries) {
        const tickerRe = new RegExp(`\\b${ticker}\\b`)
        const related = journalData.entries.filter((e) => {
          if (e.linkedTickers?.some((t) => t.toUpperCase() === ticker)) return true
          if (tickerRe.test(e.title)) return true
          if (tickerRe.test(e.content)) return true
          return false
        })
        setJournal(related)
      }
      setLoading(false)
    })
  }, [ticker])

  const heroChart = useMemo<{ chart: ChartData; source: string } | null>(() => {
    if (scan?.chart && scan.chart.bars?.length) {
      return { chart: scan.chart, source: scanTimestamp ? `Scanner · ${scanTimestamp}` : 'Scanner' }
    }
    const mostRecentTrade = trades
      .filter((t) => t.chart && t.chart.bars && t.chart.bars.length > 0)
      .slice()
      .sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time))[0]
    if (mostRecentTrade?.chart) {
      return { chart: mostRecentTrade.chart, source: `Trade read · ${mostRecentTrade.date} ${mostRecentTrade.time}` }
    }
    return null
  }, [scan, trades, scanTimestamp])

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto p-6">
        <div className="skeleton h-6 w-32 mb-3" />
        <div className="skeleton h-8 w-48 mb-4" />
        <div className="skeleton h-40 mb-4" />
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => <div key={i} className="skeleton h-12" />)}
        </div>
      </div>
    )
  }

  const hasAnything = scan || trades.length > 0 || journal.length > 0

  return (
    <div className="max-w-5xl mx-auto px-3 py-3">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-[11px] text-sub mb-3">
        <Link href="/journal" className="hover:text-text transition-colors">Journal</Link>
        <span className="text-gray">/</span>
        <span className="text-text/70">{ticker}</span>
      </div>

      {/* Header */}
      <header className="flex flex-col gap-1 sm:flex-row sm:justify-between sm:items-baseline sm:gap-0 mb-3 pb-2 border-b border-border">
        <h1 className="text-[17px] font-bold tracking-tight">{ticker}</h1>
        {scanTimestamp && (
          <div className="text-xs text-sub sm:text-right">Scanner: {scanTimestamp}</div>
        )}
      </header>

      {!hasAnything && (
        <div className="text-center py-16 text-sub">
          <p className="text-sm mb-1">Nothing to show for {ticker}.</p>
          <p className="text-[11px] text-gray">
            No current scanner result, no trade reads, and no journal entries mention this symbol.
          </p>
        </div>
      )}

      {/* Hero chart — surfaced up-front so a click from Journal lands on the chart, not a collapsed card */}
      {heroChart && (
        <section className="mb-5">
          <div className="flex items-baseline justify-between mb-2">
            <h2 className="text-[11px] uppercase tracking-wider text-sub font-semibold">Chart</h2>
            <span className="text-[10px] text-gray">{heroChart.source}</span>
          </div>
          <div className="bg-surface border border-border rounded-lg p-2">
            <LightweightChart chart={heroChart.chart} height={360} />
          </div>
        </section>
      )}

      {/* Current scanner card */}
      {scan && (
        <section className="mb-5">
          <h2 className="text-[11px] uppercase tracking-wider text-sub mb-2 font-semibold">Current scan</h2>
          <ScannerCard result={scan} />
        </section>
      )}

      {/* Related trades */}
      {trades.length > 0 && (
        <section className="mb-5">
          <h2 className="text-[11px] uppercase tracking-wider text-sub mb-2 font-semibold">
            Trade reads <span className="text-gray">({trades.length})</span>
          </h2>
          {trades
            .slice()
            .sort((a, b) => b.date.localeCompare(a.date))
            .map((t) => (
              <TradeCard key={t.id} trade={t} />
            ))}
        </section>
      )}

      {/* Related journal entries */}
      {journal.length > 0 && (
        <section className="mb-5">
          <h2 className="text-[11px] uppercase tracking-wider text-sub mb-2 font-semibold">
            Journal mentions <span className="text-gray">({journal.length})</span>
          </h2>
          <JournalTimeline entries={journal} />
        </section>
      )}
    </div>
  )
}
