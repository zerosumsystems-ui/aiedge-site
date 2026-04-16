'use client'

import { useEffect, useState } from 'react'
import type { JournalEntry, JournalEntryType } from '@/lib/types'
import { JournalTimeline } from '@/components/journal/JournalTimeline'

const TABS: { key: string; label: string }[] = [
  { key: '', label: 'All' },
  { key: 'daily_read', label: 'Daily Reads' },
  { key: 'mistake', label: 'Mistakes' },
  { key: 'lesson', label: 'Lessons' },
  { key: 'audit_note', label: 'Audit Notes' },
]

export default function JournalPage() {
  const [entries, setEntries] = useState<JournalEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('')

  useEffect(() => {
    fetch('/api/journal')
      .then((r) => r.json())
      .then((data) => {
        setEntries(data.entries || [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const filtered = activeTab
    ? entries.filter((e) => e.type === activeTab)
    : entries

  // Count per type for tab badges
  const counts = entries.reduce((acc, e) => {
    acc[e.type] = (acc[e.type] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-48px)]">
        <div className="text-sub text-sm">Loading journal...</div>
      </div>
    )
  }

  if (entries.length === 0) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-48px)]">
        <div className="text-center max-w-md">
          <div className="text-2xl mb-3 text-sub">No journal entries yet</div>
          <p className="text-sm text-sub">
            Lessons, mistakes, and daily reads will appear here after syncing.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto p-6">
      <h1 className="text-2xl font-bold text-text mb-1">Journal</h1>
      <p className="text-sm text-sub mb-4">Lessons, mistakes, and daily reads</p>

      {/* Type tabs */}
      <div className="flex gap-1 mb-6 border-b border-border pb-2">
        {TABS.map((tab) => {
          const count = tab.key ? (counts[tab.key] || 0) : entries.length
          const active = activeTab === tab.key

          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-3 py-1.5 rounded-t text-xs font-medium transition-colors ${
                active
                  ? 'bg-teal/10 text-teal border-b-2 border-teal'
                  : 'text-sub hover:text-text'
              }`}
            >
              {tab.label}
              <span className={`ml-1.5 text-[10px] ${active ? 'text-teal/70' : 'text-gray'}`}>
                {count}
              </span>
            </button>
          )
        })}
      </div>

      <JournalTimeline entries={filtered} />
    </div>
  )
}
