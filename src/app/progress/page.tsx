'use client'

import { useEffect, useMemo, useState } from 'react'
import type { ProgressPayload } from '@/lib/types'
import { ProgressBar } from '@/components/progress/ProgressBar'
import { CategoryAccuracyBar } from '@/components/progress/CategoryAccuracyBar'
import { CalibrationTrend } from '@/components/progress/CalibrationTrend'
import { LessonCard } from '@/components/progress/LessonCard'
import { QueueList } from '@/components/progress/QueueList'

export default function ProgressPage() {
  const [data, setData] = useState<ProgressPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')

  useEffect(() => {
    fetch('/api/progress')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then(setData)
      .catch((e) => setError(e.message))
  }, [])

  const filteredLessons = useMemo(() => {
    if (!data) return []
    const q = query.trim().toLowerCase()
    if (!q) return data.lessons
    return data.lessons.filter((l) => {
      const hay = [l.id, l.title, l.fromFigure, l.patternMissed, l.futureRule]
        .join(' ')
        .toLowerCase()
      return hay.includes(q)
    })
  }, [data, query])

  if (error) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-lg font-bold text-text mb-2">Learning Progress</h1>
        <p className="text-red text-sm">Failed to load: {error}</p>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="skeleton h-8 w-48 mb-2" />
        <div className="skeleton h-4 w-72 mb-6" />
        <div className="skeleton h-20 mb-4" />
        <div className="skeleton h-40 mb-4" />
        <div className="skeleton h-60" />
      </div>
    )
  }

  const {
    scoreboard,
    lessons,
    figuresCompleted,
    figuresTotal,
    nextQueue,
    categoryAccuracy,
  } = data

  const isEmpty = scoreboard.length === 0 && lessons.length === 0

  if (isEmpty) {
    return (
      <div className="flex items-center justify-center h-[calc(100dvh-var(--nav-h))]">
        <div className="text-center max-w-md">
          <div className="text-2xl mb-3 text-sub">No calibration data yet</div>
          <p className="text-sm text-sub">
            Run the self-eval loop at{' '}
            <code className="text-teal/80 font-mono text-xs">~/code/aiedge/self-eval/</code>{' '}
            or sync via{' '}
            <code className="text-teal/80 font-mono text-xs">
              python3 scripts/sync_progress.py
            </code>
            .
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-lg font-bold text-text">Learning Progress</h1>
        <p className="text-xs text-sub mt-0.5">
          Brooks self-eval calibration loop ·{' '}
          {scoreboard.length} attempt{scoreboard.length !== 1 ? 's' : ''} logged,{' '}
          {lessons.length} lesson{lessons.length !== 1 ? 's' : ''} extracted
        </p>
      </div>

      {/* Progress bar */}
      <ProgressBar completed={figuresCompleted} total={figuresTotal} />

      {/* Category accuracy */}
      <section className="bg-surface border border-border rounded-lg p-4">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-sm font-semibold text-text">Category Accuracy</h2>
          <div className="flex items-center gap-3 text-[10px] uppercase tracking-wider">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-teal" />
              <span className="text-sub">Agree</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-yellow" />
              <span className="text-sub">Partial</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-red" />
              <span className="text-sub">Miss</span>
            </span>
          </div>
        </div>
        <div className="space-y-0.5">
          <CategoryAccuracyBar label="Phase" counts={categoryAccuracy.phase} />
          <CategoryAccuracyBar label="Always-in" counts={categoryAccuracy.alwaysIn} />
          <CategoryAccuracyBar label="Strength" counts={categoryAccuracy.strength} />
          <CategoryAccuracyBar label="Setup" counts={categoryAccuracy.setup} />
          <CategoryAccuracyBar label="Decision" counts={categoryAccuracy.decision} />
        </div>
      </section>

      {/* Calibration trend */}
      <section className="bg-surface border border-border rounded-lg p-4">
        <h2 className="text-sm font-semibold text-text mb-3">Calibration Scores</h2>
        <CalibrationTrend entries={scoreboard} />
      </section>

      {/* Next up */}
      {nextQueue.length > 0 && (
        <section className="bg-surface border border-border rounded-lg p-4">
          <h2 className="text-sm font-semibold text-text mb-3">Next Up</h2>
          <QueueList items={nextQueue} />
        </section>
      )}

      {/* Lessons */}
      <section className="bg-surface border border-border rounded-lg p-4">
        <div className="flex items-baseline justify-between gap-3 mb-3">
          <h2 className="text-sm font-semibold text-text">
            Lessons Learned
            <span className="text-sub font-normal ml-2">
              {filteredLessons.length}
              {query && ` of ${lessons.length}`}
            </span>
          </h2>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search lessons..."
            className="bg-bg border border-border rounded px-2.5 py-1 text-xs text-text placeholder:text-sub w-48 focus:outline-none focus:border-teal/50"
          />
        </div>
        {filteredLessons.length === 0 ? (
          <p className="text-sub text-sm">No lessons match “{query}”.</p>
        ) : (
          <div className="space-y-2">
            {filteredLessons.map((l) => (
              <LessonCard key={l.id} lesson={l} query={query} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
