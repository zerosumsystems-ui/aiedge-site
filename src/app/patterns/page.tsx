'use client'

import { useEffect, useState } from 'react'
import type {
  PatternLabPayload,
  SetupStats,
  ContextRow,
  TimeBucket,
  RecentDetection,
} from '@/lib/types'

// ── Helpers ──────────────────────────────────────────────────────────────────

function pct(n: number | null): string {
  if (n === null || n === undefined) return '—'
  return `${(n * 100).toFixed(1)}%`
}

function fmt(n: number | null, dp = 2): string {
  if (n === null || n === undefined) return '—'
  return n.toFixed(dp)
}

function barWidth(rate: number | null): string {
  if (rate === null) return '0%'
  return `${Math.min(100, Math.max(0, rate * 100))}%`
}

function resultBadge(r: string | null) {
  if (!r) return <span className="text-sub text-[11px]">pending</span>
  const cls: Record<string, string> = {
    WIN: 'text-teal',
    LOSS: 'text-red',
    SCRATCH: 'text-yellow',
    INCOMPLETE: 'text-sub',
  }
  return <span className={`text-[11px] font-semibold ${cls[r] ?? 'text-sub'}`}>{r}</span>
}

function sessionTime(barNum: number): string {
  const minutes = barNum * 5
  const h = Math.floor(minutes / 60) + 9
  const m = (minutes % 60) + 30
  const hh = h + Math.floor(m / 60)
  const mm = m % 60
  const ampm = hh >= 12 ? 'PM' : 'AM'
  const display = hh > 12 ? hh - 12 : hh
  return `${display}:${mm.toString().padStart(2, '0')} ${ampm}`
}

// ── Components ───────────────────────────────────────────────────────────────

function WinRateBar({ rate, count }: { rate: number | null; count: number }) {
  const color = rate === null ? 'bg-border' : rate >= 0.6 ? 'bg-teal' : rate >= 0.4 ? 'bg-yellow' : 'bg-red'
  return (
    <div className="flex items-center gap-2">
      <div className="w-24 h-[6px] bg-border rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: barWidth(rate) }} />
      </div>
      <span className="text-xs text-text font-semibold w-12">{pct(rate)}</span>
      <span className="text-[10px] text-sub">n={count}</span>
    </div>
  )
}

