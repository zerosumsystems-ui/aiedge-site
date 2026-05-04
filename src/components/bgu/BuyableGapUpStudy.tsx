'use client'

import { Fragment, useMemo, useState } from 'react'
import type { BguPayload, BguTrade } from '@/lib/buyable-gap-up'
import { BguProcessFlow } from './BguProcessFlow'
import { BguTradeChart } from './BguTradeChart'

type SortKey =
  | 'date'
  | 'ticker'
  | 'intraday'
  | 'gap'
  | 'rvol'
  | 'entry'
  | 'stop'
  | 'days'
  | 'return'
  | 'r'

type SortDir = 'asc' | 'desc'

const DATE_FORMATTER = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'America/New_York',
})

function fmtDate(iso: string): string {
  if (!iso) return '-'
  return DATE_FORMATTER.format(new Date(`${iso}T12:00:00-04:00`))
}

const COMPARATORS: Record<SortKey, (a: BguTrade, b: BguTrade) => number> = {
  date: (a, b) => a.signalDate.localeCompare(b.signalDate),
  ticker: (a, b) => a.ticker.localeCompare(b.ticker),
  intraday: (a, b) => a.intradayGainPct - b.intradayGainPct,
  gap: (a, b) => a.gapUpPct - b.gapUpPct,
  rvol: (a, b) => a.volumeRvol - b.volumeRvol,
  entry: (a, b) => a.entryPrice - b.entryPrice,
  stop: (a, b) => a.stopDistancePct - b.stopDistancePct,
  days: (a, b) => a.daysHeld - b.daysHeld,
  return: (a, b) => a.returnPct - b.returnPct,
  r: (a, b) => a.rMultiple - b.rMultiple,
}

function fmtPct(v: number | null | undefined, digits = 2): string {
  if (v === null || v === undefined) return '-'
  return `${v >= 0 ? '+' : ''}${v.toFixed(digits)}%`
}

function fmtR(v: number | null | undefined): string {
  if (v === null || v === undefined) return '-'
  return `${v >= 0 ? '+' : ''}${v.toFixed(2)}R`
}

function fmtPrice(v: number): string {
  if (v >= 100) return `$${v.toFixed(2)}`
  if (v >= 10) return `$${v.toFixed(2)}`
  return `$${v.toFixed(3)}`
}

function fmtCount(v: number): string {
  return v.toLocaleString('en-US')
}

function StatCard({ label, value, accent = false, danger = false }: {
  label: string
  value: string
  accent?: boolean
  danger?: boolean
}) {
  const colorClass = danger ? 'text-red' : accent ? 'text-teal' : 'text-text'
  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <div className="text-[10px] uppercase tracking-wider text-sub">{label}</div>
      <div className={`mt-1 font-mono text-lg font-bold tabular-nums ${colorClass}`}>
        {value}
      </div>
    </div>
  )
}

function FilterBadge({ label }: { label: string }) {
  return (
    <span className="inline-block rounded-full border border-border bg-bg px-3 py-1 text-xs text-sub">
      {label}
    </span>
  )
}

interface Props {
  payload: BguPayload
}

