import type { Bar, ChartData, KeyLevels } from "@/lib/types"

const ET_TIME = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
})

const RTH_OPEN_MINUTES = 9 * 60 + 30
const RTH_CLOSE_MINUTES = 16 * 60
const EPS = 1e-9

export type OpeningReadKey =
  | "trend_open_long"
  | "long_reversal"
  | "no_trade"
  | "short_reversal"
  | "trend_open_short"

export const OPENING_READ_LABELS: Record<OpeningReadKey, string> = {
  trend_open_long: "TFO Long",
  long_reversal: "Long Rev",
  no_trade: "No Trade",
  short_reversal: "Short Rev",
  trend_open_short: "TFO Short",
}

export const OPENING_FEATURE_COLUMNS = [
  "barCount",
  "bullBars",
  "bearBars",
  "strongBullBars",
  "strongBearBars",
  "closeNearHighBars",
  "closeNearLowBars",
  "higherHighs",
  "higherLows",
  "lowerHighs",
  "lowerLows",
  "closesUp",
  "closesDown",
  "directionChanges",
  "avgBodyPct",
  "avgUpperTailPct",
  "avgLowerTailPct",
  "avgCloseLocation",
  "avgOverlapPct",
  "netMoveInAvgRange",
  "openingRangeInAvgRange",
  "firstTwoMoveInAvgRange",
  "finalBarBodyPct",
  "finalBarCloseLocation",
  "finalBarUpperTailPct",
  "finalBarLowerTailPct",
  "gapFromPriorCloseInAvgRange",
  "hoyDistanceInAvgRange",
  "loyDistanceInAvgRange",
  "openedAboveHoy",
  "openedBelowLoy",
] as const

export type OpeningFeatureName = (typeof OPENING_FEATURE_COLUMNS)[number]
export type OpeningFeatureValues = Record<OpeningFeatureName, number>

export interface OpeningBarFeature {
  direction: -1 | 0 | 1
  range: number
  bodyPct: number
  upperTailPct: number
  lowerTailPct: number
  closeLocation: number
}

export interface OpeningRead {
  label: OpeningReadKey
  score: number
  confidence: number
}

