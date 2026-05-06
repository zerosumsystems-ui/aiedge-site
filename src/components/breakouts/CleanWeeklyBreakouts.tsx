'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { LightweightChart } from '@/components/charts/LightweightChart'
import { withGapUpFtSetupAnnotations } from '@/lib/gap-up-ft-chart'
import type { ChartData, WeeklyBreakoutLeader, WeeklyBreakoutPayload } from '@/lib/types'

interface Props {
  payload: WeeklyBreakoutPayload
  mode?: 'full' | 'cc'
}

interface DailyCcLivePayload {
  asOf: string
  latestAsOf: string
  generatedAt: string
  hasData: boolean
  availableDates: string[]
  ccLeaders: WeeklyBreakoutLeader[]
}

const CC_DISPLAY_NAME = 'gap up + ft setups'

const NEW_HIGH_LABELS: Record<string, string> = {
  '52w_closing_high': '52W Close',
  '52w_intraday_high': '52W High',
  '20w_closing_high': '20W Close',
  '20w_intraday_high': '20W High',
}

function formatPct(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`
}

function formatRvol(value: number): string {
  return `${value.toFixed(2)}x`
}

function formatPlainPct(value: number): string {
  return `${value.toFixed(1)}%`
}

function formatScore(value: number): string {
  return value.toFixed(1)
}

function formatWholeScore(value: number | undefined): string {
  return String(value ?? 0)
}

function formatVolume(value: number): string {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`
  return String(value)
}

function formatDate(value: string): string {
  if (!value) return ''
  const date = new Date(`${value}T12:00:00-04:00`)
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'America/New_York',
  }).format(date)
}

function newHighLabel(value: string): string {
  return NEW_HIGH_LABELS[value] ?? value.replaceAll('_', ' ')
}

function isOpeningCcLeader(leader: WeeklyBreakoutLeader): boolean {
  return leader.ccOpeningBars !== undefined
}

function isGapFollowThroughLeader(leader: WeeklyBreakoutLeader): boolean {
  return !isOpeningCcLeader(leader) && leader.ccGapUpPct !== undefined
}

function ccBarCountLabel(leader: WeeklyBreakoutLeader): string {
  if (isOpeningCcLeader(leader)) {
    return `${leader.ccQualifyingOpeningBars ?? 0}/${leader.ccOpeningBars ?? 0}`
  }
  if (isGapFollowThroughLeader(leader)) {
    return 'Gap+FT'
  }
  return `${leader.ccStreakBars ?? 0} bars`
}

function ccBarCountSubLabel(leader: WeeklyBreakoutLeader): string {
  if (isOpeningCcLeader(leader)) return 'opening'
  if (isGapFollowThroughLeader(leader)) return 'pattern'
  return 'CC streak'
}

function ccVolumeLabel(leader: WeeklyBreakoutLeader): string {
  return formatRvol(leader.ccMaxPairVolumeRvol ?? leader.weekRvol)
}

function ccGapLabel(leader: WeeklyBreakoutLeader): string {
  return formatPct(leader.ccGapUpPct ?? leader.ccMaxPairGapPct ?? 0)
}

function ccFollowThroughCloseLabel(leader: WeeklyBreakoutLeader): string {
  return formatPlainPct(leader.ccFollowThroughCloseLocationPct ?? leader.ccLatestCloseLocationPct ?? 0)
}

function fixedBarChart(chart: ChartData, bars = 60): ChartData {
  if (chart.bars.length <= bars) return chart
  return { ...chart, bars: chart.bars.slice(-bars) }
}

function Metric({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-wide text-sub">{label}</div>
      <div className={`mt-0.5 truncate font-mono text-sm tabular-nums ${accent ? 'text-teal' : 'text-text'}`}>
        {value}
      </div>
    </div>
  )
}

