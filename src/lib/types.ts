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

export interface ScanResult {
  ticker: string
  rank: number
  urgency: number       // 0–10
  uncertainty: number   // 0–10
  signal: Signal
  dayType: string       // e.g. "spike_and_channel"
  cyclePhase?: string   // e.g. "↓ channel 0.36"
  fillStatus?: FillStatus
  adr: number           // dollar ADR
  adrRatio: number      // current move / ADR (e.g. 0.7)
  adrMult: number       // ADR multiple
  adrTier: AdrTier
  movement: string      // "NEW", "+2", "-1"
  components: ComponentScores
  warning?: string
  summary: string
  chartBase64?: string  // base64 PNG (data:image/png;base64,...)
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
