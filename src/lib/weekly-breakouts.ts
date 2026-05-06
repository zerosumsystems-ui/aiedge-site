import { readFile } from 'fs/promises'
import path from 'path'
import type { WeeklyBreakoutLeader, WeeklyBreakoutPayload } from '@/lib/types'

const EMPTY_WEEKLY_BREAKOUTS: WeeklyBreakoutPayload = {
  screen: 'clean_weekly_breakouts',
  asOf: '',
  generatedAt: '',
  filters: {
    rthOnly: true,
    minWeekReturnPct: 10,
    minWeekRvol: 1.4,
    minCleanlinessScore: 45,
    eventExclusions: true,
    artifactExclusions: true,
    chartBars: 60,
  },
  excludedTickers: [],
  leaders: [],
  ccLeaders: [],
  ccTimeframes: {
    '4h': { timeframe: '4h', label: '4H', source: 'not_exported', leaders: [] },
    '1h': { timeframe: '1h', label: '1H', source: 'not_exported', leaders: [] },
    '30min': { timeframe: '30min', label: '30M', source: 'not_exported', leaders: [] },
    '5min': { timeframe: '5min', label: '5M', source: 'not_exported', leaders: [] },
  },
}

export interface DailyCcSnapshotPayload {
  asOf: string
  latestAsOf: string
  generatedAt: string
  hasData: boolean
  availableDates: string[]
  ccLeaders: WeeklyBreakoutLeader[]
}

interface DailyCcHistoryFile {
  asOf: string
  generatedAt: string
  ccLeaders: WeeklyBreakoutLeader[]
}

interface DailyCcHistoryIndex {
  dates?: string[]
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export async function getCleanWeeklyBreakouts(): Promise<WeeklyBreakoutPayload> {
  const filePath = path.join(process.cwd(), 'public', 'data', 'clean-weekly-breakouts.json')
  try {
    const raw = await readFile(filePath, 'utf8')
    return JSON.parse(raw) as WeeklyBreakoutPayload
  } catch (err) {
    console.error('[weekly-breakouts] failed to read clean-weekly-breakouts.json:', err)
    return EMPTY_WEEKLY_BREAKOUTS
  }
}

async function getDailyCcHistoryDates(latestAsOf: string): Promise<string[]> {
  const indexPath = path.join(process.cwd(), 'public', 'data', 'cc-history', 'index.json')
  try {
    const raw = await readFile(indexPath, 'utf8')
    const index = JSON.parse(raw) as DailyCcHistoryIndex
    const dates = (index.dates ?? [])
      .filter((date) => ISO_DATE_RE.test(date))
      .sort()
    return dates.includes(latestAsOf) || !latestAsOf ? dates : [...dates, latestAsOf].sort()
  } catch {
    return latestAsOf ? [latestAsOf] : []
  }
}

export async function getDailyCcSnapshot(date?: string | null): Promise<DailyCcSnapshotPayload> {
  const latest = await getCleanWeeklyBreakouts()
  const latestAsOf = latest.asOf
  const requestedDate = date && ISO_DATE_RE.test(date) ? date : latestAsOf
  const availableDates = await getDailyCcHistoryDates(latestAsOf)

  if (!requestedDate || requestedDate === latestAsOf) {
    return {
      asOf: latestAsOf,
      latestAsOf,
      generatedAt: latest.generatedAt,
      hasData: true,
      availableDates,
      ccLeaders: latest.ccLeaders,
    }
  }

  const snapshotPath = path.join(process.cwd(), 'public', 'data', 'cc-history', `${requestedDate}.json`)
  try {
    const raw = await readFile(snapshotPath, 'utf8')
    const snapshot = JSON.parse(raw) as DailyCcHistoryFile
    return {
      asOf: snapshot.asOf || requestedDate,
      latestAsOf,
      generatedAt: snapshot.generatedAt || '',
      hasData: true,
      availableDates,
      ccLeaders: snapshot.ccLeaders ?? [],
    }
  } catch {
    return {
      asOf: requestedDate,
      latestAsOf,
      generatedAt: '',
      hasData: false,
      availableDates,
      ccLeaders: [],
    }
  }
}