function CcHistoryControls({
  selectedDate,
  liveDate,
  availableDates,
  onDateChange,
}: {
  selectedDate: string
  liveDate: string
  availableDates: string[]
  onDateChange: (date: string) => void
}) {
  const sortedAvailableDates = useMemo(
    () => [...new Set(availableDates)].filter(Boolean).sort(),
    [availableDates],
  )
  const previousDate = [...sortedAvailableDates].reverse().find((date) => date < selectedDate)
  const nextDate = sortedAvailableDates.find((date) => date > selectedDate && (!liveDate || date <= liveDate))
  const canMovePrevious = Boolean(previousDate)
  const canMoveNext = Boolean(nextDate)

  return (
    <div className="flex w-full flex-wrap items-center gap-1.5 sm:w-auto sm:justify-end">
      <button
        type="button"
        aria-label="Previous CC session"
        disabled={!canMovePrevious}
        onClick={() => {
          if (previousDate) onDateChange(previousDate)
        }}
        className="h-8 min-w-8 rounded border border-border bg-surface px-2 font-mono text-xs text-text disabled:cursor-not-allowed disabled:opacity-35"
      >
        &lt;
      </button>
      <input
        aria-label="CC scan date"
        type="date"
        list="cc-scan-dates"
        value={selectedDate}
        max={liveDate || undefined}
        onChange={(event) => onDateChange(event.target.value)}
        onInput={(event) => onDateChange(event.currentTarget.value)}
        className="h-8 min-w-[132px] rounded border border-border bg-surface px-2 font-mono text-xs text-text outline-none"
      />
      <datalist id="cc-scan-dates">
        {sortedAvailableDates.map((date) => (
          <option key={date} value={date} />
        ))}
      </datalist>
      <button
        type="button"
        aria-label="Next CC session"
        disabled={!canMoveNext}
        onClick={() => {
          if (nextDate) onDateChange(nextDate)
        }}
        className="h-8 min-w-8 rounded border border-border bg-surface px-2 font-mono text-xs text-text disabled:cursor-not-allowed disabled:opacity-35"
      >
        &gt;
      </button>
      <button
        type="button"
        aria-label="Latest CC session"
        disabled={!liveDate || selectedDate === liveDate}
        onClick={() => onDateChange(liveDate)}
        className="h-8 rounded border border-border bg-surface px-2 text-xs text-text disabled:cursor-not-allowed disabled:opacity-35"
      >
        Latest
      </button>
    </div>
  )
}

function ChartCard({ leader }: { leader: WeeklyBreakoutLeader }) {
  return (
    <article className="overflow-hidden rounded-lg border border-border bg-surface">
      <div className="flex items-start justify-between gap-3 border-b border-border px-3 py-2">
        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-[11px] text-sub tabular-nums">#{leader.rank}</span>
            <h2 className="truncate text-lg font-semibold tracking-tight text-text">{leader.ticker}</h2>
          </div>
          <div className="mt-0.5 text-[11px] text-sub">{newHighLabel(leader.weeklyNewHigh)}</div>
        </div>
        <div className="shrink-0 text-right">
          <div className="font-mono text-lg font-semibold text-teal tabular-nums">
            {formatPct(leader.weekReturnPct)}
          </div>
          <div className="text-[11px] text-sub">weekly</div>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2 border-b border-border px-3 py-2">
        <Metric label="wRVOL" value={formatRvol(leader.weekRvol)} accent />
        <Metric label="ADR%" value={formatPlainPct(leader.adrPct)} />
        <Metric label="Vol" value={formatVolume(leader.weekVolume)} />
        <Metric label="Score" value={formatScore(leader.displayScore)} />
      </div>

      <LightweightChart chart={leader.chart} height={248} fitContent />
    </article>
  )
}

