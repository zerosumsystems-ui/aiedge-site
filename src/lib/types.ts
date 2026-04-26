/** Chart types — interactive candles (Phase 6, replaces base64 PNGs) */

export interface Bar {
  t: number         // unix seconds (ET session)
  o: number
  h: number
  l: number
  c: number
  v?: number        // optional volume
}

export interface KeyLevels {
  priorClose?: number
  priorDayHigh?: number
  priorDayLow?: number
  overnightHigh?: number
  overnightLow?: number
  premarketHigh?: number
  premarketLow?: number
}

export type SignalDirection = "long" | "short"

export interface ChartAnnotations {
  phaseLabel?: string                   // "bear_spike"
  alwaysIn?: string                     // "long" | "short" | "unclear" (or descriptive like "short_moderate")
  strength?: string                     // "short_4"
  signalBar?: { time: number; direction: SignalDirection }
  trendline?: {
    from: { t: number; price: number }
    to: { t: number; price: number }
  }
  stopPrice?: number
  targetPrice?: number
  entryPrice?: number                   // solid entry line (drawn alongside stop/target)
  entryMode?: "stop" | "limit" | "market"
  exitPrice?: number                    // solid exit line (for round-trip charts)
  entryMarker?: { time: number; direction: SignalDirection }  // BUY at bar time
  exitMarker?: { time: number; direction: SignalDirection }   // SELL at bar time
  verdict?: { decision: string; probability: number; rr: number }
  agreement?: "AGREE" | "PARTIAL" | "MINOR" | "MAJOR" | "DISAGREE" | "INVERTED"
  adrMultiple?: number
}

export type ChartTimeframe = "5min" | "15min" | "1h" | "daily" | "weekly"

export interface ChartData {
  bars: Bar[]
  timeframe: ChartTimeframe
  keyLevels?: KeyLevels
  annotations?: ChartAnnotations
}

/** Vault / Knowledge base types */

export interface VaultNote {
  slug: string          // e.g. "brooks-pa/patterns/H2"
  title: string         // extracted from first # heading
  folder: string        // e.g. "Brooks PA/patterns"
  filename: string      // e.g. "H2.md"
  content: string       // raw markdown
  wikiLinks: string[]   // extracted [[link]] targets
}

export interface VaultPayload {
  notes: VaultNote[]
  syncedAt: string      // ISO timestamp
  noteCount: number
}

export interface VaultTree {
  name: string
  path: string
  children?: VaultTree[]
  note?: VaultNote
}

/** History types */

export interface DailySnapshot {
  date: string          // "2026-04-15"
  payload: ScanPayload
  capturedAt: string    // ISO timestamp
}

export interface HistoryPayload {
  snapshots: DailySnapshot[]
  syncedAt: string
}

/** Scanner data types — mirrors the live_scanner.py output format */

export interface ComponentScores {
  spike: number   // 0–4: Spike quality
  gap: number     // -2–+2: Gap integrity
  pull: number    // -1–+2: Pullback quality
  ft: number      // -1.5–+2: Follow through
  ma: number      // 0–1: MA separation
  vol: number     // 0–1: Volume confirmation
  tail: number    // -0.5–+1: Tail quality
  spt: number     // 0–3: Small pullback trend
  bpa: number     // -1–+2: BPA alignment
}

export type Signal = "BUY" | "SELL" | "WAIT" | "FOG" | "AVOID"
export type AdrTier = "cold" | "warm" | "hot" | "extreme"
export type FillStatus = "held" | "partial" | "recovered" | "failed"
export type HtfAlignment = "aligned" | "mixed" | "opposed"

// Mirrors aiedge/context/trend.py TrendState — 12 contributors aggregated.
export type TrendDirection = "up" | "down" | "none"
export type TrendStructure =
  | "bull_spike" | "bear_spike"
  | "bull_channel" | "bear_channel"
  | "trading_range"

export interface TrendStateData {
  direction: TrendDirection
  strength: number            // 0–1 aggregate magnitude
  ageBars: number
  structure: TrendStructure
  confidence: number          // 0–1
  lagBars: number
  contributors?: Record<string, number>
}

