'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

interface DateEntry {
  date: string
  capturedAt: string
  symbolsScanned: number
  passedFilters: number
  resultCount: number
}

/** Existing /history list — past scan dates, each linking to the per-day
 *  /history/<date> snapshot view. Extracted out of the page so /history can
 *  render either this OR the analog matcher in the same shell. */
export function HistorySnapshots() {
  const [dates, setDates] = useState<DateEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/scan/history')
      .then((r) => r.json())
      .then((data) => {
        setDates(data.dates || [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-sub text-sm">Loading history...</div>
      </div>
    )
  }

  if (dates.length === 0) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center max-w-md px-4">
          <div className="text-2xl mb-3 text-sub">No history yet</div>
          <p className="text-sm text-sub">
            End-of-day scan results live here. Capture today&apos;s with:
          </p>
          <pre className="text-[11px] bg-bg border border-border rounded p-3 mt-3 overflow-x-auto text-left">
            python3 scripts/capture_eod.py https://www.aiedge.trade
          </pre>
          <p className="text-xs text-sub mt-3">
            Or schedule it as a cron job for automatic nightly capture.
          </p>
        </div>
      </div>
    )
  }

  return (
    <>
      <p className="text-sm text-sub mb-6">{dates.length} trading days captured</p>

      <div className="space-y-2">
        {dates.map((entry) => {
          const d = new Date(entry.date + 'T12:00:00')
          const dayName = d.toLocaleDateString('en-US', { weekday: 'short' })
          const monthDay = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

          return (
            <Link
              key={entry.date}
              href={`/history/${entry.date}`}
              className="flex items-center gap-4 p-4 bg-surface rounded-lg border border-border hover:border-teal/30 transition-colors group"
            >
              <div className="text-center w-16 shrink-0">
                <div className="text-[10px] uppercase tracking-wider text-sub">{dayName}</div>
                <div className="text-lg font-bold text-text">{monthDay}</div>
                <div className="text-[10px] text-gray">{entry.date.split('-')[0]}</div>
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 text-sm">
                  <span className="text-text">{entry.resultCount} signals</span>
                  <span className="text-gray">&middot;</span>
                  <span className="text-sub">{entry.passedFilters} passed filters</span>
                  <span className="text-gray">&middot;</span>
                  <span className="text-sub">{entry.symbolsScanned} scanned</span>
                </div>
              </div>

              <div className="text-xs text-gray group-hover:text-teal transition-colors">
                View &rarr;
              </div>
            </Link>
          )
        })}
      </div>
    </>
  )
}
