'use client'

import { useEffect, useState } from 'react'
import type { JournalEntry } from '@/lib/types'
import { JournalTimeline } from '@/components/journal/JournalTimeline'
import { BrokerPanel } from '@/components/journal/BrokerPanel'
import { FillsTable } from '@/components/journal/FillsTable'
import { TradesTab } from '@/components/journal/TradesTab'

type EntryTab = '' | 'daily_read' | 'mistake' | 'lesson' | 'audit_note'
type TopTab = 'entries' | 'broker' | 'fills' | 'trades'

const ENTRY_TABS: { key: EntryTab; label: string }[] = [
  { key: '', label: 'All' },
  { key: 'daily_read', label: 'Daily Reads' },
  { key: 'mistake', label: 'Mistakes' },
  { key: 'lesson', label: 'Lessons' },
  { key: 'audit_note', label: 'Audit Notes' },
]

const TOP_TABS: { key: TopTab; label: string }[] = [
  { key: 'entries', label: 'Bot Blog' },
  { key: 'broker', label: 'Broker' },
  { key: 'fills', label: 'Fills' },
  { key: 'trades', label: 'Trades' },
]

export default function JournalPage() {
  const [entries, setEntries] = useState<JournalEntry[]>([])
  const [loadingEntries, setLoadingEntries] = useState(true)
  const [topTab, setTopTab] = useState<TopTab>(() => {
    if (typeof window === 'undefined') return 'entries'
    const params = new URLSearchParams(window.location.search)
    if (params.get('broker') === 'connected') return 'broker'
    return 'entries'
  })
  const [entryTab, setEntryTab] = useState<EntryTab>('')

  useEffect(() => {
    fetch('/api/journal')
      .then((r) => r.json())
      .then((data) => {
        setEntries(data.entries || [])
        setLoadingEntries(false)
      })
      .catch(() => setLoadingEntries(false))
  }, [])

  const filtered = entryTab ? entries.filter((e) => e.type === entryTab) : entries

  const counts = entries.reduce((acc, e) => {
    acc[e.type] = (acc[e.type] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  return (
    <div className="max-w-5xl mx-auto p-6">
      <h1 className="text-2xl font-bold text-text mb-1">Journal</h1>
      <p className="text-sm text-sub mb-4">
        Lessons, mistakes, daily reads — and auto-logged broker fills.
      </p>

      {/* Top-level section tabs */}
      <div className="flex gap-1 mb-4 border-b border-border pb-2 overflow-x-auto scrollbar-none">
        {TOP_TABS.map((tab) => {
          const active = topTab === tab.key
          return (
            <button
              key={tab.key}
              onClick={() => setTopTab(tab.key)}
              className={`px-3 py-1.5 rounded-t text-sm font-medium transition-colors ${
                active
                  ? 'bg-teal/10 text-teal border-b-2 border-teal'
                  : 'text-sub hover:text-text'
              }`}
            >
              {tab.label}
            </button>
          )
        })}
      </div>

      {topTab === 'broker' && <BrokerPanel />}

      {topTab === 'fills' && <FillsTable />}

      {topTab === 'trades' && <TradesTab />}

      {topTab === 'entries' && (
        <EntriesSection
          entries={entries}
          filtered={filtered}
          counts={counts}
          entryTab={entryTab}
          setEntryTab={setEntryTab}
          loading={loadingEntries}
        />
      )}
    </div>
  )
}

interface EntriesSectionProps {
  entries: JournalEntry[]
  filtered: JournalEntry[]
  counts: Record<string, number>
  entryTab: EntryTab
  setEntryTab: (t: EntryTab) => void
  loading: boolean
}

function EntriesSection({
  entries,
  filtered,
  counts,
  entryTab,
  setEntryTab,
  loading,
}: EntriesSectionProps) {
  if (loading) {
    return (
      <div>
        <div className="flex gap-2 mb-6">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="skeleton h-8 w-20" />
          ))}
        </div>
        <div className="space-y-2">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="skeleton h-12" />
          ))}
        </div>
      </div>
    )
  }

  if (entries.length === 0) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center max-w-md">
          <div className="text-xl mb-3 text-sub">No journal entries yet</div>
          <p className="text-sm text-sub">
            Lessons, mistakes, and daily reads will appear here after syncing.
          </p>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="flex gap-1 mb-6 border-b border-border pb-2 overflow-x-auto scrollbar-none">
        {ENTRY_TABS.map((tab) => {
          const count = tab.key ? counts[tab.key] ?? 0 : entries.length
          const active = entryTab === tab.key

          return (
            <button
              key={tab.key}
              onClick={() => setEntryTab(tab.key)}
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

      <JournalTimeline entries={filtered} emptyMessage={emptyMessageFor(entryTab)} />
    </>
  )
}

function emptyMessageFor(tab: EntryTab): string {
  switch (tab) {
    case 'daily_read':
      return 'No daily reads synced yet. Source: structured pre-market / EOD read notes (pipeline TBD).'
    case 'mistake':
      return 'No mistakes logged yet. Source: mistake journal entries (pipeline TBD).'
    case 'lesson':
      return 'No lessons yet. Lessons come from ~/code/aiedge/self-eval/lessons.md via scripts/sync_trades.py.'
    case 'audit_note':
      return 'No audit notes yet. Audit notes come from SUMMARY_REPORT.md in ~/code/aiedge/audits/ via scripts/sync_trades.py.'
    default:
      return 'Nothing here yet.'
  }
}