function CcChartCard({ leader }: { leader: WeeklyBreakoutLeader }) {
  const openingLeader = isOpeningCcLeader(leader)

  return (
    <article className="overflow-hidden rounded-lg border border-border bg-surface">
      <div className="flex items-start justify-between gap-3 border-b border-border px-3 py-2">
        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-[11px] text-sub tabular-nums">#{leader.ccRank ?? leader.rank}</span>
            <h2 className="truncate text-lg font-semibold tracking-tight text-text">{leader.ticker}</h2>
          </div>
          <div className="mt-0.5 text-[11px] text-sub">{newHighLabel(leader.weeklyNewHigh)}</div>
        </div>
        <div className="shrink-0 text-right">
          <div className="font-mono text-lg font-semibold text-teal tabular-nums">
            {ccBarCountLabel(leader)}
          </div>
          <div className="text-[11px] text-sub">{ccBarCountSubLabel(leader)}</div>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2 border-b border-border px-3 py-2">
        <Metric label="CC" value={formatWholeScore(leader.ccScore)} accent />
        {openingLeader ? (
          <>
            <Metric label="Close" value={formatPlainPct(leader.ccAvgCloseLocationPct ?? 0)} />
            <Metric label="Body" value={formatPlainPct(leader.ccAvgBodyPct ?? 0)} />
            <Metric label="Range" value={formatRvol(leader.ccAvgRangeVsMedian ?? 0)} />
          </>
        ) : (
          <>
            <Metric label="Gap" value={ccGapLabel(leader)} />
            <Metric label="FT Close" value={ccFollowThroughCloseLabel(leader)} />
            <Metric label="CC Vol" value={ccVolumeLabel(leader)} />
          </>
        )}
      </div>

      <LightweightChart
        chart={fixedBarChart(withGapUpFtSetupAnnotations(leader))}
        height={248}
        fitContent
        interactive={openingLeader}
      />
    </article>
  )
}

function LeaderDisclosure({ leader }: { leader: WeeklyBreakoutLeader }) {
  return (
    <details name="weekly-breakout-leader" className="group border-b border-border/70 last:border-b-0 open:bg-bg/60">
      <summary className="grid cursor-pointer list-none grid-cols-[64px_180px_120px_120px_120px_140px_160px_100px] items-center hover:bg-surface-hover/60 [&::-webkit-details-marker]:hidden">
        <span className="px-3 py-2 font-mono text-sub tabular-nums">{leader.rank}</span>
        <span className="flex items-center gap-2 px-3 py-2 font-semibold text-text group-open:text-teal">
          <span className="font-mono text-[10px] text-sub group-open:hidden">+</span>
          <span className="hidden font-mono text-[10px] text-sub group-open:inline">-</span>
          <span>{leader.ticker}</span>
        </span>
        <span className="px-3 py-2 font-mono text-teal tabular-nums">{formatPct(leader.weekReturnPct)}</span>
        <span className="px-3 py-2 font-mono text-text tabular-nums">{formatRvol(leader.weekRvol)}</span>
        <span className="px-3 py-2 font-mono text-text tabular-nums">{formatPlainPct(leader.adrPct)}</span>
        <span className="px-3 py-2 font-mono text-text tabular-nums">{formatVolume(leader.weekVolume)}</span>
        <span className="px-3 py-2 text-sub">{newHighLabel(leader.weeklyNewHigh)}</span>
        <span className="px-3 py-2 font-mono text-text tabular-nums">{formatScore(leader.displayScore)}</span>
      </summary>
      <div className="px-3 pb-3">
        <div className="overflow-hidden rounded-lg border border-border bg-[#1A1A1A]">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
            <div className="flex items-baseline gap-2">
              <span className="font-semibold text-text">{leader.ticker}</span>
              <span className="text-[11px] text-sub">60 daily bars</span>
            </div>
            <div className="flex flex-wrap gap-3 text-[11px]">
              <span className="font-mono text-teal tabular-nums">{formatPct(leader.weekReturnPct)}</span>
              <span className="font-mono text-text tabular-nums">wRVOL {formatRvol(leader.weekRvol)}</span>
              <span className="font-mono text-text tabular-nums">ADR {formatPlainPct(leader.adrPct)}</span>
              <span className="text-sub">{newHighLabel(leader.weeklyNewHigh)}</span>
            </div>
          </div>
          <LightweightChart chart={leader.chart} height={360} fitContent />
        </div>
      </div>
    </details>
  )
}

