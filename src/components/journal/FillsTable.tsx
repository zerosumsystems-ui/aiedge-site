'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { FilledTrade, FilledTradesPayload } from '@/lib/types'

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

export function FillsTable() {
  const [payload, setPayload] = useState<FilledTradesPayload | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/snaptrade/sync')
      .then((r) => r.json())
      .then((data) => {
        setPayload(data as FilledTradesPayload)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="skeleton h-10 w-full" />
        ))}
      </div>
    )
  }

  const fills = payload?.fills ?? []

  if (fills.length === 0) {
    return (
      <div className="text-center py-16 text-sub text-sm">
        No fills yet. Connect a broker in the <strong>Broker</strong> tab and hit <em>Sync now</em>.
      </div>
    )
  }

  // Group by date DESC
  const grouped = fills.reduce((acc, fill) => {
    if (!acc[fill.date]) acc[fill.date] = []
    acc[fill.date].push(fill)
    return acc
  }, {} as Record<string, FilledTrade[]>)
  const sortedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a))

  // Sort fills within each date by fillTime DESC
  for (const date of sortedDates) {
    grouped[date].sort((a, b) => b.fillTime.localeCompare(a.fillTime))
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between text-xs text-sub">
        <span>
          {fills.length} fill{fills.length === 1 ? '' : 's'} across {sortedDates.length} day{sortedDates.length === 1 ? '' : 's'}
        </span>
        {payload?.syncedAt && (
          <span className="text-gray">
            Synced {new Date(payload.syncedAt).toLocaleString('en-US', { timeZone: 'America/New_York' })} ET
          </span>
        )}
      </div>

      {payload?.lastSyncError && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-300 text-xs rounded p-3">
          Last sync error: {payload.lastSyncError}
        </div>
      )}

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
            <div className="flex items-baseline gap-2 mb-2">
              <h2 className="text-sm font-semibold text-text">{dayName}</h2>
              <span className="text-xs text-sub">{monthDay}</span>
              <span className="text-[10px] text-gray">
                {grouped[date].length} fill{grouped[date].length === 1 ? '' : 's'}
              </span>
            </div>
            <div className="bg-surface border border-border rounded-lg overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-[var(--surface-alt,rgba(255,255,255,0.02))] text-gray">
                  <tr>
                    <th className="text-left font-medium px-3 py-2 w-20">Time</th>
                    <th className="text-left font-medium px-3 py-2 w-16">Side</th>
                    <th className="text-left font-medium px-3 py-2">Ticker</th>
                    <th className="text-right font-medium px-3 py-2">Qty</th>
                    <th className="text-right font-medium px-3 py-2">Price</th>
                    <th className="text-right font-medium px-3 py-2">Notional</th>
                    <th className="text-right font-medium px-3 py-2">Fees</th>
                    <th className="text-left font-medium px-3 py-2">Account</th>
                  </tr>
                </thead>
                <tbody>
                  {grouped[date].map((fill) => (
                    <tr key={fill.id} className="border-t border-border/50 hover:bg-[var(--surface-hover,rgba(255,255,255,0.02))]">
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
                      <td className="px-3 py-2 font-semibold text-text">
                        <Link
                          href={`/symbol/${encodeURIComponent(fill.ticker)}`}
                          className="hover:text-teal transition-colors"
                          title={`Open ${fill.ticker} — scanner + trades + journal`}
                        >
                          {fill.ticker}
                        </Link>
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
                      <td className="px-3 py-2 text-right text-gray tabular-nums">
                        {fill.commission + fill.fees > 0
                          ? formatMoney(fill.commission + fill.fees)
                          : '—'}
                      </td>
                      <td className="px-3 py-2 text-gray truncate max-w-[200px]">
                        {fill.accountName ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      })}
    </div>
  )
}
