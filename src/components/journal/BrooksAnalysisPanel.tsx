'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { LetterGrade, TradeGrade } from '@/lib/pairing'
import { computeTradeGrade } from '@/lib/pairing'
import type { RoundTrip, TradeRead } from '@/lib/types'

interface Props {
  trip: RoundTrip
}

const GRADE_TONE: Record<LetterGrade, string> = {
  A: 'bg-teal/25 text-teal border-teal/50',
  B: 'bg-teal/15 text-teal/90 border-teal/30',
  C: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  D: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
  F: 'bg-red-500/20 text-red-400 border-red-500/40',
}

/**
 * Toggled panel that surfaces the pre-trade Brooks read for a round-trip
 * and grades the actual fill against the plan. All data comes from the
 * existing /api/trades snapshot — no LLM calls (per user: no paid APIs).
 *
 * Orphan trades (no paired read) render an empty-state message pointing
 * to /trades where reads live.
 */
export function BrooksAnalysisPanel({ trip }: Props) {
  // Initial `settled` state reflects whether we even need to fetch. Orphan
  // trades mount with settled=true so the render short-circuits without
  // calling setSettled from inside the effect (which trips the React
  // compiler's "synchronous setState in effect" rule).
  const [read, setRead] = useState<TradeRead | null>(null)
  const [settled, setSettled] = useState<boolean>(() => !trip.pairedReadId)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!trip.pairedReadId) return
    let cancelled = false
    const date = trip.entryTime.slice(0, 10)
    const qs = new URLSearchParams({ ticker: trip.ticker, date })
    fetch(`/api/trades?${qs}`)
      .then((r) => r.json())
      .then((data: { trades?: TradeRead[] }) => {
        if (cancelled) return
        const match = (data.trades ?? []).find((t) => t.id === trip.pairedReadId)
        setRead(match ?? null)
        setSettled(true)
      })
      .catch((err) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : String(err))
        setSettled(true)
      })
    return () => {
      cancelled = true
    }
  }, [trip.pairedReadId, trip.ticker, trip.entryTime])

  const loading = !settled

  if (!trip.pairedReadId) {
    return (
      <div className="bg-bg rounded p-3 text-xs text-sub border border-dashed border-border">
        <div className="font-semibold text-text mb-1">No pre-trade Brooks read on file</div>
        <p>
          This trade has no matching pre-trade read in the{' '}
          <Link href="/trades" className="text-teal hover:underline">
            Trade Catalog
          </Link>
          . Writing a Brooks read before (or shortly after) an entry lets the
          journal grade the execution against the plan.
        </p>
      </div>
    )
  }

  if (loading) {
    return <div className="skeleton h-24 w-full rounded" />
  }

  if (error) {
    return (
      <div className="bg-red-500/10 border border-red-500/30 text-red-300 text-xs rounded p-3">
        Couldn&apos;t load Brooks read: {error}
      </div>
    )
  }

  if (!read) {
    return (
      <div className="bg-bg rounded p-3 text-xs text-sub border border-border">
        <div className="font-semibold text-text mb-1">Paired read not found</div>
        <p>
          We tried to pull the Brooks read with id <code className="text-teal">{trip.pairedReadId}</code>{' '}
          but the /api/trades snapshot didn&apos;t return it. It may have been
          removed by a more recent sync.
        </p>
      </div>
    )
  }

  const grade = computeTradeGrade(trip, read)

  return (
    <div className="space-y-4">
      {grade && <GradeCard grade={grade} />}
      <ReadMetrics read={read} />
      <div>
        <div className="text-[10px] uppercase tracking-wider text-sub mb-2 font-semibold">
          Brooks read
        </div>
        <div className="prose-sm">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              p: ({ children }) => (
                <p className="text-sm text-text/90 leading-relaxed mb-2">{children}</p>
              ),
              strong: ({ children }) => <strong className="font-semibold text-text">{children}</strong>,
              h1: ({ children }) => <h1 className="text-base font-bold text-text mb-1">{children}</h1>,
              h2: ({ children }) => <h2 className="text-sm font-semibold text-text mt-3 mb-1">{children}</h2>,
              h3: ({ children }) => <h3 className="text-xs font-semibold text-text mt-2 mb-1">{children}</h3>,
              ul: ({ children }) => <ul className="list-disc pl-5 mb-2 space-y-0.5">{children}</ul>,
              ol: ({ children }) => <ol className="list-decimal pl-5 mb-2 space-y-0.5">{children}</ol>,
              li: ({ children }) => <li className="text-xs text-text/90">{children}</li>,
              code: ({ children }) => (
                <code className="bg-bg rounded px-1 py-0.5 text-[10px] font-mono text-teal/80">
                  {children}
                </code>
              ),
              blockquote: ({ children }) => (
                <blockquote className="border-l-2 border-teal/40 pl-3 my-2 text-sub italic">
                  {children}
                </blockquote>
              ),
            }}
          >
            {read.contextMarkdown || '*(No read text available)*'}
          </ReactMarkdown>
        </div>
      </div>
      {read.annotationNotes && (
        <div className="bg-bg rounded p-2 border border-border">
          <div className="text-[10px] uppercase tracking-wider text-sub mb-1 font-semibold">
            Annotation notes
          </div>
          <p className="text-xs text-text/80">{read.annotationNotes}</p>
        </div>
      )}
    </div>
  )
}

