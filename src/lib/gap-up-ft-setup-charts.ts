import { readFile } from 'fs/promises'
import path from 'path'
import type { ChartData, WeeklyBreakoutLeader } from '@/lib/types'
import { getGapUpFtSetupBarDates, withGapUpFtSetupAnnotations } from '@/lib/gap-up-ft-chart'

export interface GapUpFtSetupChart {
  id: string
  asOf: string
  ticker: string
  rank: number
  weeklyNewHigh: string
  weekReturnPct: number
  weekRvol: number
  ccScore: number
  ccGapUpPct: number | null
  ccGapDayCloseLocationPct: number | null
  ccFollowThroughCloseLocationPct: number | null
  ccFollowThroughVolumeRvol: number | null
  gapDate: string
  followThroughDate: string
  chartEndDate: string
  preSetupBars: number
  postSetupBars: number
  postSetupTargetBars: number
  chart: ChartData
}

interface DailyCcHistoryIndex {
  dates?: string[]
}

interface DailyCcHistoryFile {
  asOf: string
  ccLeaders?: WeeklyBreakoutLeader[]
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const SETUP_CHART_HISTORY_PATH = path.join('public', 'data', 'gap-up-ft-study', 'setup-chart-history.json')

function numberOrNull(value: number | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function toSetupChart(date: string, leader: WeeklyBreakoutLeader): GapUpFtSetupChart {
  const dates = getGapUpFtSetupBarDates(leader)
  return {
    id: `${date}:${leader.ticker}`,
    asOf: date,
    ticker: leader.ticker,
    rank: leader.ccRank ?? leader.rank,
    weeklyNewHigh: leader.weeklyNewHigh,
    weekReturnPct: leader.weekReturnPct,
    weekRvol: leader.weekRvol,
    ccScore: leader.ccScore ?? 0,
    ccGapUpPct: numberOrNull(leader.ccGapUpPct),
    ccGapDayCloseLocationPct: numberOrNull(leader.ccGapDayCloseLocationPct),
    ccFollowThroughCloseLocationPct: numberOrNull(leader.ccFollowThroughCloseLocationPct),
    ccFollowThroughVolumeRvol: numberOrNull(leader.ccFollowThroughVolumeRvol),
    gapDate: dates.gapDate,
    followThroughDate: dates.followThroughDate,
    chartEndDate: dates.followThroughDate,
    preSetupBars: leader.chart.bars.length,
    postSetupBars: 0,
    postSetupTargetBars: 60,
    chart: withGapUpFtSetupAnnotations(leader),
  }
}

function sortSetupCharts(a: GapUpFtSetupChart, b: GapUpFtSetupChart): number {
  if (a.postSetupBars !== b.postSetupBars) return b.postSetupBars - a.postSetupBars
  if (a.asOf !== b.asOf) return b.asOf.localeCompare(a.asOf)
  return a.rank - b.rank
}

async function getGeneratedSetupCharts(limit: number): Promise<GapUpFtSetupChart[]> {
  const generatedPath = path.join(process.cwd(), SETUP_CHART_HISTORY_PATH)
  try {
    const raw = await readFile(generatedPath, 'utf8')
    const charts = JSON.parse(raw) as GapUpFtSetupChart[]
    return [...charts].sort(sortSetupCharts).slice(0, limit)
  } catch {
    return []
  }
}

export async function getGapUpFtSetupCharts(limit = 36): Promise<GapUpFtSetupChart[]> {
  const generatedCharts = await getGeneratedSetupCharts(limit)
  if (generatedCharts.length > 0) return generatedCharts

  const historyDir = path.join(process.cwd(), 'public', 'data', 'cc-history')
  const indexPath = path.join(historyDir, 'index.json')

  try {
    const rawIndex = await readFile(indexPath, 'utf8')
    const index = JSON.parse(rawIndex) as DailyCcHistoryIndex
    const dates = (index.dates ?? [])
      .filter((date) => ISO_DATE_RE.test(date))
      .sort()
      .reverse()

    const setups: GapUpFtSetupChart[] = []
    const seen = new Set<string>()

    for (const date of dates) {
      const rawSnapshot = await readFile(path.join(historyDir, `${date}.json`), 'utf8')
      const snapshot = JSON.parse(rawSnapshot) as DailyCcHistoryFile
      for (const leader of snapshot.ccLeaders ?? []) {
        if (leader.ccGapUpPct === undefined) continue
        const id = `${snapshot.asOf || date}:${leader.ticker}`
        if (seen.has(id)) continue
        seen.add(id)
        setups.push(toSetupChart(snapshot.asOf || date, leader))
      }
      if (setups.length >= limit) break
    }

    return setups.sort(sortSetupCharts).slice(0, limit)
  } catch (err) {
    console.error('[gap-up-ft-setup-charts] failed to read setup history:', err)
    return []
  }
}
