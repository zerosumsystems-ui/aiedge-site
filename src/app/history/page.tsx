'use client'

import { Suspense } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { HistorySnapshots } from '@/components/history/HistorySnapshots'
import { HistoryAnalogs } from '@/components/history/HistoryAnalogs'

type Tab = 'snapshots' | 'analogs'

const TABS: { id: Tab; label: string; sublabel: string }[] = [
  { id: 'snapshots', label: 'Snapshots',
    sublabel: 'End-of-day scan results, captured nightly.' },
  { id: 'analogs',   label: 'Analogs',
    sublabel: 'Past mornings whose first 6 bars match a chosen day.' },
]

function parseTab(raw: string | null): Tab {
  return raw === 'analogs' ? 'analogs' : 'snapshots'
}

export default function HistoryPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-[calc(100dvh-var(--nav-h))]">
        <div className="text-sub text-sm">Loading...</div>
      </div>
    }>
      <HistoryPageInner />
    </Suspense>
  )
}

function HistoryPageInner() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const tab = parseTab(searchParams.get('tab'))

  const setTab = (next: Tab) => {
    const params = new URLSearchParams(searchParams.toString())
    if (next === 'snapshots') params.delete('tab')
    else params.set('tab', next)
    const qs = params.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }

  const active = TABS.find((t) => t.id === tab) ?? TABS[0]

  return (
    <div className="max-w-5xl mx-auto p-6">
      <header className="mb-4">
        <h1 className="text-2xl font-bold text-text">History</h1>
      </header>

      {/* Tab switcher */}
      <div role="tablist" aria-label="History views" className="flex gap-1 border-b border-border mb-4">
        {TABS.map((t) => {
          const isActive = t.id === tab
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={isActive}
              onClick={() => setTab(t.id)}
              className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                isActive
                  ? 'border-teal text-teal'
                  : 'border-transparent text-sub hover:text-text'
              }`}
            >
              {t.label}
            </button>
          )
        })}
      </div>

      <p className="text-xs text-sub mb-4">{active.sublabel}</p>

      {tab === 'snapshots' ? <HistorySnapshots /> : <HistoryAnalogs />}
    </div>
  )
}
