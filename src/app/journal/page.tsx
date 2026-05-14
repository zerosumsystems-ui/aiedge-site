'use client'

import { useState } from 'react'
import { BrokerPanel } from '@/components/journal/BrokerPanel'
import { TradesTab } from '@/components/journal/TradesTab'

type TopTab = 'trades' | 'broker'

const TOP_TABS: { key: TopTab; label: string }[] = [
  { key: 'trades', label: 'Trades' },
  { key: 'broker', label: 'Broker' },
]

export default function JournalPage() {
  const [topTab, setTopTab] = useState<TopTab>(() => {
    if (typeof window === 'undefined') return 'trades'
    const params = new URLSearchParams(window.location.search)
    if (params.get('broker') === 'connected') return 'broker'
    return 'trades'
  })

  return (
    <div className="max-w-5xl mx-auto p-6">
      <h1 className="text-2xl font-bold text-text mb-1">Journal</h1>
      <p className="text-sm text-sub mb-4">
        Auto-logged broker round-trips with per-setup expectancy and R-multiples.
      </p>

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
      {topTab === 'trades' && <TradesTab />}
    </div>
  )
}