function SetupTable({ data }: { data: Record<string, SetupStats> }) {
  const rows = Object.entries(data).sort((a, b) => b[1].total - a[1].total)
  if (rows.length === 0) return <p className="text-sub text-sm">No data yet</p>

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border text-sub text-[10px] uppercase tracking-wider">
            <th className="text-left py-2 pr-3">Setup</th>
            <th className="text-left py-2 pr-3">Win Rate</th>
            <th className="text-right py-2 pr-3">MFE</th>
            <th className="text-right py-2 pr-3">MAE</th>
            <th className="text-right py-2 pr-3">W</th>
            <th className="text-right py-2 pr-3">L</th>
            <th className="text-right py-2">S</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([name, s]) => (
            <tr key={name} className="border-b border-border/50">
              <td className="py-2 pr-3 font-semibold text-text">{name}</td>
              <td className="py-2 pr-3"><WinRateBar rate={s.win_rate} count={s.total} /></td>
              <td className="py-2 pr-3 text-right text-teal tabular-nums">{fmt(s.avg_mfe)}</td>
              <td className="py-2 pr-3 text-right text-red tabular-nums">{fmt(s.avg_mae)}</td>
              <td className="py-2 pr-3 text-right text-teal tabular-nums">{s.wins}</td>
              <td className="py-2 pr-3 text-right text-red tabular-nums">{s.losses}</td>
              <td className="py-2 text-right text-sub tabular-nums">{s.scratches}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ContextBreakdown({ data }: { data: Record<string, Record<string, ContextRow[]>> }) {
  const [tab, setTab] = useState<string>('cycle_phase')
  const tabs = Object.keys(data)
  const current = data[tab] ?? {}

  return (
    <div>
      <div className="flex gap-1 mb-3">
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
              t === tab ? 'bg-teal/10 text-teal' : 'text-sub hover:text-text hover:bg-bg'
            }`}
          >
            {t.replace(/_/g, ' ')}
          </button>
        ))}
      </div>
      <div className="space-y-3">
        {Object.entries(current).map(([ctx, rows]) => (
          <div key={ctx} className="bg-bg rounded-lg px-3 py-2">
            <div className="text-[11px] text-sub mb-1.5">{ctx}</div>
            {rows.map((r) => (
              <div key={r.setup_type} className="flex items-center gap-3 py-0.5">
                <span className="text-xs text-text w-20 font-medium">{r.setup_type}</span>
                <WinRateBar rate={r.win_rate} count={r.total} />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

function TimeOfDay({ data }: { data: TimeBucket[] }) {
  if (data.length === 0) return <p className="text-sub text-sm">No data yet</p>
  const maxTotal = Math.max(...data.map((d) => d.total), 1)

  return (
    <div className="space-y-1">
      {data.map((b) => {
        const winRate = (b.wins + b.losses) > 0 ? b.wins / (b.wins + b.losses) : null
        const barW = `${(b.total / maxTotal) * 100}%`
        const color = winRate === null ? 'bg-border' : winRate >= 0.6 ? 'bg-teal' : winRate >= 0.4 ? 'bg-yellow' : 'bg-red'
        return (
          <div key={b.bucket_start} className="flex items-center gap-2">
            <span className="text-[10px] text-sub w-16 text-right tabular-nums">
              {sessionTime(b.bucket_start)}
            </span>
            <div className="flex-1 h-[8px] bg-border/30 rounded-full overflow-hidden">
              <div className={`h-full rounded-full ${color}`} style={{ width: barW }} />
            </div>
            <span className="text-[10px] text-text w-10 text-right tabular-nums">{pct(winRate)}</span>
            <span className="text-[10px] text-sub w-8 text-right">n={b.total}</span>
          </div>
        )
      })}
    </div>
  )
}

function RecentTable({ data }: { data: RecentDetection[] }) {
  if (data.length === 0) return <p className="text-sub text-sm">No data yet</p>

  return (
    <div className="overflow-x-auto max-h-80 overflow-y-auto">
      <table className="w-full text-[11px]">
        <thead className="sticky top-0 bg-surface">
          <tr className="border-b border-border text-sub text-[10px] uppercase tracking-wider">
            <th className="text-left py-1.5 pr-2">Ticker</th>
            <th className="text-left py-1.5 pr-2">Setup</th>
            <th className="text-left py-1.5 pr-2">Dir</th>
            <th className="text-left py-1.5 pr-2">Result</th>
            <th className="text-right py-1.5 pr-2">MFE</th>
            <th className="text-right py-1.5 pr-2">MAE</th>
            <th className="text-left py-1.5 pr-2">Phase</th>
            <th className="text-left py-1.5">Signal</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d, i) => (
            <tr key={i} className="border-b border-border/30">
              <td className="py-1.5 pr-2 font-semibold text-text">{d.ticker}</td>
              <td className="py-1.5 pr-2 text-text">{d.setupType}</td>
              <td className="py-1.5 pr-2">
                <span className={d.direction === 'long' ? 'text-teal' : 'text-red'}>
                  {d.direction}
                </span>
              </td>
              <td className="py-1.5 pr-2">{resultBadge(d.result)}</td>
              <td className="py-1.5 pr-2 text-right text-teal tabular-nums">{fmt(d.mfe)}</td>
              <td className="py-1.5 pr-2 text-right text-red tabular-nums">{fmt(d.mae)}</td>
              <td className="py-1.5 pr-2 text-sub">{d.cyclePhase ?? '—'}</td>
              <td className="py-1.5 text-sub">{d.signal ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

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
      <div className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-lg font-bold text-text mb-2">Pattern Lab</h1>
        <p className="text-red text-sm">Failed to load: {error}</p>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-lg font-bold text-text mb-2">Pattern Lab</h1>
        <p className="text-sub text-sm">Loading statistics...</p>
      </div>
    )
  }

  const { summary, bySetup, byContext, byTimeOfDay, recentDetections } = data

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-lg font-bold text-text">Pattern Lab</h1>
        <p className="text-xs text-sub mt-0.5">
          {summary.totalDetections.toLocaleString()} detections across{' '}
          {summary.datesTracked} session{summary.datesTracked !== 1 ? 's' : ''}{' '}
          ({summary.dateRange.from} — {summary.dateRange.to})
        </p>
      </div>

      {/* Setup Win Rates */}
      <section className="bg-surface border border-border rounded-lg p-4">
        <h2 className="text-sm font-semibold text-text mb-3">Win Rate by Setup</h2>
        <SetupTable data={bySetup} />
      </section>

      {/* Context Breakdown */}
      <section className="bg-surface border border-border rounded-lg p-4">
        <h2 className="text-sm font-semibold text-text mb-3">Win Rate by Context</h2>
        <ContextBreakdown data={byContext} />
      </section>

      {/* Time of Day */}
      <section className="bg-surface border border-border rounded-lg p-4">
        <h2 className="text-sm font-semibold text-text mb-3">Activity by Time of Day</h2>
        <TimeOfDay data={byTimeOfDay} />
      </section>

      {/* Recent Detections */}
      <section className="bg-surface border border-border rounded-lg p-4">
        <h2 className="text-sm font-semibold text-text mb-3">Recent Detections</h2>
        <RecentTable data={recentDetections} />
      </section>
    </div>
  )
}
