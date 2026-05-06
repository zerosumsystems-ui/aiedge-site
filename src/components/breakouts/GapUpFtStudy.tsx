import Link from 'next/link'
import { LightweightChart } from '@/components/charts/LightweightChart'
import type {
  GapUpFtLargeSample,
  GapUpFtLargeSampleBucket,
  GapUpFtLargeSampleStrategy,
  GapUpFtLargeSampleThreshold,
} from '@/lib/gap-up-ft-study'
import type { GapUpFtSetupChart } from '@/lib/gap-up-ft-setup-charts'

interface Props {
  setups: GapUpFtSetupChart[]
  largeSample: GapUpFtLargeSample
}

const NEW_HIGH_LABELS: Record<string, string> = {
  '52w_closing_high': '52W Close',
  '52w_intraday_high': '52W High',
  '20w_closing_high': '20W Close',
  '20w_intraday_high': '20W High',
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

function formatPct(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined) return '-'
  return `${value >= 0 ? '+' : ''}${value.toFixed(digits)}%`
}

function signedPct(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined) return '-'
  return `${value > 0 ? '+' : ''}${value.toFixed(digits)}%`
}

function formatPlainPct(value: number | null | undefined): string {
  if (value === null || value === undefined) return '-'
  return `${value.toFixed(1)}%`
}

function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) return '-'
  return value.toLocaleString('en-US')
}

function newHighLabel(value: string): string {
  return NEW_HIGH_LABELS[value] ?? value.replaceAll('_', ' ')
}

function dateRange(setups: GapUpFtSetupChart[]): string {
  if (!setups.length) return 'No setup charts'
  const dates = setups.map((setup) => setup.asOf).sort()
  return `${formatDate(dates[0])} - ${formatDate(dates[dates.length - 1])}`
}

function forwardBarsLabel(setup: GapUpFtSetupChart): string {
  return `${setup.postSetupBars}/${setup.postSetupTargetBars}`
}

function SetupMetric({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded border border-border bg-bg px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-wide text-sub">{label}</div>
      <div className={`mt-0.5 font-mono text-sm font-semibold tabular-nums ${accent ? 'text-teal' : 'text-text'}`}>
        {value}
      </div>
    </div>
  )
}

const STRATEGY_LABELS: Record<string, string> = {
  first_daily_pullback_h1: 'Daily pullback H1',
  next_open: 'After-FT open',
  ft_close: 'FT daily close proxy',
}

function strategyLabel(strategy: string): string {
  return STRATEGY_LABELS[strategy] ?? strategy.replaceAll('_', ' ')
}

function fiveDay(strategy: GapUpFtLargeSampleStrategy | undefined) {
  return strategy?.horizons?.['5'] ?? null
}

function LargeStrategyCard({ name, strategy }: { name: string; strategy: GapUpFtLargeSampleStrategy }) {
  const stats = fiveDay(strategy)
  const positive = (stats?.avgPct ?? 0) >= 0
  return (
    <article className="rounded-lg border border-border bg-surface p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold tracking-tight">{strategyLabel(name)}</h2>
          <div className="mt-1 font-mono text-[11px] text-sub">
            {formatNumber(strategy.entered)}/{formatNumber(strategy.signals)} entries / {formatPct(strategy.fillRatePct, 0)} fill
          </div>
        </div>
        <div className={`font-mono text-lg font-semibold ${positive ? 'text-teal' : 'text-red'}`}>
          {signedPct(stats?.avgPct)}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <SetupMetric label="5D win" value={formatPct(stats?.winRatePct)} accent={positive} />
        <SetupMetric label="N" value={formatNumber(stats?.n)} />
        <SetupMetric label="Avg gain" value={signedPct(stats?.avgGainPct)} accent />
        <SetupMetric label="Avg loss" value={signedPct(stats?.avgLossPct)} />
        <SetupMetric label="MFE" value={signedPct(stats?.avgMfePct)} accent />
        <SetupMetric label="MAE" value={signedPct(stats?.avgMaePct)} />
      </div>
      <div className="mt-2 rounded border border-border bg-bg px-2 py-1.5 text-xs">
        <div className="text-[10px] uppercase tracking-wide text-sub">Original gap corr 5D</div>
        <div className="mt-0.5 font-mono text-sm font-semibold text-text">
          {strategy.gapUpReturnCorrelation5D === null ? '-' : strategy.gapUpReturnCorrelation5D.toFixed(3)}
        </div>
      </div>
    </article>
  )
}