function CcLeaderDisclosure({
  leader,
  detailsName = 'cc-breakout-leader',
  chartLabel = '60 daily bars',
  mode = 'daily',
}: {
  leader: WeeklyBreakoutLeader
  detailsName?: string
  chartLabel?: string
  mode?: 'daily' | 'opening'
}) {
  const openingMode = mode === 'opening'
  const summaryGridClass = openingMode
    ? 'grid-cols-[64px_180px_110px_110px_130px_120px_120px_160px]'
    : 'grid-cols-[64px_160px_90px_100px_100px_110px_110px_110px_150px]'
  const [isOpen, setIsOpen] = useState(false)

  return (
    <details
      name={detailsName}
      className="group border-b border-border/70 last:border-b-0 open:bg-bg/60"
      onToggle={(event) => setIsOpen(event.currentTarget.open)}
    >
      <summary className={`grid cursor-pointer list-none ${summaryGridClass} items-center hover:bg-surface-hover/60 [&::-webkit-details-marker]:hidden`}>
        <span className="px-3 py-2 font-mono text-sub tabular-nums">{leader.ccRank ?? leader.rank}</span>
        <span className="flex items-center gap-2 px-3 py-2 font-semibold text-text group-open:text-teal">
          <span className="font-mono text-[10px] text-sub group-open:hidden">+</span>
          <span className="hidden font-mono text-[10px] text-sub group-open:inline">-</span>
          <span>{leader.ticker}</span>
        </span>
        <span className="px-3 py-2 font-mono text-teal tabular-nums">{formatWholeScore(leader.ccScore)}</span>
        <span className="px-3 py-2 font-mono text-text tabular-nums">{ccBarCountLabel(leader)}</span>
        {openingMode ? (
          <>
            <span className="px-3 py-2 font-mono text-text tabular-nums">
              {formatPlainPct(leader.ccAvgCloseLocationPct ?? 0)}
            </span>
            <span className="px-3 py-2 font-mono text-text tabular-nums">
              {formatPlainPct(leader.ccAvgBodyPct ?? 0)}
            </span>
            <span className="px-3 py-2 font-mono text-text tabular-nums">
              {formatRvol(leader.ccAvgRangeVsMedian ?? 0)}
            </span>
          </>
        ) : (
          <>
            <span className="px-3 py-2 font-mono text-teal tabular-nums">{ccGapLabel(leader)}</span>
            <span className="px-3 py-2 font-mono text-text tabular-nums">{ccFollowThroughCloseLabel(leader)}</span>
            <span className="px-3 py-2 font-mono text-teal tabular-nums">{formatPct(leader.weekReturnPct)}</span>
            <span className="px-3 py-2 font-mono text-text tabular-nums">{ccVolumeLabel(leader)}</span>
          </>
        )}
        <span className="px-3 py-2 text-sub">{newHighLabel(leader.weeklyNewHigh)}</span>
      </summary>
      <div className="px-3 pb-3">
        <div className="border-t border-border/60 pt-3">
          <div className="mb-2 flex items-baseline justify-between gap-2 px-1 text-[11px] text-sub">
            <span>{chartLabel}</span>
            <span className="font-mono text-teal tabular-nums">CC {formatWholeScore(leader.ccScore)}</span>
          </div>
          {isOpen && (
            <LightweightChart
              chart={fixedBarChart(withGapUpFtSetupAnnotations(leader))}
              height={340}
              fitContent
              interactive={openingMode}
            />
          )}
        </div>
      </div>
    </details>
  )
}

