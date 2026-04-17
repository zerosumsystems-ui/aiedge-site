'use client'

import { useEffect, useState } from 'react'
import type { PatternLabPayload } from '@/lib/types'
import { PatternLabView } from '@/components/patterns/PatternLabView'

export default function PatternsPage() {
  const [data, setData] = useState<PatternLabPayload | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/patterns')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then(setData)
      .catch((e) => setError(e.message))
  }, [])

  if (error) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8">
        <h1 className="text-lg font-bold text-text mb-2">Pattern Lab</h1>
        <p className="text-red text-sm">Failed to load: {error}</p>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8">
        <h1 className="text-lg font-bold text-text mb-2">Pattern Lab</h1>
        <p className="text-sub text-sm">Loading statistics...</p>
      </div>
    )
  }

  const { summary } = data

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      <div>
        <h1 className="text-lg font-bold text-text">Pattern Lab</h1>
        <p className="text-xs text-sub mt-0.5">
          {summary.totalDetections.toLocaleString()} detections across{' '}
          {summary.datesTracked} session{summary.datesTracked !== 1 ? 's' : ''}{' '}
          ({summary.dateRange.from} — {summary.dateRange.to})
        </p>
      </div>
      <PatternLabView data={data} />
    </div>
  )
}
