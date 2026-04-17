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
  alwaysIn?: string                     // "short_moderate"
  strength?: string                     // "short_4"
  signalBar?: { time: number; direction: SignalDirection }
  trendline?: {
    from: { t: number; price: number }
    to: { t: number; price: number }
  }
  stopPrice?: number
  targetPrice?: number
  verdict?: { decision: string; probability: number; rr: number }
  agreement?: "AGREE" | "PARTIAL" | "MINOR" | "MAJOR" | "DISAGREE" | "INVERTED"
  adrMultiple?: number
}

export type ChartTimeframe = "5min" | "15min" | "1h" | "daily"

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
  syncedAt: string
}

/** Progress (Self-Eval Calibration) types */

export type CategoryScore = "AGREE" | "PARTIAL" | "MISS"

export interface ScoreboardEntry {
  date: string
  figureNumber: string
  book: string
  phase: CategoryScore
  alwaysIn: CategoryScore
  strength: CategoryScore
  setup: CategoryScore
  decision: CategoryScore
  totalAgree: number
}

export interface Lesson {
  id: string
  title: string
  fromFigure: string
  fromDate: string
  patternMissed: string
  futureRule: string
}

export interface CategoryCount {
  agree: number
  partial: number
  miss: number
}

export interface ProgressPayload {
  scoreboard: ScoreboardEntry[]
  lessons: Lesson[]
  figuresCompleted: number
  figuresTotal: number
  nextQueue: string[]
  categoryAccuracy: {
    phase: CategoryCount
    alwaysIn: CategoryCount
    strength: CategoryCount
    setup: CategoryCount
    decision: CategoryCount
  }
  syncedAt: string
}
