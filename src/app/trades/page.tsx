'use client'

import { useEffect, useState } from 'react'
import type { TradeRead } from '@/lib/types'
import { TradeCard } from '@/components/trades/TradeCard'
import { TradeFilters } from '@/components/trades/TradeFilters'
import { TradeStats } from '@/components/trades/TradeStats'

export default function TradesPage() {
  const [allTrades, setAllTrades] = useState<TradeRead[]>([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({
    setup: '',
    phase: '',
    decision: '',
    agreement: '',
  })

  useEffect(() => {
    fetch('/api/trades')
      .then((r) => r.json())
      .then((data) => {
        setAllTrades(data.trades || [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const handleFilterChange = (key: string, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }))
  }

  const filtered = allTrades.filter((t) => {
    if (filters.setup && t.setupBrooks !== filters.setup) return false
    if (filters.phase && t.phaseBrooks !== filters.phase) return false
    if (filters.decision && t.decisionBrooks !== filters.decision) return false
    if (filters.agreement && t.agreementVsScanner !== filters.agreement) return false
    return true
  })

  // Sort by date desc, then quality desc
  const sorted = [...filtered].sort((a, b) => {
    const dateCmp = b.date.localeCompare(a.date)
    if (dateCmp !== 0) return dateCmp
    return b.qualityScore - a.qualityScore
  })

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-48px)]">
        <div className="text-sub text-sm">Loading trades...</div>
      </div>
    )
  }

  if (allTrades.length === 0) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-48px)]">
        <div className="text-center max-w-md">
          <div className="text-2xl mb-3 text-sub">No trades yet</div>
          <p className="text-sm text-sub">
            Trade reads from Brooks audits will appear here after syncing.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-bold text-text mb-1">Trade Catalog</h1>
      <p className="text-sm text-sub mb-4">Brooks reads with scanner comparison</p>

      <TradeStats trades={filtered} />

      <div className="bg-surface border border-border rounded-lg p-3 mb-4">
        <TradeFilters
          trades={allTrades}
          filters={filters}
          onFilterChange={handleFilterChange}
          resultCount={filtered.length}
        />
      </div>

      <div>
        {sorted.map((trade) => (
          <TradeCard key={trade.id} trade={trade} />
        ))}
      </div>
    </div>
  )
}