function CcMobileLeaderDisclosure({
  leader,
  detailsName = 'cc-breakout-leader-mobile',
  chartLabel = '60 daily bars',
  mode = 'daily',
}: {
  leader: WeeklyBreakoutLeader
  detailsName?: string
  chartLabel?: string
  mode?: 'daily' | 'opening'
}) {
  const openingMode = mode === 'opening'
  const [isOpen, setIsOpen] = useState(false)

  return (
    <details
      name={detailsName}
      className="group border-b border-border/70 last:border-b-0 open:bg-bg/60"
      onToggle={(event) => setIsOpen(event.currentTarget.open)}
    >
      <summary className="cursor-pointer list-none px-3 py-3 [&::-webkit-details-marker]:hidden">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-[11px] text-sub tabular-nums">#{leader.ccRank ?? leader.rank}</span>
              <span className="font-semibold text-text group-open:text-teal">{leader.ticker}</span>
              <span className="font-mono text-[10px] text-sub group-open:hidden">+</span>
              <span className="hidden font-mono text-[10px] text-sub group-open:inline">-</span>
            </div>
            <div className="mt-1 truncate text-[11px] text-sub">{newHighLabel(leader.weeklyNewHigh)}</div>
          </div>
          <div className="shrink-0 text-right">
            <div className="font-mono text-base font-semibold text-teal tabular-nums">
              {formatWholeScore(leader.ccScore)}
            </div>
            <div className="text-[10px] uppercase tracking-wide text-sub">CC</div>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
          <Metric label={openingMode ? 'Opening' : 'Pattern'} value={ccBarCountLabel(leader)} />
          <Metric
            label={openingMode ? 'Close' : 'Gap'}
            value={openingMode ? formatPlainPct(leader.ccAvgCloseLocationPct ?? 0) : ccGapLabel(leader)}
          />
          <Metric
            label={openingMode ? 'Range' : 'FT Close'}
            value={openingMode ? formatRvol(leader.ccAvgRangeVsMedian ?? 0) : ccFollowThroughCloseLabel(leader)}
          />
        </div>
      </summary>
      <div className="px-2 pb-3 sm:px-3">
        <div className="border-t border-border/60 pt-3">
          <div className="mb-2 flex items-baseline justify-between gap-2 px-1 text-[11px] text-sub">
            <span>{chartLabel}</span>
            <span className="font-mono text-teal tabular-nums">CC {formatWholeScore(leader.ccScore)}</span>
          </div>
          {isOpen && (
            <LightweightChart
              chart={fixedBarChart(withGapUpFtSetupAnnotations(leader))}
              height={280}
              fitContent
              interactive={openingMode}
            />
          )}
        </div>
      </div>
    </details>
  )
}