export interface OpeningFeatureSet {
  bars: OpeningBarFeature[]
  values: OpeningFeatureValues
  vector: number[]
  scores: Record<OpeningReadKey, number>
  read: OpeningRead
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function clamp01(value: number) {
  return clamp(value, 0, 1)
}

function score01(value: number) {
  return Math.round(clamp01(value) * 100)
}

function round(value: number, places = 4) {
  const factor = 10 ** places
  return Math.round(value * factor) / factor
}

function mean(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0
}

function ratio(count: number, total: number) {
  return total > 0 ? count / total : 0
}

function direction(open: number, close: number): -1 | 0 | 1 {
  if (close > open) return 1
  if (close < open) return -1
  return 0
}

function etMinutes(timestamp: number): number | null {
  const parts = ET_TIME.formatToParts(new Date(timestamp * 1000))
  const hour = parts.find((part) => part.type === "hour")?.value
  const minute = parts.find((part) => part.type === "minute")?.value
  if (!hour || !minute) return null
  return Number(hour) * 60 + Number(minute)
}

function isRegularSessionBar(timestamp: number): boolean {
  const minutes = etMinutes(timestamp)
  return minutes !== null && minutes >= RTH_OPEN_MINUTES && minutes < RTH_CLOSE_MINUTES
}

export function filterRegularSessionBars(bars: Bar[]): Bar[] {
  return bars.filter((bar) => isRegularSessionBar(bar.t))
}

export function getRegularSessionBars(chart?: ChartData): Bar[] {
  if (!chart?.bars?.length) return []
  const regularSessionBars = filterRegularSessionBars(chart.bars)
  return regularSessionBars.length > 0 ? regularSessionBars : chart.bars
}

export function buildRegularSessionChart(chart?: ChartData): ChartData | null {
  const bars = getRegularSessionBars(chart)
  if (bars.length === 0 || !chart) return null
  return { ...chart, bars }
}

export function getRegularSessionOpeningBars(chart?: ChartData, count = 4): Bar[] {
  return getRegularSessionBars(chart).slice(0, count)
}

export function buildOpeningChart(chart?: ChartData, count = 4): ChartData | null {
  const bars = getRegularSessionOpeningBars(chart, count)
  if (bars.length === 0 || !chart) return null
  return { ...chart, bars }
}

function zeroFeatureValues(): OpeningFeatureValues {
  return OPENING_FEATURE_COLUMNS.reduce((memo, column) => {
    memo[column] = 0
    return memo
  }, {} as OpeningFeatureValues)
}

function chooseRead(scores: Record<OpeningReadKey, number>): OpeningRead {
  const sorted = (Object.entries(scores) as Array<[OpeningReadKey, number]>)
    .sort((a, b) => b[1] - a[1])
  const [topLabel, topScore] = sorted[0]
  const secondScore = sorted[1]?.[1] ?? 0
  const label = topScore < 45 ? "no_trade" : topLabel
  return {
    label,
    score: scores[label],
    confidence: Math.max(0, topScore - secondScore),
  }
}

function emptyFeatureSet(): OpeningFeatureSet {
  const values = zeroFeatureValues()
  const scores: Record<OpeningReadKey, number> = {
    trend_open_long: 0,
    long_reversal: 0,
    no_trade: 100,
    short_reversal: 0,
    trend_open_short: 0,
  }
  return {
    bars: [],
    values,
    vector: OPENING_FEATURE_COLUMNS.map((column) => values[column]),
    scores,
    read: { label: "no_trade", score: 100, confidence: 100 },
  }
}

export function extractOpeningFeatures(bars: Bar[], keyLevels: KeyLevels = {}): OpeningFeatureSet {
  const openingBars = bars.slice(0, 4)
  const n = openingBars.length
  if (n === 0) return emptyFeatureSet()

  const ranges = openingBars.map((bar) => Math.max(bar.h - bar.l, EPS))
  const avgRange = Math.max(mean(ranges), EPS)
  const sessionHigh = Math.max(...openingBars.map((bar) => bar.h))
  const sessionLow = Math.min(...openingBars.map((bar) => bar.l))
  const span = Math.max(sessionHigh - sessionLow, EPS)

  const barFeatures = openingBars.map<OpeningBarFeature>((bar) => {
    const range = Math.max(bar.h - bar.l, EPS)
    const body = Math.abs(bar.c - bar.o)
    const bodyHigh = Math.max(bar.o, bar.c)
    const bodyLow = Math.min(bar.o, bar.c)

    return {
      direction: direction(bar.o, bar.c),
      range: round(range),
      bodyPct: round(body / range),
      upperTailPct: round((bar.h - bodyHigh) / range),
      lowerTailPct: round((bodyLow - bar.l) / range),
      closeLocation: round((bar.c - bar.l) / range),
    }
  })

  const bullBars = barFeatures.filter((bar) => bar.direction === 1).length
  const bearBars = barFeatures.filter((bar) => bar.direction === -1).length
  const strongBullBars = barFeatures.filter(
    (bar) => bar.direction === 1 && bar.bodyPct >= 0.55 && bar.closeLocation >= 0.65,
  ).length
  const strongBearBars = barFeatures.filter(
    (bar) => bar.direction === -1 && bar.bodyPct >= 0.55 && bar.closeLocation <= 0.35,
  ).length
  const closeNearHighBars = barFeatures.filter((bar) => bar.closeLocation >= 0.7).length
  const closeNearLowBars = barFeatures.filter((bar) => bar.closeLocation <= 0.3).length

  let higherHighs = 0
  let higherLows = 0
  let lowerHighs = 0
  let lowerLows = 0
  let closesUp = 0
  let closesDown = 0
  let directionChanges = 0
  const overlaps: number[] = []

  for (let index = 1; index < n; index += 1) {
    const bar = openingBars[index]
    const prior = openingBars[index - 1]
    if (bar.h > prior.h) higherHighs += 1
    if (bar.l > prior.l) higherLows += 1
    if (bar.h < prior.h) lowerHighs += 1
    if (bar.l < prior.l) lowerLows += 1
    if (bar.c > prior.c) closesUp += 1
    if (bar.c < prior.c) closesDown += 1

    const currentDirection = barFeatures[index].direction
    const priorDirection = barFeatures[index - 1].direction
    if (currentDirection !== 0 && priorDirection !== 0 && currentDirection !== priorDirection) {
      directionChanges += 1
    }

    const overlapRange = Math.max(0, Math.min(bar.h, prior.h) - Math.max(bar.l, prior.l))
    const denominator = Math.max(Math.min(ranges[index], ranges[index - 1]), EPS)
    overlaps.push(clamp01(overlapRange / denominator))
  }

  const first = openingBars[0]
  const last = openingBars[n - 1]
  const finalBar = barFeatures[n - 1]
  const firstTwoClose = openingBars[Math.min(1, n - 1)].c

  const values: OpeningFeatureValues = {
    ...zeroFeatureValues(),
    barCount: n,
    bullBars,
    bearBars,
    strongBullBars,
    strongBearBars,
    closeNearHighBars,
    closeNearLowBars,
    higherHighs,
    higherLows,
    lowerHighs,
    lowerLows,
    closesUp,
    closesDown,
    directionChanges,
    avgBodyPct: round(mean(barFeatures.map((bar) => bar.bodyPct))),
    avgUpperTailPct: round(mean(barFeatures.map((bar) => bar.upperTailPct))),
    avgLowerTailPct: round(mean(barFeatures.map((bar) => bar.lowerTailPct))),
    avgCloseLocation: round(mean(barFeatures.map((bar) => bar.closeLocation))),
    avgOverlapPct: round(mean(overlaps)),
    netMoveInAvgRange: round((last.c - first.o) / avgRange),
    openingRangeInAvgRange: round(span / avgRange),
    firstTwoMoveInAvgRange: round((firstTwoClose - first.o) / avgRange),
    finalBarBodyPct: finalBar.bodyPct,
    finalBarCloseLocation: finalBar.closeLocation,
    finalBarUpperTailPct: finalBar.upperTailPct,
    finalBarLowerTailPct: finalBar.lowerTailPct,
    gapFromPriorCloseInAvgRange: typeof keyLevels.priorClose === "number"
      ? round((first.o - keyLevels.priorClose) / avgRange)
      : 0,
    hoyDistanceInAvgRange: typeof keyLevels.priorDayHigh === "number"
      ? round((keyLevels.priorDayHigh - first.o) / avgRange)
      : 0,
    loyDistanceInAvgRange: typeof keyLevels.priorDayLow === "number"
      ? round((first.o - keyLevels.priorDayLow) / avgRange)
      : 0,
    openedAboveHoy: typeof keyLevels.priorDayHigh === "number" && first.o > keyLevels.priorDayHigh ? 1 : 0,
    openedBelowLoy: typeof keyLevels.priorDayLow === "number" && first.o < keyLevels.priorDayLow ? 1 : 0,
  }

  const transitions = Math.max(n - 1, 1)
  const bullRatio = ratio(bullBars, n)
  const bearRatio = ratio(bearBars, n)
  const strongBullRatio = ratio(strongBullBars, n)
  const strongBearRatio = ratio(strongBearBars, n)
  const closeNearHighRatio = ratio(closeNearHighBars, n)
  const closeNearLowRatio = ratio(closeNearLowBars, n)
  const closesUpRatio = ratio(closesUp, transitions)
  const closesDownRatio = ratio(closesDown, transitions)
  const higherHighRatio = ratio(higherHighs, transitions)
  const higherLowRatio = ratio(higherLows, transitions)
  const lowerHighRatio = ratio(lowerHighs, transitions)
  const lowerLowRatio = ratio(lowerLows, transitions)
  const lowOverlap = 1 - values.avgOverlapPct
  const positiveMove = clamp01(values.netMoveInAvgRange / 3)
  const negativeMove = clamp01(-values.netMoveInAvgRange / 3)

  const trendOpenLong = score01(
    0.16 * bullRatio +
    0.16 * strongBullRatio +
    0.15 * closesUpRatio +
    0.13 * higherHighRatio +
    0.12 * higherLowRatio +
    0.13 * closeNearHighRatio +
    0.08 * positiveMove +
    0.07 * lowOverlap,
  )

  const trendOpenShort = score01(
    0.16 * bearRatio +
    0.16 * strongBearRatio +
    0.15 * closesDownRatio +
    0.13 * lowerHighRatio +
    0.12 * lowerLowRatio +
    0.13 * closeNearLowRatio +
    0.08 * negativeMove +
    0.07 * lowOverlap,
  )

  const firstHalf = barFeatures.slice(0, Math.min(2, n))
  const earlyBear = mean(firstHalf.map((bar) => (bar.direction === -1 ? 1 : 0)))
  const earlyBull = mean(firstHalf.map((bar) => (bar.direction === 1 ? 1 : 0)))
  const earlyNearLow = mean(firstHalf.map((bar) => (bar.closeLocation <= 0.35 ? 1 : 0)))
  const earlyNearHigh = mean(firstHalf.map((bar) => (bar.closeLocation >= 0.65 ? 1 : 0)))
  const earlySell = 0.4 * earlyBear + 0.3 * earlyNearLow + 0.3 * clamp01(-values.firstTwoMoveInAvgRange / 1.5)
  const earlyBuy = 0.4 * earlyBull + 0.3 * earlyNearHigh + 0.3 * clamp01(values.firstTwoMoveInAvgRange / 1.5)
  const finalBullSignal =
    0.35 * (finalBar.direction === 1 ? 1 : 0) +
    0.25 * finalBar.closeLocation +
    0.2 * finalBar.bodyPct +
    0.2 * finalBar.lowerTailPct
  const finalBearSignal =
    0.35 * (finalBar.direction === -1 ? 1 : 0) +
    0.25 * (1 - finalBar.closeLocation) +
    0.2 * finalBar.bodyPct +
    0.2 * finalBar.upperTailPct
  const recoveryLong = clamp01((last.c - sessionLow) / span)
  const recoveryShort = clamp01((sessionHigh - last.c) / span)

  const longReversal = score01(0.45 * earlySell + 0.4 * finalBullSignal + 0.15 * recoveryLong)
  const shortReversal = score01(0.45 * earlyBuy + 0.4 * finalBearSignal + 0.15 * recoveryShort)

  const mixedDirection = 1 - Math.abs(bullBars - bearBars) / n
  const smallNetMove = clamp01(1 - Math.abs(values.netMoveInAvgRange) / 2.2)
  const tailHeavy = clamp01((values.avgUpperTailPct + values.avgLowerTailPct) / 0.75)
  const lowTrendPressure = 1 - Math.max(trendOpenLong, trendOpenShort) / 100
  const noTrade = score01(
    0.3 * values.avgOverlapPct +
    0.22 * mixedDirection +
    0.2 * smallNetMove +
    0.15 * tailHeavy +
    0.13 * lowTrendPressure,
  )

  const scores: Record<OpeningReadKey, number> = {
    trend_open_long: trendOpenLong,
    long_reversal: longReversal,
    no_trade: noTrade,
    short_reversal: shortReversal,
    trend_open_short: trendOpenShort,
  }

  return {
    bars: barFeatures,
    values,
    vector: OPENING_FEATURE_COLUMNS.map((column) => values[column]),
    scores,
    read: chooseRead(scores),
  }
}

export function formatOpeningRead(read: OpeningRead): string {
  return `${OPENING_READ_LABELS[read.label]} ${read.score}`
}