export function BuyableGapUpStudy({ payload }: Props) {
  const { stats, trades, filters, generatedAt } = payload

  const [sortKey, setSortKey] = useState<SortKey>('date')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [filterText, setFilterText] = useState('')
  const [showOnly, setShowOnly] = useState<'all' | 'wins' | 'losses' | 'stopped'>('all')
  const [expandedKey, setExpandedKey] = useState<string | null>(null)

  const sortedFiltered = useMemo(() => {
    let rows = [...trades]
    if (filterText.trim()) {
      const f = filterText.trim().toUpperCase()
      rows = rows.filter((t) => t.ticker.includes(f))
    }
    if (showOnly === 'wins') rows = rows.filter((t) => t.returnPct > 0)
    else if (showOnly === 'losses') rows = rows.filter((t) => t.returnPct <= 0)
    else if (showOnly === 'stopped') rows = rows.filter((t) => t.exitReason === 'stop')
    const dir = sortDir === 'asc' ? 1 : -1
    const compare = COMPARATORS[sortKey]
    rows.sort((a, b) => dir * compare(a, b))
    return rows
  }, [trades, sortKey, sortDir, filterText, showOnly])

  function toggleSort(k: SortKey) {
    if (sortKey === k) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(k)
      setSortDir('desc')
    }
  }

  function ColHeader({ k, children, align = 'left' }: { k: SortKey; children: React.ReactNode; align?: 'left' | 'right' }) {
    const active = sortKey === k
    return (
      <th
        scope="col"
        className={`select-none cursor-pointer px-2 py-2 text-[11px] font-medium uppercase tracking-wider ${
          active ? 'text-teal' : 'text-sub hover:text-text'
        } text-${align}`}
        onClick={() => toggleSort(k)}
      >
        <span className="inline-flex items-center gap-0.5">
          {children}
          {active && <span className="text-[9px]">{sortDir === 'asc' ? '↑' : '↓'}</span>}
        </span>
      </th>
    )
  }

  return (
    <div className="px-3 py-4 sm:px-6 sm:py-6 max-w-[1400px] mx-auto space-y-6">
      {/* Header */}
      <header className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight">Buyable Gap-Up Study</h1>
        <p className="text-sm text-sub leading-relaxed max-w-3xl">
          Stocks gapping up &ge;15% intraday on highest-in-60d volume, breaking through 50-day high while above
          their 200-day SMA. Entry next-day close, stop at gap-day&apos;s low, time exit at 40 days. Sample
          covers {fmtDate(stats.start)} → {fmtDate(stats.end)} ({stats.spanYears.toFixed(2)} years,
          {' '}{fmtCount(stats.totalTrades)} trades).
        </p>
        {generatedAt && (
          <p className="text-xs text-sub">Generated {generatedAt}</p>
        )}
      </header>

      <BguProcessFlow />

      {/* Setup spec */}
      <section className="rounded-lg border border-border bg-surface p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-sub mb-3">Setup Filter</h2>
        <div className="flex flex-wrap gap-2">
          <FilterBadge label={`Intraday +${filters.minIntradayGainPct}%`} />
          <FilterBadge label={`Close ≥ top ${100 - filters.minCloseLocationPct}% of day`} />
          <FilterBadge label={`RVOL ≥ ${filters.minVolumeRvol}×`} />
          <FilterBadge label={`Today's vol = highest in ${filters.vol60dWindow}d`} />
          <FilterBadge
            label={`Today's vol ≥ ${filters.isolatedSpikeMult}× max prior ${filters.isolatedSpikeWindow}d`}
          />
          <FilterBadge label={`Not extended (≤${filters.maxPrior30dRatio}× of 30-day-prior close)`} />
          {filters.requireAboveSma200 && <FilterBadge label="Close > 200 SMA" />}
          {filters.requireNewHigh && <FilterBadge label={`New ${filters.highWindowDays}-day high`} />}
          <FilterBadge label={`Avg vol ≥ ${(filters.minAvgVolumeShares / 1000).toLocaleString()}k`} />
          {filters.excludeEtfs && <FilterBadge label="No ETFs / leveraged" />}
        </div>
      </section>

      {/* Aggregate stats */}
      <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard label="Total Trades" value={fmtCount(stats.totalTrades)} />
        <StatCard label="Win Rate" value={`${stats.winRatePct.toFixed(1)}%`} />
        <StatCard label="Avg Winner" value={fmtPct(stats.avgGainPct)} accent />
        <StatCard label="Avg Loser" value={fmtPct(stats.avgLossPct)} danger />
        <StatCard
          label="EV / Trade (R)"
          value={fmtR(stats.evR)}
          accent={stats.evR > 0}
          danger={stats.evR <= 0}
        />
        <StatCard label="Annual R" value={fmtR(stats.annualR)} accent />
      </section>

      {/* Trade controls */}
      <section className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          placeholder="Filter ticker..."
          className="rounded border border-border bg-surface px-3 py-1.5 text-sm font-mono w-32 focus:outline-none focus:border-teal"
        />
        <div className="flex gap-1">
          {(['all', 'wins', 'losses', 'stopped'] as const).map((opt) => (
            <button
              key={opt}
              onClick={() => setShowOnly(opt)}
              className={`px-3 py-1.5 rounded text-xs font-medium ${
                showOnly === opt
                  ? 'bg-teal/10 text-teal border border-teal/30'
                  : 'bg-surface text-sub hover:text-text border border-border'
              }`}
            >
              {opt[0].toUpperCase() + opt.slice(1)}
            </button>
          ))}
        </div>
        <div className="text-xs text-sub ml-auto">
          Showing {sortedFiltered.length} of {trades.length} trades · click any row for chart
        </div>
      </section>

      {/* Trades table */}
      <section className="rounded-lg border border-border bg-surface overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-bg/50">
            <tr>
              <ColHeader k="date">Signal Date</ColHeader>
              <ColHeader k="ticker">Ticker</ColHeader>
              <ColHeader k="intraday" align="right">Intraday</ColHeader>
              <ColHeader k="gap" align="right">Gap</ColHeader>
              <ColHeader k="rvol" align="right">RVOL</ColHeader>
              <ColHeader k="entry" align="right">Entry</ColHeader>
              <ColHeader k="stop" align="right">Stop</ColHeader>
              <ColHeader k="days" align="right">Days</ColHeader>
              <ColHeader k="return" align="right">Return</ColHeader>
              <ColHeader k="r" align="right">R</ColHeader>
            </tr>
          </thead>
          <tbody>
            {sortedFiltered.map((t, i) => {
              const win = t.returnPct > 0
              const stopped = t.exitReason === 'stop'
              const key = `${t.ticker}-${t.signalDate}`
              const expanded = expandedKey === key
              return (
                <Fragment key={`${key}-${i}`}>
                  <tr
                    className={`border-b border-border/40 transition-colors cursor-pointer ${
                      expanded ? 'bg-bg/40' : 'hover:bg-bg/30'
                    }`}
                    onClick={() => setExpandedKey(expanded ? null : key)}
                  >
                    <td className="px-2 py-1.5 font-mono text-xs text-sub">
                      <span className="inline-block w-3 mr-1 text-sub">{expanded ? '▾' : '▸'}</span>
                      {t.signalDate}
                    </td>
                    <td className="px-2 py-1.5 font-mono text-sm font-semibold">{t.ticker}</td>
                    <td className="px-2 py-1.5 font-mono text-xs text-right">
                      {fmtPct(t.intradayGainPct, 1)}
                    </td>
                    <td className="px-2 py-1.5 font-mono text-xs text-right text-sub">
                      {fmtPct(t.gapUpPct, 1)}
                    </td>
                    <td className="px-2 py-1.5 font-mono text-xs text-right text-sub">
                      {t.volumeRvol.toFixed(1)}×
                    </td>
                    <td className="px-2 py-1.5 font-mono text-xs text-right">
                      {fmtPrice(t.entryPrice)}
                    </td>
                    <td className="px-2 py-1.5 font-mono text-xs text-right text-sub">
                      {fmtPct(t.stopDistancePct, 1)}
                    </td>
                    <td className="px-2 py-1.5 font-mono text-xs text-right text-sub">
                      {t.daysHeld}{stopped && <span className="text-red ml-1">●</span>}
                    </td>
                    <td className={`px-2 py-1.5 font-mono text-sm text-right font-semibold ${
                      win ? 'text-teal' : 'text-red'
                    }`}>
                      {fmtPct(t.returnPct, 2)}
                    </td>
                    <td className={`px-2 py-1.5 font-mono text-sm text-right font-semibold ${
                      t.rMultiple > 0 ? 'text-teal' : 'text-red'
                    }`}>
                      {fmtR(t.rMultiple)}
                    </td>
                  </tr>
                  {expanded && (
                    <tr>
                      <td colSpan={10} className="p-0">
                        <BguTradeChart trade={t} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
            {sortedFiltered.length === 0 && (
              <tr>
                <td colSpan={10} className="px-3 py-8 text-center text-sub text-sm">
                  No trades match filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {/* Footer note */}
      <footer className="text-xs text-sub max-w-3xl space-y-1 leading-relaxed">
        <p>
          <strong>Methodology:</strong> Daily OHLCV from Databento. Stop fills assumed at gap-day&apos;s low
          when intraday low breaches it (conservative — assumes stop fills before any intrabar target).
          R = (return % / |stop distance %|). Annual R = sum of all R-multiples / years in sample.
        </p>
        <p>
          <strong>Position sizing:</strong> Risk fixed % of account per trade. Position size = (account × risk %)
          / (entry × stop distance %).
        </p>
      </footer>
    </div>
  )
}