function GradeCard({ grade }: { grade: TradeGrade }) {
  return (
    <div className="bg-surface border border-border rounded-lg p-3">
      <div className="flex items-center gap-3 mb-3">
        <div
          className={`w-12 h-12 rounded-lg border-2 flex items-center justify-center text-2xl font-black ${
            GRADE_TONE[grade.overall]
          }`}
        >
          {grade.overall}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] uppercase tracking-wider text-sub">Trade grade</div>
          <div className="text-sm text-text font-medium truncate">{grade.headline}</div>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <ComponentRow label="Direction" component={grade.direction} />
        {grade.stop && <ComponentRow label="Stop discipline" component={grade.stop} />}
        {grade.rAchieved && <ComponentRow label="R achieved" component={grade.rAchieved} />}
      </div>
    </div>
  )
}

function ComponentRow({
  label,
  component,
}: {
  label: string
  component: { grade: LetterGrade; note: string }
}) {
  return (
    <div className="bg-bg rounded p-2">
      <div className="flex items-center gap-2 mb-1">
        <span
          className={`inline-flex items-center justify-center w-5 h-5 rounded text-[10px] font-bold border ${
            GRADE_TONE[component.grade]
          }`}
        >
          {component.grade}
        </span>
        <span className="text-[10px] uppercase tracking-wider text-sub">{label}</span>
      </div>
      <p className="text-[11px] text-text/80 leading-snug">{component.note}</p>
    </div>
  )
}

function ReadMetrics({ read }: { read: TradeRead }) {
  const rows: Array<{ label: string; value: string }> = [
    { label: 'Phase', value: read.phaseBrooks.replace(/_/g, ' ') },
    { label: 'Always-in', value: read.alwaysInBrooks.replace(/_/g, ' ') },
    { label: 'Setup', value: read.setupBrooks === 'none' ? '—' : read.setupBrooks.toUpperCase() },
    { label: 'Decision', value: read.decisionBrooks },
    { label: 'Stop', value: read.stopPrice != null ? `$${read.stopPrice.toFixed(2)}` : '—' },
    { label: 'Target', value: read.targetPrice != null ? `$${read.targetPrice.toFixed(2)}` : '—' },
    { label: 'R:R', value: read.rrBrooks.toFixed(1) },
    { label: 'Probability', value: `${read.probabilityBrooks}%` },
    { label: 'Quality', value: `${read.qualityScore.toFixed(1)}/10` },
  ]
  return (
    <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
      {rows.map((r) => (
        <div key={r.label} className="bg-bg rounded p-2">
          <div className="text-[9px] uppercase tracking-wider text-sub mb-0.5">{r.label}</div>
          <div className="text-[11px] text-text font-medium truncate">{r.value}</div>
        </div>
      ))}
    </div>
  )
}