export interface ScanResult {
  ticker: string
  rank: number
  urgency: number       // 0–10
  uncertainty: number   // 0–10
  signal: Signal
  dayType: string       // e.g. "spike_and_channel"
  cyclePhase?: string   // e.g. "↓ channel 0.36"
  fillStatus?: FillStatus
  htfAlignment?: HtfAlignment   // daily + weekly bias vs setup direction (scanner B4)
  adr: number           // dollar ADR
  adrRatio: number      // current move / ADR (e.g. 0.7)
  adrMult: number       // ADR multiple
  adrTier: AdrTier
  movement: string      // "NEW", "+2", "-1"
  components: ComponentScores
  warning?: string
  summary: string
  chart?: ChartData    // interactive OHLC + key levels (Phase 6)
  bpaActiveSetups?: string[]   // BPA setups currently active — e.g. ["H2", "spike_channel"]
  phase?: string               // market phase — e.g. "trend_from_open", "trading_range"
  trendState?: TrendStateData  // canonical trend aggregator (12 contributors → direction+strength+structure)
}

export interface ScanPayload {
  timestamp: string     // "12:55 PM ET"
  date: string          // "2026-04-15"
  symbolsScanned: number
  passedFilters: number
  scanTime: string      // "1.23s"
  nextScan: string      // "1:00 PM"
  results: ScanResult[]
}

/** Pattern Lab types */

export interface SetupStats {
  total: number
  wins: number
  losses: number
  scratches: number
  incomplete: number
  win_rate: number | null
  avg_mfe: number | null
  avg_mae: number | null
}

export interface ContextRow {
  setup_type: string
  total: number
  wins: number
  losses: number
  win_rate: number | null
  avg_mfe: number | null
  avg_mae: number | null
}

export interface TimeBucket {
  bucket_start: number
  total: number
  wins: number
  losses: number
}

export interface RecentDetection {
  ticker: string
  setupType: string
  direction: string
  detectedAt: string
  confidence: number
  result: string | null
  mfe: number | null
  mae: number | null
  cyclePhase: string | null
  signal: string | null
  urgency: number | null
}

export interface PatternLabPayload {
  summary: {
    totalDetections: number
    datesTracked: number
    dateRange: { from: string; to: string }
  }
  bySetup: Record<string, SetupStats>
  byContext: Record<string, Record<string, ContextRow[]>>
  byTimeOfDay: TimeBucket[]
  recentDetections: RecentDetection[]
}

/** Trade Catalog types */

export type TradeDecision = "BUY" | "SELL" | "WAIT" | "AVOID"
export type TradeOutcome = "win" | "loss" | "scratch" | "pending" | "no_trade"
export type AgreementLevel = "AGREE" | "PARTIAL" | "MINOR" | "MAJOR" | "DISAGREE" | "INVERTED"

export interface TradeRead {
  id: string                    // "2026-04-15_IONQ"
  ticker: string
  date: string                  // "2026-04-15"
  time: string                  // "12:55 PM ET"

  // Scanner's view
  rankScanner: number
  urgScanner: number
  signalScanner: string

  // Brooks read
  phaseBrooks: string           // "bear_spike", "trading_range", etc.
  alwaysInBrooks: string        // "short_moderate", "long_weak"
  strengthNet: string           // "short_4", "balanced"
  setupBrooks: string           // "h2", "l2", "none"
  signalBarIndex: number | null
  stopPrice: number | null
  targetPrice: number | null
  decisionBrooks: TradeDecision
  probabilityBrooks: number
  rrBrooks: number
  qualityScore: number          // 0–10

  // Comparison
  agreementVsScanner: AgreementLevel
  agreementReason: string

  // Narrative
  contextMarkdown: string       // full Brooks read (markdown)
  annotationNotes: string       // trendline/signal bar notes

  // Outcome (added post-hoc)
  outcome: TradeOutcome
  chart?: ChartData
}

export interface TradesPayload {
  trades: TradeRead[]
  syncedAt: string
  tradeCount: number
}

/** Filled Trades (broker auto-log) types — populated by /api/snaptrade/sync */

