'use client'

import { use, useEffect, useState } from 'react'
import Link from 'next/link'
import type { PatternLabPayload } from '@/lib/types'
import { PatternLabView } from '@/components/patterns/PatternLabView'

function parseSymbols(s: string | undefined | null): string[] {
  if (!s) return []
  try {
    const parsed = JSON.parse(s)
    return Array.isArray(parsed) ? (parsed as string[]) : []
  } catch {
    return s.split(',').map((x) => x.trim()).filter(Boolean)
  }
}

export default function PatternRunPage({
  params,
}: {
  params: Promise<{ runId: string }>
}) {
  const { runId } = use(params)
  const [data, setData] = useState<PatternLabPayload | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/patterns/run/${encodeURIComponent(runId)}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then(setData)
      .catch((e) => setError(e.message))
  }, [runId])

  if (error) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-lg font-bold text-text mb-2">Backtest Run</h1>
        <p className="text-red text-sm">Failed to load: {error}</p>
        <Link href="/patterns" className="text-sm text-teal hover:text-teal/80">
          ← Back to Pattern Lab
        </Link>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-lg font-bold text-text mb-2">Backtest Run</h1>
        <p className="text-sub text-sm">Loading run {runId}...</p>
      </div>
    )
  }

  const run = data.run
  const hasData = data.summary.totalDetections > 0

  if (!hasData && !run) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-2">
        <div className="flex items-center gap-3">
          <Link href="/patterns" className="text-sm text-teal hover:text-teal/80">
            ← Back
          </Link>
          <h1 className="text-lg font-bold text-text">Backtest Run</h1>
        </div>
        <p className="text-sub text-sm">
          No data for run <code className="font-mono">{runId}</code>. Push results with:
        </p>
        <pre className="text-[11px] bg-bg border border-border rounded p-3 overflow-x-auto">
          python3 pattern_lab_api.py --push-run {runId}
        </pre>
      </div>
    )
  }

  const symbols = parseSymbols(run?.symbols)

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="space-y-1">
        <div className="flex items-center gap-3">
          <Link href="/patterns" className="text-xs text-teal hover:text-teal/80">
            ← Pattern Lab
          </Link>
          <h1 className="text-lg font-bold text-text">Backtest Run</h1>
        </div>
        <p className="text-[11px] text-sub font-mono break-all">{runId}</p>
      </div>

      {/* Run metadata banner */}
      {run && (
        <section className="bg-surface border border-border rounded-lg p-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
            <div>
              <div className="uppercase tracking-wider text-[10px] text-sub">Range</div>
              <div className="text-text tabular-nums">{run.date_from} → {run.date_to}</div>
            </div>
            <div>
              <div className="uppercase tracking-wider text-[10px] text-sub">Symbols</div>
              <div className="text-text">{symbols.length > 0 ? symbols.join(', ') : '—'}</div>
            </div>
            <div>
              <div className="uppercase tracking-wider text-[10px] text-sub">Setup filter</div>
              <div className="text-text">{run.setup_filter || 'all'}</div>
            </div>
            <div>
              <div className="uppercase tracking-wider text-[10px] text-sub">Detections</div>
              <div className="text-text tabular-nums">{run.total_detections.toLocaleString()}</div>
            </div>
          </div>
          <div className="mt-3 text-[10px] text-sub">
            Created {run.created_at}
          </div>
        </section>
      )}

      <PatternLabView data={data} />
    </div>
  )
}
