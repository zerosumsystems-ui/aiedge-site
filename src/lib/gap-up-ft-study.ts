import { readFile } from 'fs/promises'
import path from 'path'

export interface GapUpFtHorizonStats {
  n: number
  avgPct: number | null
  medianPct: number | null
  winRatePct: number | null
  avgGainPct: number | null
  avgLossPct: number | null
  avgMfePct: number | null
  avgMaePct: number | null
  bestPct: number | null
  worstPct: number | null
}

export interface GapUpFtStrategyStats {
  signals: number
  entered: number
  fillRatePct: number
  statuses: Record<string, number>
  horizons: Record<string, GapUpFtHorizonStats | null>
}

export interface GapUpFtEntryMatrix {
  signals: number
  strategies: Record<string, GapUpFtStrategyStats>
}

export interface GapUpFtLargeSampleStrategy {
  signals: number
  entered: number
  fillRatePct: number | null
  gapUpReturnCorrelation5D: number | null
  horizons: Record<string, GapUpFtHorizonStats>
}

export interface GapUpFtLargeSampleBucket {
  strategy: string
  bucket: string
  minGapPct: number
  maxGapPct: number | null
  signals: number
  entered: number
  fillRatePct: number | null
  stats5D: GapUpFtHorizonStats
}

export interface GapUpFtLargeSampleThreshold {
  strategy: string
  threshold: number
  label: string
  signals: number
  entered: number
  fillRatePct: number | null
  stats5D: GapUpFtHorizonStats
}

export interface GapUpFtLargeSample {
  generatedAt: string
  source: string
  period: { start: string | null; end: string | null }
  filters: Record<string, string | number | boolean | null>
  counts: Record<string, number>
  strategies: Record<string, GapUpFtLargeSampleStrategy>
  gapBuckets: GapUpFtLargeSampleBucket[]
  gapThresholds: GapUpFtLargeSampleThreshold[]
}

const EMPTY_ENTRY_MATRIX: GapUpFtEntryMatrix = {
  signals: 0,
  strategies: {},
}

const EMPTY_LARGE_SAMPLE: GapUpFtLargeSample = {
  generatedAt: '',
  source: '',
  period: { start: null, end: null },
  filters: {},
  counts: {},
  strategies: {},
  gapBuckets: [],
  gapThresholds: [],
}

export async function getGapUpFtEntryMatrix(): Promise<GapUpFtEntryMatrix> {
  const filePath = path.join(process.cwd(), 'public', 'data', 'gap-up-ft-study', 'entry-matrix-summary.json')
  try {
    const raw = await readFile(filePath, 'utf8')
    return JSON.parse(raw) as GapUpFtEntryMatrix
  } catch (err) {
    console.error('[gap-up-ft-study] failed to read entry matrix:', err)
    return EMPTY_ENTRY_MATRIX
  }
}

export async function getGapUpFtLargeSample(): Promise<GapUpFtLargeSample> {
  const filePath = path.join(process.cwd(), 'public', 'data', 'gap-up-ft-study', 'large-sample-summary.json')
  try {
    const raw = await readFile(filePath, 'utf8')
    return JSON.parse(raw) as GapUpFtLargeSample
  } catch (err) {
    console.error('[gap-up-ft-study] failed to read large sample:', err)
    return EMPTY_LARGE_SAMPLE
  }
}
