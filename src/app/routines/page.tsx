'use client'

import { useEffect, useMemo, useState } from 'react'
import type { RoutineStatus, RoutinesPayload } from '@/lib/types'

const STATUS_DOT: Record<RoutineStatus['status'], string> = {
  healthy: 'bg-teal',
  stale: 'bg-yellow',
  failed: 'bg-red',
  unknown: 'bg-sub/50',
}

const CATEGORY_ORDER: RoutineStatus['category'][] = [
  'scanner',
  'briefing',
  'videopipeline',
  'gaps',
  'sync',
  'other',
]

const CATEGORY_LABEL: Record<RoutineStatus['category'], string> = {
  scanner: 'Scanner',
  briefing: 'Briefing',
  videopipeline: 'Video Pipeline',
  gaps: 'Gap Scanner',
  sync: 'Sync',
  other: 'Other',
}

function formatRelative(iso: string | null): string {
  if (!iso) return '—'
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return '—'
  const diffMin = Math.floor((Date.now() - then) / 60_000)
  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  const diffDay = Math.floor(diffHr / 24)
  return `${diffDay}d ago`
}

export default function RoutinesPage() {
  const [data, setData] = useState<RoutinesPayload | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = () =>
      fetch('/api/routines', { cache: 'no-store' })
        .then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`)
          return r.json()
        })
        .then(setData)
        .catch((e) => setError(e.message))

    load()
    const id = setInterval(load, 60_000)
    return () => clearInterval(id)
  }, [])

  const grouped = useMemo(() => {
    if (!data) return [] as Array<{ category: RoutineStatus['category']; rows: RoutineStatus[] }>
    const buckets = new Map<RoutineStatus['category'], RoutineStatus[]>()
    for (const r of data.routines) {
      const list = buckets.get(r.category) ?? []
      list.push(r)
      buckets.set(r.category, list)
    }
    return CATEGORY_ORDER.filter((c) => buckets.has(c)).map((category) => ({
      category,
      rows: buckets.get(category)!,
    }))
  }, [data])

  if (error) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <h1 className="text-lg font-bold text-text mb-2">Routines</h1>
        <p className="text-red text-sm">Failed to load: {error}</p>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        <div className="skeleton h-8 w-40" />
        <div className="skeleton h-4 w-64" />
        <div className="skeleton h-32" />
        <div className="skeleton h-32" />
      </div>
    )
  }

  if (data.routines.length === 0) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <h1 className="text-lg font-bold text-text mb-2">Routines</h1>
        <p className="text-sub text-sm">
          No status yet. Run{' '}
          <code className="text-teal/80 font-mono text-xs">
            python3 scripts/sync/sync_routines.py https://aiedge.trade
          </code>
          .
        </p>
      </div>
    )
  }

  const overallCounts = data.routines.reduce(
    (acc, r) => {
      acc[r.status] += 1
      return acc
    },
    { healthy: 0, stale: 0, failed: 0, unknown: 0 } as Record<RoutineStatus['status'], number>,
  )

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
      <div>
        <h1 className="text-lg font-bold text-text">Routines</h1>
        <p className="text-xs text-sub mt-0.5">
          Autonomous system · synced {formatRelative(data.syncedAt)}
          {data.hostName ? ` · ${data.hostName}` : ''}
        </p>
        <div className="flex gap-3 mt-2 text-[11px]">
          <span className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${STATUS_DOT.healthy}`} />
            <span className="text-sub">{overallCounts.healthy} healthy</span>
          </span>
          {overallCounts.stale > 0 && (
            <span className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${STATUS_DOT.stale}`} />
              <span className="text-sub">{overallCounts.stale} stale</span>
            </span>
          )}
          {overallCounts.failed > 0 && (
            <span className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${STATUS_DOT.failed}`} />
              <span className="text-sub">{overallCounts.failed} failed</span>
            </span>
          )}
          {overallCounts.unknown > 0 && (
            <span className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${STATUS_DOT.unknown}`} />
              <span className="text-sub">{overallCounts.unknown} unknown</span>
            </span>
          )}
        </div>
      </div>

      {grouped.map(({ category, rows }) => (
        <section
          key={category}
          className="bg-surface border border-border rounded-lg overflow-hidden"
        >
          <div className="px-3 py-2 text-[10px] uppercase tracking-wider text-sub border-b border-border">
            {CATEGORY_LABEL[category]}
          </div>
          <ul className="divide-y divide-border">
            {rows.map((r) => (
              <li key={r.id} className="px-3 py-2.5 flex items-center gap-3">
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${STATUS_DOT[r.status]}`}
                  aria-label={r.status}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-text truncate">{r.label}</div>
                  <div className="text-[11px] text-sub truncate">{r.schedule}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-xs text-sub">{formatRelative(r.lastRunAt)}</div>
                  {r.outputSummary && (
                    <div className="text-[11px] text-text/80 mt-0.5 truncate max-w-[16ch]">
                      {r.outputSummary}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
