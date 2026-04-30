'use client'

import { use, useEffect, useState } from 'react'
import Link from 'next/link'
import type { DailySnapshot, ScanResult } from '@/lib/types'
import { ScannerCard } from '@/components/scanner/ScannerCard'
import { SortBar, sortResults, type SortKey } from '@/components/scanner/SortBar'

export default function HistoryDatePage({ params }: { params: Promise<{ date: string }> }) {
  const { date } = use(params)
  const [snapshot, setSnapshot] = useState<DailySnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [sortKey, setSortKey] = useState<SortKey>('rank')

  useEffect(() => {
    fetch(`/api/scan/history?date=${date}`)
      .then((r) => {
        if (!r.ok) throw new Error('Not found')
        return r.json()
      })
      .then((data: DailySnapshot) => {
        setSnapshot(data)
        setLoading(false)
      })
      .catch(() => {
        setError(true)
        setLoading(false)
      })
  }, [date])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100dvh-var(--nav-h))]">
        <div className="text-sub text-sm">Loading {date}...</div>
      </div>
    )
  }

  if (error || !snapshot) {
    return (
      <div className="flex items-center justify-center h-[calc(100dvh-var(--nav-h))]">
        <div className="text-center">
          <div className="text-lg text-sub mb-2">No data for {date}</div>
          <Link href="/history" className="text-sm text-teal hover:text-teal/80">
            Back to History
          </Link>
        </div>
      </div>
    )
  }

  const { payload } = snapshot
  const sorted: ScanResult[] = sortResults(payload.results, sortKey)
  const d = new Date(date + 'T12:00:00')
  const formatted = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })

  return (
    <div className="max-w-5xl mx-auto px-3 py-3">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-[11px] text-sub mb-3">
        <Link href="/history" className="hover:text-text transition-colors">History</Link>
        <span className="text-gray">/</span>
        <span className="text-text/70">{date}</span>
      </div>

      {/* Header */}
      <header className="flex flex-col gap-1 sm:flex-row sm:justify-between sm:items-baseline sm:gap-0 mb-3 pb-2 border-b border-border">
        <h1 className="text-[17px] font-bold tracking-tight">{formatted}</h1>
        <div className="text-xs text-sub sm:text-right">
          Captured {payload.timestamp}
        </div>
      </header>

      {/* Stats */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-sub mb-3">
        <span>{payload.symbolsScanned.toLocaleString()} symbols</span>
        <span>{payload.passedFilters} passed filters</span>
        <span>{payload.results.length} signals</span>
        {payload.scanTime && <span>{payload.scanTime}</span>}
      </div>

      {/* Sort bar */}
      <SortBar onSort={setSortKey} activeKey={sortKey} />

      {/* Cards */}
      <div>
        {sorted.map((result) => (
          <ScannerCard key={result.ticker} result={result} scanDate={date} />
        ))}
      </div>

      {/* Nav */}
      <footer className="mt-4 pt-2 border-t border-border text-center">
        <Link href="/history" className="text-xs text-teal hover:text-teal/80">
          &larr; All dates
        </Link>
      </footer>
    </div>
  )
}