import type { EquityStats } from './stats'

export type FillAction = "BUY" | "SELL"

export interface FilledTrade {
  id: string                    // brokerTradeId or `${fillTime}_${ticker}_${action}_${qty}`
  ticker: string
  action: FillAction
  qty: number
  price: number
  commission: number
  fees: number
  amount: number                // qty * price (pre-fee notional)
  fillTime: string              // ISO
  date: string                  // YYYY-MM-DD, ET
  accountId: string
  accountName: string | null    // institution + account number label
  brokerTradeId: string | null
  description: string | null
}

export interface PairedTrade {
  fill: FilledTrade
  pairedReadId: string | null   // → TradeRead.id (null = orphan fill)
  rMultiple: number | null
  realizedPnL: number | null
}

/**
 * A closed round-trip trade — one or more entry fills paired to one or more
 * exit fills via FIFO matching. `side='long'` = BUY then SELL, `side='short'`
 * = SELL then BUY (cover). Open positions (entries with no matching exit yet)
 * appear with `isOpen: true` and null exit fields.
 */
export interface RoundTrip {
  id: string                 // stable: `${ticker}_${firstEntryFillId}_${firstExitFillId}`
  ticker: string
  side: "long" | "short"
  qty: number                // size of the round-trip (shares closed)
  entryTime: string          // ISO — earliest entry fill
  entryPrice: number         // qty-weighted average entry
  exitTime: string | null    // ISO — latest exit fill, null if still open
  exitPrice: number | null   // qty-weighted average exit
  durationMs: number | null  // exitTime − entryTime, null if open
  realizedPnL: number | null // (exit−entry) × qty × sign, null if open
  returnPct: number | null   // realizedPnL / (entryPrice × qty)
  commissions: number        // sum of fill commissions + fees across all legs
  entryFillIds: string[]     // contributing fill ids (for drilldown)
  exitFillIds: string[]
  pairedReadId: string | null // inherits from entry fill's paired read
  isOpen: boolean
}

export interface FilledTradesPayload {
  fills: FilledTrade[]
  paired: PairedTrade[]                     // Phase 2: populated; Phase 1: empty
  stats: Record<string, EquityStats>        // per-setupBrooks stats (Phase 2)
  roundTrips: RoundTrip[]                   // FIFO-paired entries + exits (Phase 3)
  syncedAt: string
  lastSyncError: string | null
  accountCount: number
}

/** Journal types */

export type JournalEntryType = "daily_read" | "mistake" | "lesson" | "audit_note"

export interface JournalEntry {
  id: string                    // "2026-04-15_lesson_L1"
  date: string
  type: JournalEntryType
  title: string
  content: string               // markdown
  linkedTickers: string[]
  linkedVaultNotes: string[]    // vault slugs
  source: string                // "audit", "self_eval", "manual"
}

export interface JournalPayload {
  entries: JournalEntry[]
  syncedAt: string
  entryCount: number
}

/** Review (Brooks Audit) types */

export type DivergenceClass = "AGREE" | "MINOR" | "MAJOR" | "INVERTED"

export interface AuditSymbolRow {
  rankScanner: number
  rankBrooks: number
  rankDelta: number
  ticker: string
  urgScanner: number
  brooksQualityScore: number
  signalScanner: string
  decisionBrooks: TradeDecision
  phaseScanner: string
  phaseBrooks: string
  alwaysInScanner: string
  alwaysInBrooks: string
  probabilityBrooks: number
  rrBrooks: number
  agreementVsScanner: AgreementLevel
  agreementReason: string
  divergenceClass: DivergenceClass
  chart?: ChartData
  readMarkdown?: string
}

export interface AuditFailureMode {
  id: string
  title: string
  affectedTickers: string[]
  fileCitation: string
  description: string
}

export interface AuditTop5BrooksRow {
  ticker: string
  rankScanner: number
  signalScanner: string
  decisionBrooks: TradeDecision
  probability: number
  rr: number
}

export interface AuditTop5ScannerRow {
  ticker: string
  urgScanner: number
  signalScanner: string
  decisionBrooks: TradeDecision
  brooksQualityScore: number
  agreement: AgreementLevel
}

