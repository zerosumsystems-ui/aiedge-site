'use client'

import type { TradeRead } from '@/lib/types'

export function TradeStats({ trades }: { trades: TradeRead[] }) {
  const total = trades.length
  if (total === 0) return null

  const avgQuality = trades.reduce((sum, t) => sum + t.qualityScore, 0) / total
  const avgProb = trades.reduce((sum, t) => sum + t.probabilityBrooks, 0) / total
  const avgRR = trades.reduce((sum, t) => sum + t.rrBrooks, 0) / total

  // Decision breakdown
  const decisions = trades.reduce((acc, t) => {
    acc[t.decisionBrooks] = (acc[t.decisionBrooks] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  // Agreement breakdown
  const agreements = trades.reduce((acc, t) => {
    acc[t.agreementVsScanner] = (acc[t.agreementVsScanner] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  const agreeRate = ((agreements['AGREE'] || 0) / total * 100).toFixed(0)

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2 mb-4">
      <StatBox label="Total Trades" value={String(total)} />
      <StatBox label="Avg Quality" value={avgQuality.toFixed(1)} sub="/10" />
      <StatBox label="Avg Prob" value={`${avgProb.toFixed(0)}%`} />
      <StatBox label="Avg R:R" value={avgRR.toFixed(1)} />
      <StatBox
        label="Decisions"
        value=""
        custom={
          <div className="flex gap-1 flex-wrap">
            {Object.entries(decisions).sort((a, b) => b[1] - a[1]).map(([d, n]) => (
              <span key={d} className="text-[10px] text-sub">
                <span className={d === 'BUY' ? 'text-teal' : d === 'SELL' ? 'text-red' : d === 'WAIT' ? 'text-yellow' : 'text-gray'}>
                  {n}
                </span>
                {' '}{d.toLowerCase()}
              </span>
            ))}
          </div>
        }
      />
      <StatBox label="Agreement" value={`${agreeRate}%`} sub="agree" />
    </div>
  )
}

function StatBox({ label, value, sub, custom }: { label: string; value: string; sub?: string; custom?: React.ReactNode }) {
  return (
    <div className="bg-surface border border-border rounded-lg p-2.5">
      <div className="text-[9px] uppercase tracking-wider text-sub mb-1 font-semibold">{label}</div>
      {custom || (
        <div className="text-sm font-bold text-text">
          {value}
          {sub && <span className="text-[10px] text-sub font-normal ml-0.5">{sub}</span>}
        </div>
      )}
    </div>
  )
}