function GapThresholdTable({ title, thresholds }: { title: string; thresholds: GapUpFtLargeSampleThreshold[] }) {
  return (
    <section className="overflow-hidden rounded-lg border border-border bg-surface">
      <div className="border-b border-border px-3 py-2">
        <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
      </div>
      <div className="overflow-x-auto">
        <div className="min-w-[640px] text-xs">
          <div className="grid grid-cols-[100px_repeat(7,1fr)] bg-bg text-[10px] uppercase tracking-wide text-sub">
            <span className="px-3 py-2">Orig gap</span>
            <span className="px-2 py-2 text-right">Signals</span>
            <span className="px-2 py-2 text-right">Entries</span>
            <span className="px-2 py-2 text-right">N</span>
            <span className="px-2 py-2 text-right">Avg</span>
            <span className="px-2 py-2 text-right">Win</span>
            <span className="px-2 py-2 text-right">Gain</span>
            <span className="px-2 py-2 text-right">Loss</span>
          </div>
          {thresholds.map((row) => (
            <div key={`${row.strategy}:${row.label}`} className="grid grid-cols-[100px_repeat(7,1fr)] border-t border-border/70">
              <span className="px-3 py-2 font-medium">{row.label}</span>
              <span className="px-2 py-2 text-right font-mono tabular-nums">{formatNumber(row.signals)}</span>
              <span className="px-2 py-2 text-right font-mono tabular-nums">{formatNumber(row.entered)}</span>
              <span className="px-2 py-2 text-right font-mono tabular-nums">{formatNumber(row.stats5D.n)}</span>
              <span className={`px-2 py-2 text-right font-mono tabular-nums ${(row.stats5D.avgPct ?? 0) >= 0 ? 'text-teal' : 'text-red'}`}>
                {signedPct(row.stats5D.avgPct)}
              </span>
              <span className="px-2 py-2 text-right font-mono tabular-nums">{formatPct(row.stats5D.winRatePct)}</span>
              <span className="px-2 py-2 text-right font-mono text-teal tabular-nums">{signedPct(row.stats5D.avgGainPct)}</span>
              <span className="px-2 py-2 text-right font-mono text-red tabular-nums">{signedPct(row.stats5D.avgLossPct)}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function GapBucketTable({ title, buckets }: { title: string; buckets: GapUpFtLargeSampleBucket[] }) {
  return (
    <section className="overflow-hidden rounded-lg border border-border bg-surface">
      <div className="border-b border-border px-3 py-2">
        <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
      </div>
      <div className="overflow-x-auto">
        <div className="min-w-[640px] text-xs">
          <div className="grid grid-cols-[100px_repeat(6,1fr)] bg-bg text-[10px] uppercase tracking-wide text-sub">
            <span className="px-3 py-2">Orig gap</span>
            <span className="px-2 py-2 text-right">Signals</span>
            <span className="px-2 py-2 text-right">N</span>
            <span className="px-2 py-2 text-right">Avg</span>
            <span className="px-2 py-2 text-right">Win</span>
            <span className="px-2 py-2 text-right">Gain</span>
            <span className="px-2 py-2 text-right">Loss</span>
          </div>
          {buckets.map((bucket) => (
            <div key={`${bucket.strategy}:${bucket.bucket}`} className="grid grid-cols-[100px_repeat(6,1fr)] border-t border-border/70">
              <span className="px-3 py-2 font-medium">{bucket.bucket}</span>
              <span className="px-2 py-2 text-right font-mono tabular-nums">{formatNumber(bucket.signals)}</span>
              <span className="px-2 py-2 text-right font-mono tabular-nums">{formatNumber(bucket.stats5D.n)}</span>
              <span className={`px-2 py-2 text-right font-mono tabular-nums ${(bucket.stats5D.avgPct ?? 0) >= 0 ? 'text-teal' : 'text-red'}`}>
                {signedPct(bucket.stats5D.avgPct)}
              </span>
              <span className="px-2 py-2 text-right font-mono tabular-nums">{formatPct(bucket.stats5D.winRatePct)}</span>
              <span className="px-2 py-2 text-right font-mono text-teal tabular-nums">{signedPct(bucket.stats5D.avgGainPct)}</span>
              <span className="px-2 py-2 text-right font-mono text-red tabular-nums">{signedPct(bucket.stats5D.avgLossPct)}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function LargeSamplePanel({ largeSample }: { largeSample: GapUpFtLargeSample }) {
  const strategyOrder = ['first_daily_pullback_h1', 'next_open', 'ft_close']
  const gapBuckets = largeSample.gapBuckets ?? []
  const gapThresholds = largeSample.gapThresholds ?? []
  const afterFtOpenBuckets = gapBuckets.filter((bucket) => bucket.strategy === 'next_open')
  const pullbackBuckets = gapBuckets.filter((bucket) => bucket.strategy === 'first_daily_pullback_h1')
  const afterFtOpenThresholds = gapThresholds.filter((row) => row.strategy === 'next_open')
  const pullbackThresholds = gapThresholds.filter((row) => row.strategy === 'first_daily_pullback_h1')
  const minSetupPrice = typeof largeSample.filters.minSetupPrice === 'number' ? largeSample.filters.minSetupPrice : 1

  return (
    <section className="mb-3">
      <div className="mb-2 flex flex-col gap-1 border-b border-border pb-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-[15px] font-semibold tracking-tight">Large sample stats</h2>
          <div className="mt-1 text-xs text-sub">
            {formatNumber(largeSample.counts.events)} raw gap up + FT events / {largeSample.period.start} to {largeSample.period.end}
          </div>
        </div>
        <div className="text-right text-xs text-sub">
          <div>{formatNumber(largeSample.counts.tickersScanned)} symbols scanned</div>
          <div className="font-mono text-[11px]">{largeSample.source}</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <SetupMetric label="Raw events" value={formatNumber(largeSample.counts.events)} accent />
        <SetupMetric label="Symbols" value={formatNumber(largeSample.counts.tickersScanned)} />
        <SetupMetric label="Price floor" value={`$${minSetupPrice}+`} />
        <SetupMetric label="Data" value="daily OHLC" />
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-3">
        {strategyOrder.map((name) => {
          const strategy = largeSample.strategies[name]
          return strategy ? <LargeStrategyCard key={name} name={name} strategy={strategy} /> : null
        })}
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-2">
        <GapThresholdTable title="Daily pullback H1 5D by original gap day threshold" thresholds={pullbackThresholds} />
        <GapThresholdTable title="After-FT open 5D by original gap day threshold" thresholds={afterFtOpenThresholds} />
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-2">
        <GapBucketTable title="Daily pullback H1 5D by original gap day range" buckets={pullbackBuckets} />
        <GapBucketTable title="After-FT open 5D by original gap day range" buckets={afterFtOpenBuckets} />
      </div>
    </section>
  )
}

function SetupChartCard({ setup }: { setup: GapUpFtSetupChart }) {
  return (
    <article className="overflow-hidden rounded-lg border border-border bg-surface">
      <div className="flex items-start justify-between gap-3 border-b border-border px-3 py-2">
        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-[11px] text-sub tabular-nums">#{setup.rank}</span>
            <h2 className="truncate text-lg font-semibold tracking-tight text-text">{setup.ticker}</h2>
            <span className="rounded border border-border bg-bg px-1.5 py-0.5 font-mono text-[10px] text-teal">
              GAP + FT
            </span>
          </div>
          <div className="mt-0.5 text-[11px] text-sub">
            {formatDate(setup.asOf)} / {newHighLabel(setup.weeklyNewHigh)}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="font-mono text-lg font-semibold text-teal tabular-nums">
            {formatPct(setup.weekReturnPct)}
          </div>
          <div className="text-[11px] text-sub">weekly</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 border-b border-border px-3 py-2 md:grid-cols-5">
        <SetupMetric label="Gap day" value={formatDate(setup.gapDate)} />
        <SetupMetric label="FT day" value={formatDate(setup.followThroughDate)} />
        <SetupMetric label="Forward" value={forwardBarsLabel(setup)} accent={setup.postSetupBars > 0} />
        <SetupMetric label="Gap" value={formatPct(setup.ccGapUpPct)} accent />
        <SetupMetric label="FT close" value={formatPlainPct(setup.ccFollowThroughCloseLocationPct)} accent />
      </div>

      <LightweightChart chart={setup.chart} height={360} fitContent />
    </article>
  )
}

export function GapUpFtStudy({ setups, largeSample }: Props) {
  return (
    <div className="mx-auto max-w-[1600px] px-2 py-2 sm:px-3 sm:py-3">
      <header className="mb-3 flex flex-col gap-2 border-b border-border pb-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[17px] font-bold tracking-tight">gap up + ft setup charts</h1>
          <div className="mt-1 text-xs text-sub">
            {setups.length} marked daily charts / 60 bars before + up to 60 after / {dateRange(setups)}
          </div>
        </div>
        <Link
          href="/cc"
          className="inline-flex h-8 items-center rounded border border-border bg-surface px-3 text-xs font-medium text-sub hover:border-border-hover hover:text-text"
        >
          Back to setups
        </Link>
      </header>

      <div className="mb-3 grid grid-cols-2 gap-2 md:grid-cols-4">
        <SetupMetric label="Charts" value={String(setups.length)} />
        <SetupMetric label="Markers" value="GAP / FT" accent />
        <SetupMetric label="Window" value="60 pre / 60 post" />
        <SetupMetric label="Source" value="daily history" />
      </div>

      <LargeSamplePanel largeSample={largeSample} />

      {setups.length > 0 ? (
        <section className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          {setups.map((setup) => (
            <SetupChartCard key={setup.id} setup={setup} />
          ))}
        </section>
      ) : (
        <div className="flex min-h-[220px] items-center justify-center rounded-lg border border-border bg-surface text-sm text-sub">
          No setup charts found.
        </div>
      )}
    </div>
  )
}