export function CleanWeeklyBreakouts({ payload, mode = 'full' }: Props) {
  const [ccLeaders, setCcLeaders] = useState<WeeklyBreakoutLeader[]>(payload.ccLeaders ?? [])
  const [latestCcAsOf, setLatestCcAsOf] = useState(payload.asOf)
  const [selectedCcDate, setSelectedCcDate] = useState(payload.asOf)
  const [activeCcDate, setActiveCcDate] = useState(payload.asOf)
  const [ccHasData, setCcHasData] = useState(Boolean(payload.ccLeaders?.length))
  const [availableCcDates, setAvailableCcDates] = useState<string[]>(payload.asOf ? [payload.asOf] : [])
  const topLeaders = useMemo(() => payload.leaders.slice(0, 3), [payload.leaders])
  const topCcLeaders = useMemo(() => ccLeaders.slice(0, 3), [ccLeaders])
  const filters = payload.filters
  const selectedCcDateIsLatest = selectedCcDate === latestCcAsOf

  useEffect(() => {
    if (mode !== 'cc') return undefined
    let cancelled = false

    async function loadDailyCc() {
      try {
        const params = selectedCcDate ? `?date=${encodeURIComponent(selectedCcDate)}` : ''
        const response = await fetch(`/api/breakouts/daily-cc${params}`, { cache: 'no-store' })
        if (!response.ok) return
        const next = (await response.json()) as DailyCcLivePayload
        if (cancelled) return
        const nextLatestAsOf = next.latestAsOf || next.asOf
        setLatestCcAsOf(nextLatestAsOf)
        setActiveCcDate(next.asOf || selectedCcDate || nextLatestAsOf)
        setCcLeaders(next.ccLeaders ?? [])
        setCcHasData(Boolean(next.hasData))
        if (next.availableDates?.length) setAvailableCcDates(next.availableDates)
        setSelectedCcDate((current) => current || nextLatestAsOf)
      } catch {
        // Keep the last known list visible if a live refresh misses.
      }
    }

    loadDailyCc()
    const interval = selectedCcDateIsLatest ? window.setInterval(loadDailyCc, 30_000) : undefined
    return () => {
      cancelled = true
      if (interval !== undefined) window.clearInterval(interval)
    }
  }, [mode, selectedCcDate, selectedCcDateIsLatest])

  const ccDateLabel = activeCcDate ? formatDate(activeCcDate) : 'No data'
  const ccMatchLabel = ccHasData ? `${ccLeaders.length} matches` : 'No data'
  const ccEmptyLabel = ccHasData ? 'No matches.' : 'No data for this date.'

  const dailyCcSection = (
    <section className={mode === 'cc' ? 'mt-0' : 'mt-4'}>
      <div className="mb-2 flex flex-col gap-2 border-b border-border pb-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-[15px] font-semibold tracking-tight">{CC_DISPLAY_NAME}</h2>
          <div className="mt-1 text-xs text-sub">
            {ccDateLabel} &middot; {ccMatchLabel}
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5 text-[11px] text-sub">
          <span className="rounded border border-border bg-surface px-2 py-1">Gap up day</span>
          <span className="rounded border border-border bg-surface px-2 py-1">Follow-through</span>
          <span className="rounded border border-border bg-surface px-2 py-1">Close 80%+</span>
          <span className="rounded border border-border bg-surface px-2 py-1">Vol 1.4x+</span>
        </div>
      </div>

      {topCcLeaders.length > 0 ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {topCcLeaders.map((leader) => (
            <CcChartCard key={leader.ticker} leader={leader} />
          ))}
        </div>
      ) : (
        <div className="flex min-h-[160px] items-center justify-center rounded-lg border border-border bg-surface text-sm text-sub">
          {ccEmptyLabel}
        </div>
      )}

      {(mode === 'cc' || ccLeaders.length > 0) && (
        <section className="mt-3 overflow-hidden rounded-lg border border-border bg-surface">
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <h3 className="text-sm font-semibold tracking-tight">Rank</h3>
            <span className="text-[11px] text-sub">{ccDateLabel}</span>
          </div>
          {ccLeaders.length > 0 ? (
            <>
              <div className="md:hidden">
                {ccLeaders.map((leader) => (
                  <CcMobileLeaderDisclosure key={leader.ticker} leader={leader} />
                ))}
              </div>
              <div className="hidden overflow-x-auto md:block">
                <div className="min-w-[1080px] text-left text-xs">
                  <div className="grid grid-cols-[64px_160px_90px_100px_100px_110px_110px_110px_150px] bg-bg text-[10px] uppercase tracking-wide text-sub">
                    <span className="px-3 py-2 font-medium">#</span>
                    <span className="px-3 py-2 font-medium">Ticker</span>
                    <span className="px-3 py-2 font-medium">CC</span>
                    <span className="px-3 py-2 font-medium">Pattern</span>
                    <span className="px-3 py-2 font-medium">Gap</span>
                    <span className="px-3 py-2 font-medium">FT Close</span>
                    <span className="px-3 py-2 font-medium">Week</span>
                    <span className="px-3 py-2 font-medium">CC Vol</span>
                    <span className="px-3 py-2 font-medium">New High</span>
                  </div>
                  {ccLeaders.map((leader) => (
                    <CcLeaderDisclosure key={leader.ticker} leader={leader} />
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="flex min-h-[120px] items-center justify-center px-3 py-6 text-sm text-sub">
              {ccEmptyLabel}
            </div>
          )}
        </section>
      )}
    </section>
  )

  if (mode === 'cc') {
    return (
      <div className="mx-auto max-w-[1600px] px-2 py-2 sm:px-3 sm:py-3">
        <header className="mb-3 flex flex-col gap-2 border-b border-border pb-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="max-w-5xl text-[17px] font-bold leading-snug tracking-tight">
              {CC_DISPLAY_NAME}
            </h1>
            <div className="mt-1 text-xs text-sub">
              {ccDateLabel} &middot; {ccMatchLabel}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Link
              href="/cc/study"
              className="h-8 rounded border border-border bg-surface px-3 text-xs font-medium leading-8 text-sub hover:border-border-hover hover:text-text"
            >
              Charts
            </Link>
            <CcHistoryControls
              selectedDate={selectedCcDate || activeCcDate}
              liveDate={latestCcAsOf}
              availableDates={availableCcDates}
              onDateChange={setSelectedCcDate}
            />
          </div>
        </header>
        {dailyCcSection}
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-[1600px] px-2 py-2 sm:px-3 sm:py-3">
      <header className="mb-3 flex flex-col gap-2 border-b border-border pb-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[17px] font-bold tracking-tight">Weekly Breakouts</h1>
          <div className="mt-1 text-xs text-sub">
            {payload.asOf ? formatDate(payload.asOf) : 'No data'} &middot; {payload.leaders.length} matches
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5 text-[11px] text-sub">
          <span className="rounded border border-border bg-surface px-2 py-1">RTH</span>
          <span className="rounded border border-border bg-surface px-2 py-1">
            Week {formatPct(filters.minWeekReturnPct)}
          </span>
          <span className="rounded border border-border bg-surface px-2 py-1">
            wRVOL {formatRvol(filters.minWeekRvol)}
          </span>
          <span className="rounded border border-border bg-surface px-2 py-1">{filters.chartBars} bars</span>
        </div>
      </header>

      {topLeaders.length > 0 ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {topLeaders.map((leader) => (
            <ChartCard key={leader.ticker} leader={leader} />
          ))}
        </div>
      ) : (
        <div className="flex min-h-[320px] items-center justify-center rounded-lg border border-border bg-surface text-sm text-sub">
          No weekly breakout data.
        </div>
      )}

      <section className="mt-4 overflow-hidden rounded-lg border border-border bg-surface">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <h2 className="text-sm font-semibold tracking-tight">Rank</h2>
          <span className="text-[11px] text-sub">Event exclusions: {filters.eventExclusions ? 'on' : 'off'}</span>
        </div>
        <div className="overflow-x-auto">
          <div className="min-w-[1000px] text-left text-xs">
            <div className="grid grid-cols-[64px_180px_120px_120px_120px_140px_160px_100px] bg-bg text-[10px] uppercase tracking-wide text-sub">
              <span className="px-3 py-2 font-medium">#</span>
              <span className="px-3 py-2 font-medium">Ticker</span>
              <span className="px-3 py-2 font-medium">Week</span>
              <span className="px-3 py-2 font-medium">wRVOL</span>
              <span className="px-3 py-2 font-medium">ADR%</span>
              <span className="px-3 py-2 font-medium">Volume</span>
              <span className="px-3 py-2 font-medium">New High</span>
              <span className="px-3 py-2 font-medium">Score</span>
            </div>
            {payload.leaders.map((leader) => (
              <LeaderDisclosure key={leader.ticker} leader={leader} />
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}
