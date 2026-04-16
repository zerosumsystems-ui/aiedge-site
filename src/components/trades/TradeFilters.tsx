'use client'

import type { TradeRead, TradeDecision, AgreementLevel } from '@/lib/types'

interface TradeFiltersProps {
  trades: TradeRead[]
  filters: {
    setup: string
    phase: string
    decision: string
    agreement: string
  }
  onFilterChange: (key: string, value: string) => void
  resultCount: number
}

function uniqueValues(trades: TradeRead[], key: keyof TradeRead): string[] {
  const vals = new Set(trades.map((t) => String(t[key])))
  return Array.from(vals).sort()
}

const DECISION_COLORS: Record<TradeDecision, string> = {
  BUY: 'border-teal/40 text-teal bg-teal/10',
  SELL: 'border-red/40 text-red bg-red/10',
  WAIT: 'border-yellow/40 text-yellow bg-yellow/10',
  AVOID: 'border-gray/40 text-sub bg-gray/10',
}

const AGREEMENT_COLORS: Record<AgreementLevel, string> = {
  AGREE: 'border-teal/40 text-teal bg-teal/10',
  PARTIAL: 'border-yellow/40 text-yellow bg-yellow/10',
  MINOR: 'border-orange/40 text-orange bg-orange/10',
  MAJOR: 'border-red/40 text-red bg-red/10',
  DISAGREE: 'border-red/45 text-red bg-red/12',
  INVERTED: 'border-red/50 text-red bg-red/15',
}

export function TradeFilters({ trades, filters, onFilterChange, resultCount }: TradeFiltersProps) {
  const setups = uniqueValues(trades, 'setupBrooks')
  const phases = uniqueValues(trades, 'phaseBrooks')

  return (
    <div className="space-y-3">
      {/* Decision chips */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] uppercase tracking-wider text-sub mr-1 font-semibold">Decision</span>
        <Chip label="All" active={!filters.decision} onClick={() => onFilterChange('decision', '')} />
        {(['BUY', 'SELL', 'WAIT', 'AVOID'] as TradeDecision[]).map((d) => (
          <Chip
            key={d}
            label={d}
            active={filters.decision === d}
            onClick={() => onFilterChange('decision', filters.decision === d ? '' : d)}
            colorClass={DECISION_COLORS[d]}
          />
        ))}
      </div>

      {/* Agreement chips */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] uppercase tracking-wider text-sub mr-1 font-semibold">Agreement</span>
        <Chip label="All" active={!filters.agreement} onClick={() => onFilterChange('agreement', '')} />
        {(['AGREE', 'PARTIAL', 'MINOR', 'MAJOR', 'DISAGREE', 'INVERTED'] as AgreementLevel[]).map((a) => (
          <Chip
            key={a}
            label={a}
            active={filters.agreement === a}
            onClick={() => onFilterChange('agreement', filters.agreement === a ? '' : a)}
            colorClass={AGREEMENT_COLORS[a]}
          />
        ))}
      </div>

      {/* Setup + Phase dropdowns */}
      <div className="flex flex-wrap items-center gap-3">
        <FilterSelect
          label="Setup"
          value={filters.setup}
          options={setups}
          onChange={(v) => onFilterChange('setup', v)}
          formatLabel={(s) => s === 'none' ? 'No setup' : s.toUpperCase()}
        />
        <FilterSelect
          label="Phase"
          value={filters.phase}
          options={phases}
          onChange={(v) => onFilterChange('phase', v)}
          formatLabel={(s) => s.replace(/_/g, ' ')}
        />
        <span className="text-xs text-sub ml-auto">{resultCount} trades</span>
      </div>
    </div>
  )
}

function Chip({
  label, active, onClick, colorClass,
}: {
  label: string; active: boolean; onClick: () => void; colorClass?: string
}) {
  const base = active
    ? (colorClass || 'border-teal/40 text-teal bg-teal/10')
    : 'border-border text-sub hover:text-text hover:border-text/20'

  return (
    <button
      onClick={onClick}
      className={`px-2 py-0.5 rounded text-[11px] font-medium border transition-colors ${base}`}
    >
      {label}
    </button>
  )
}

function FilterSelect({
  label, value, options, onChange, formatLabel,
}: {
  label: string; value: string; options: string[]; onChange: (v: string) => void; formatLabel?: (s: string) => string
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] uppercase tracking-wider text-sub font-semibold">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-bg border border-border rounded px-2 py-1 text-xs text-text appearance-none cursor-pointer pr-6"
        style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='%23888' viewBox='0 0 16 16'%3E%3Cpath d='M4 6l4 4 4-4'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 6px center' }}
      >
        <option value="">All</option>
        {options.map((o) => (
          <option key={o} value={o}>{formatLabel ? formatLabel(o) : o}</option>
        ))}
      </select>
    </div>
  )
}