export interface AuditDistribution<T extends string> {
  class: T
  count: number
  pct: number
}

export interface AuditSummary {
  auditDate: string
  auditTime: string
  auditDir: string
  symbolCount: number
  agreementDistribution: AuditDistribution<AgreementLevel>[]
  divergenceDistribution: AuditDistribution<DivergenceClass>[]
  brooksTop5: AuditTop5BrooksRow[]
  scannerTop5: AuditTop5ScannerRow[]
  failureModes: AuditFailureMode[]
  summaryMarkdown: string
  methodologyCritiqueMarkdown: string
}

export interface AuditHistoryEntry {
  auditDir: string
  auditDate: string
  auditTime: string
  symbolCount: number
}

export interface AuditPayload {
  latest: AuditSummary | null
  symbols: AuditSymbolRow[]
  history: AuditHistoryEntry[]
  backtests?: BacktestCorpus | null
  recentResearch?: RecentResearchNote[]
  syncedAt: string
}

/** Recent research notes surfaced on /review — pulled from vault
 * Scanner/methodology/ and Journal/backtest-results/ folders */
export interface RecentResearchNote {
  slug: string          // vault slug, links to /knowledge/[slug]
  title: string         // derived from first # heading or filename
  folder: string        // e.g. "Scanner/methodology"
  filename: string      // e.g. "small-pullback-trend-scoring.md"
  date: string          // YYYY-MM-DD parsed from filename or content, or ''
  excerpt: string       // first ~240 chars of body text
}

/** Urgency-gated backtest corpus (vault/Scanner/backtests/) */

export interface BacktestSetupRow {
  setup: string
  n: number
  wrPct: number         // e.g. 56 for 56%
  expR: number          // expectancy in R (e.g. +0.67)
  ciLow: number | null  // 95% CI low on E[R] (null if too small to compute)
  ciHigh: number | null
  verdict: string
}

export interface BacktestMonthRow {
  label: string         // "M6", "M5", "Prior daily log", "Original 30-day"
  range: string         // "2025-08-13 → 2025-09-11"
  w: number
  l: number
  i: number
  wrPct: number
  top10WrPct: number | null
  deltaPts: number | null // top-tier WR minus top-10 WR
}

export interface BacktestDailyRow {
  date: string          // "2026-03-06"
  topTierNames: string
  topTierN: number      // resolved trades
  topTierWL: string     // "1W / 0L" or "—"
  notes: string
}

export interface BacktestCorpus {
  period: string        // "2025-08-13 → 2026-04-17"
  computed: string      // "2026-04-18"
  headline: {
    topTierW: number
    topTierL: number
    topTierI: number
    topTierWrPct: number
    expectancyR: number
    expectancyCiLow: number
    expectancyCiHigh: number
    top10W: number
    top10L: number
    top10I: number
    top10WrPct: number
    runIdCount: number
  }
  perSetup: BacktestSetupRow[]
  perMonth: BacktestMonthRow[]
  dailyLog: BacktestDailyRow[]
  rollupMarkdown: string  // full ROLLUP_6MO body for expandable viewer
}

/** Routines — autonomous-job status dashboard (v0: status strip) */

export type RoutineCategory =
  | "scanner"
  | "briefing"
  | "videopipeline"
  | "gaps"
  | "sync"
  | "other"

export type RoutineHealth = "healthy" | "stale" | "failed" | "unknown"

export interface RoutineStatus {
  id: string                         // "com.aiedge.scanner"
  label: string                      // "AI Edge Scanner"
  category: RoutineCategory
  schedule: string                   // human-readable: "Mon–Fri 09:15 → 16:05 ET"
  lastRunAt: string | null           // ISO timestamp, null if never / unknown
  lastExitStatus: number | null      // 0=success, non-zero=fail, null=unknown
  outputSummary: string | null       // one-liner, e.g. "5 top-urgency"
  status: RoutineHealth
}

export interface RoutinesPayload {
  routines: RoutineStatus[]
  syncedAt: string
  hostName: string
}
