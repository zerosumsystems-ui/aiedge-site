'use client'

import type { JournalEntry, JournalEntryType } from '@/lib/types'
import { JournalCard } from './JournalCard'

const TYPE_PRIORITY: Record<JournalEntryType, number> = {
  daily_read: 0,
  mistake: 1,
  lesson: 2,
  audit_note: 3,
}

interface JournalTimelineProps {
  entries: JournalEntry[]
}

export function JournalTimeline({ entries }: JournalTimelineProps) {
  // Group by date
  const grouped = entries.reduce((acc, entry) => {
    if (!acc[entry.date]) acc[entry.date] = []
    acc[entry.date].push(entry)
    return acc
  }, {} as Record<string, JournalEntry[]>)

  // Sort dates descending
  const sortedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a))

  // Sort entries within each date by type priority
  for (const date of sortedDates) {
    grouped[date].sort((a, b) => TYPE_PRIORITY[a.type] - TYPE_PRIORITY[b.type])
  }

  return (
    <div className="space-y-6">
      {sortedDates.map((date) => {
        const d = new Date(date + 'T12:00:00')
        const dayName = d.toLocaleDateString('en-US', { weekday: 'long' })
        const monthDay = d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

        return (
          <div key={date}>
            <div className="flex items-baseline gap-2 mb-2">
              <h2 className="text-sm font-semibold text-text">{dayName}</h2>
              <span className="text-xs text-sub">{monthDay}</span>
              <span className="text-[10px] text-gray">{grouped[date].length} entries</span>
            </div>
            <div>
              {grouped[date].map((entry) => (
                <JournalCard key={entry.id} entry={entry} />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
