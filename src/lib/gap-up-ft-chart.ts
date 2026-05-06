import type { Bar, ChartData, WeeklyBreakoutLeader } from '@/lib/types'

const TEAL = '#00C896'
const GOLD = '#FFD700'

function barDate(bar: Bar): string {
  return new Date(bar.t * 1000).toISOString().slice(0, 10)
}

function findFollowThroughIndex(chart: ChartData, barClosedAt?: string): number {
  if (!chart.bars.length) return -1
  if (barClosedAt) {
    const index = chart.bars.findIndex((bar) => barDate(bar) === barClosedAt)
    if (index >= 0) return index
  }
  return chart.bars.length - 1
}

export function getGapUpFtSetupBarDates(leader: WeeklyBreakoutLeader): {
  gapDate: string
  followThroughDate: string
} {
  const ftIndex = findFollowThroughIndex(leader.chart, leader.barClosedAt)
  const gapIndex = ftIndex > 0 ? ftIndex - 1 : ftIndex
  return {
    gapDate: gapIndex >= 0 ? barDate(leader.chart.bars[gapIndex]) : '',
    followThroughDate: ftIndex >= 0 ? barDate(leader.chart.bars[ftIndex]) : leader.barClosedAt,
  }
}

export function withGapUpFtSetupAnnotations(leader: WeeklyBreakoutLeader): ChartData {
  const chart = leader.chart
  const ftIndex = findFollowThroughIndex(chart, leader.barClosedAt)
  if (ftIndex < 0) return chart

  const gapIndex = ftIndex > 0 ? ftIndex - 1 : ftIndex
  const gapBar = chart.bars[gapIndex]
  const followThroughBar = chart.bars[ftIndex]
  const existing = chart.annotations ?? {}

  return {
    ...chart,
    annotations: {
      ...existing,
      phaseLabel: existing.phaseLabel ?? 'GAP + FT',
      markers: [
        ...(existing.markers ?? []),
        {
          time: gapBar.t,
          position: 'belowBar',
          color: TEAL,
          shape: 'arrowUp',
          text: 'GAP',
        },
        {
          time: followThroughBar.t,
          position: 'aboveBar',
          color: GOLD,
          shape: 'circle',
          text: 'FT',
        },
      ],
    },
  }
}
