import { readFile } from 'fs/promises'
import path from 'path'

export interface BguFilters {
  minIntradayGainPct: number
  minVolumeRvol: number
  minAvgVolumeShares: number
  highWindowDays: number
  vol60dWindow: number
  isolatedSpikeMult: number
  isolatedSpikeWindow: number
  requireAboveSma200: boolean
  requireNewHigh: boolean
  requireVol60dHigh: boolean
  excludeEtfs: boolean
}

export interface BguTrade {
  ticker: string
  signalDate: string
  intradayGainPct: number
  gapUpPct: number
  closeLocationPct: number
  volumeRvol: number
  avgVolShares: number | null
  avgDollarVolM: number | null
  gapDayOpen: number
  gapDayHigh: number
  gapDayLow: number
  gapDayClose: number
  nextOpen: number
  nextClose: number
  /** Entry price (next-day close). */
  entryPrice: number
  /** Stop price (gap-day low). */
  stopPrice: number
  /** Stop distance from entry, signed pct (always negative). */
  stopDistancePct: number
  /** Exit reason: stop or time. */
  exitReason: 'stop' | 'time'
  exitDate: string
  exitPrice: number
  /** Days held from entry to exit. */
  daysHeld: number
  /** Realized return percentage. */
  returnPct: number
  /** Risk multiple (returnPct / stopDistancePct). */
  rMultiple: number
  /** Max favorable excursion percent over the trade. */
  mfePct: number
  /** Max adverse excursion percent over the trade. */
  maePct: number
}

export interface BguAggregateStats {
  totalTrades: number
  winRatePct: number
  avgGainPct: number
  avgLossPct: number
  avgRMultiple: number
  evPct: number
  evR: number
  totalRMultiples: number
  /** Annualized R earned per share-unit risk. */
  annualR: number
  /** Span of the dataset in years. */
  spanYears: number
  start: string
  end: string
}

export interface BguPayload {
  generatedAt: string
  filters: BguFilters
  stats: BguAggregateStats
  trades: BguTrade[]
}

const PAYLOAD_FILE = path.join(
  process.cwd(),
  'public',
  'data',
  'buyable-gap-up',
  'all-trades.json'
)

const EMPTY: BguPayload = {
  generatedAt: '',
  filters: {
    minIntradayGainPct: 15,
    minVolumeRvol: 1.5,
    minAvgVolumeShares: 500_000,
    highWindowDays: 50,
    vol60dWindow: 60,
    isolatedSpikeMult: 1.5,
    isolatedSpikeWindow: 30,
    requireAboveSma200: true,
    requireNewHigh: true,
    requireVol60dHigh: true,
    excludeEtfs: true,
  },
  stats: {
    totalTrades: 0,
    winRatePct: 0,
    avgGainPct: 0,
    avgLossPct: 0,
    avgRMultiple: 0,
    evPct: 0,
    evR: 0,
    totalRMultiples: 0,
    annualR: 0,
    spanYears: 0,
    start: '',
    end: '',
  },
  trades: [],
}

export async function getBuyableGapUp(): Promise<BguPayload> {
  try {
    const raw = await readFile(PAYLOAD_FILE, 'utf-8')
    const data = JSON.parse(raw) as BguPayload
    return data
  } catch {
    return EMPTY
  }
}
