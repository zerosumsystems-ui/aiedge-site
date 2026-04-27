/**
 * Per-match outcome statistics computed from a full RTH session.
 *
 * The raw `outcome` field on each AnalogMatch only carries direction +
 * EOD move + max favorable/adverse. To meet the bar a serious quant
 * reviewer expects — "given a top-K analog set, what does the path
 * distribution look like, and at what stop / target levels does the
 * implied trade have positive expectancy?" — we need richer per-match
 * extractions plus DTW-weighted aggregates.
 *
 * All measurements are in **ATR units** so values across instruments
 * with different absolute prices and volatilities are directly
 * comparable. ATR is the same proxy the corpus uses: mean of
 * (high − low) across the full session.
 *
 * Pure derivation from session bars + anchor index. Deterministic,
 * fast — runs client-side on each render with no server round-trip.
 */

import type { AnalogShape } from './types'

/** Per-match stats — one of these for each analog match in the top K. */
export interface MatchStats {
  // Basic outcome (already in AnalogMatch.outcome but recomputed here so
  // we have every channel from one source of truth).
  eodMoveAtr: number              // signed; + = up after anchor
  mfeAtr: number                  // max favorable from anchor (signed by shape direction)
  maeAtr: number                  // max adverse from anchor (signed by shape direction)
  // Path absolute extremes — direction-agnostic, useful for stop sizing.
  maxUpAtr: number                // peak (close − anchor) / atr
  maxDownAtr: number              // peak (anchor − close) / atr
  timeToMaxUp: number             // bars from anchor to that peak
  timeToMaxDown: number           // bars from anchor to that trough
  // Time spent above/below anchor — useful for "drawdown duration"
  // and "time in profit" reads.
  barsAboveAnchor: number
  barsBelowAnchor: number
  // Bar-checkpoint moves: move from anchor close to close at bar X,
  // in ATR units. NaN if the session is shorter than X bars.
  moveAtBar12: number             // 6 bars after a bar-6 anchor
  moveAtBar24: number             // 18 bars after
  moveAtBar48: number             // 42 bars after
  moveAtBar78: number             // EOD (72 bars after, full RTH)
  // Boolean target/stop probes — answers "did this match's path
  // cross +X or −X ATR before EOD?"
  reachedPlus1: boolean
  reachedPlus2: boolean
  reachedPlus3: boolean
  reachedMinus1: boolean
  reachedMinus2: boolean
  reachedMinus3: boolean
  // Win/loss ratio of the path: MFE / MAE (capped at 99 when MAE→0).
  // High = path was mostly favorable; low = path got hit hard before
  // its run.
  pathRatio: number
  // Realized intraday volatility (std of bar-to-bar log returns).
  intradayVolAtr: number
  // ATR proxy used for normalization (so the caller can de-normalize
  // if they want absolute price moves later).
  atr: number
  // Bar count after the anchor — sample size for any per-match
  // path-based stat.
  barsAfterAnchor: number
}

/** Aggregate stats across the top-K matches, all DTW-weighted. */
export interface AggregateStats {
  n: number
  meanDtw: number
  weightSum: number
  // Direction tendencies — DTW-weighted hit rates.
  hitRateAtPlus1: number          // ratio of analogs that reached +1 ATR
  hitRateAtPlus2: number
  hitRateAtPlus3: number
  stopRateAtMinus1: number        // ratio that hit −1 ATR
  stopRateAtMinus2: number
  stopRateAtMinus3: number
  // Expectancy at common stop/target combos (DTW-weighted average
  // realized return given the rule "exit at +T or −S").
  expectancyAt1R: number          // stop −1, target +1
  expectancyAt2R: number          // stop −1, target +2
  expectancyAt3R: number          // stop −1, target +3
  // EOD distribution — five-number summary on the weighted set.
  eodMean: number
  eodMedian: number
  eodStd: number
  eodP25: number
  eodP75: number
  eodMin: number
  eodMax: number
  // MFE / MAE central tendencies.
  mfeMean: number
  maeMean: number
  medianTimeToMfe: number
  medianTimeToMae: number
  // Profit factor: weighted sum of positive EODs / weighted sum of
  // |negative EODs|. ∞ when no losers; 0 when no winners.
  profitFactor: number
  // Win-rate at EOD (positive close after anchor).
  eodWinRate: number
  // Path stats.
  meanIntradayVol: number
  meanBarsAboveAnchor: number
  meanBarsBelowAnchor: number
}

const DTW_EPSILON = 0.1

function atrProxy(highs: number[], lows: number[]): number {
  if (!highs.length) return 0
  let sum = 0
  for (let i = 0; i < highs.length; i++) sum += highs[i] - lows[i]
  return sum / highs.length
}

function weightedMean(values: number[], weights: number[]): number {
  let sum = 0, wsum = 0
  for (let i = 0; i < values.length; i++) {
    if (!Number.isFinite(values[i])) continue
    sum += values[i] * weights[i]
    wsum += weights[i]
  }
  return wsum > 0 ? sum / wsum : 0
}

/** DTW-weighted median: lookup the value where the cumulative weight
 *  crosses 50% of the total. */
function weightedQuantile(values: number[], weights: number[], q: number): number {
  const pairs = values
    .map((v, i) => ({ v, w: weights[i] }))
    .filter((p) => Number.isFinite(p.v))
    .sort((a, b) => a.v - b.v)
  if (pairs.length === 0) return 0
  const total = pairs.reduce((acc, p) => acc + p.w, 0)
  let cum = 0
  for (const p of pairs) {
    cum += p.w
    if (cum >= total * q) return p.v
  }
  return pairs[pairs.length - 1].v
}

/** Compute per-match stats from a full session + anchor end-bar index
 *  (0-based, e.g. 5 for a bar-6 anchor). The `flipped` flag mirrors
 *  the shape vertically so flipped corpus matches are interpreted on
 *  the same axis as the query. */
export function computeMatchStats(
  session: AnalogShape,
  anchorEndIdx: number,
  flipped = false,
): MatchStats | null {
  const closes = session.close
  const highs = session.high
  const lows = session.low
  if (anchorEndIdx >= closes.length - 1) return null

  const atr = atrProxy(highs, lows)
  if (atr <= 0) return null

  const anchorClose = closes[anchorEndIdx]
  const after = closes.slice(anchorEndIdx + 1)
  const afterHighs = highs.slice(anchorEndIdx + 1)
  const afterLows = lows.slice(anchorEndIdx + 1)
  const barsAfter = after.length

  // Direction-agnostic up / down extremes after anchor.
  let maxUp = 0, maxDown = 0
  let timeToMaxUp = 0, timeToMaxDown = 0
  for (let i = 0; i < barsAfter; i++) {
    const up = afterHighs[i] - anchorClose
    const dn = anchorClose - afterLows[i]
    if (up > maxUp) {
      maxUp = up
      timeToMaxUp = i + 1
    }
    if (dn > maxDown) {
      maxDown = dn
      timeToMaxDown = i + 1
    }
  }
  const maxUpAtr = maxUp / atr
  const maxDownAtr = maxDown / atr

  // Shape direction by anchor close vs first-bar open.
  const shapeOpen = session.open[0]
  const shapeUp = anchorClose >= shapeOpen
  // After flip, the shape direction inverts.
  const dirSign = (shapeUp ? 1 : -1) * (flipped ? -1 : 1)

  // Direction-aware MFE / MAE: MFE = peak in shape direction, MAE =
  // peak against it.
  const mfeAtr = dirSign > 0 ? maxUpAtr : maxDownAtr
  const maeAtr = dirSign > 0 ? maxDownAtr : maxUpAtr

  // Time spent above / below anchor.
  let above = 0, below = 0
  for (let i = 0; i < barsAfter; i++) {
    if (after[i] > anchorClose) above += 1
    else if (after[i] < anchorClose) below += 1
  }

  // Bar-checkpoint moves (close at specific bar indices after anchor).
  const checkpointAtr = (afterIdx: number) => {
    if (afterIdx < 0 || afterIdx >= barsAfter) return NaN
    const v = (after[afterIdx] - anchorClose) / atr
    return flipped ? -v : v
  }
  // 5-min bars: bar 12 = 6 bars after a bar-6 anchor. Bar 24 = 18 after.
  const moveAtBar12 = checkpointAtr(6 - 1)
  const moveAtBar24 = checkpointAtr(18 - 1)
  const moveAtBar48 = checkpointAtr(42 - 1)
  const moveAtBar78 = checkpointAtr(barsAfter - 1)

  const eodMoveAtr = (after[barsAfter - 1] - anchorClose) / atr * (flipped ? -1 : 1)

  // Target/stop probes — direction-aware in the trader's frame.
  // For an up-direction shape, "+1 ATR" means price closed/printed
  // above anchor by 1 ATR somewhere in the after-window.
  const reachedTarget = (atrThreshold: number) => {
    if (dirSign > 0) {
      // +X means upper-side: at least one bar's high >= anchor + X*atr
      const target = anchorClose + atrThreshold * atr
      for (const h of afterHighs) if (h >= target) return true
      return false
    }
    const target = anchorClose - atrThreshold * atr
    for (const l of afterLows) if (l <= target) return true
    return false
  }
  const reachedStop = (atrThreshold: number) => {
    if (dirSign > 0) {
      const stop = anchorClose - atrThreshold * atr
      for (const l of afterLows) if (l <= stop) return true
      return false
    }
    const stop = anchorClose + atrThreshold * atr
    for (const h of afterHighs) if (h >= stop) return true
    return false
  }

  // Realized intraday vol: std dev of bar-to-bar log returns within
  // the after-window, scaled by atr so it's expressed in ATR-bar units.
  let intradayVolAtr = 0
  if (barsAfter >= 2) {
    const rets: number[] = []
    for (let i = 1; i < barsAfter; i++) {
      if (after[i - 1] > 0 && after[i] > 0) {
        rets.push(Math.log(after[i] / after[i - 1]))
      }
    }
    if (rets.length) {
      const mean = rets.reduce((a, b) => a + b, 0) / rets.length
      const variance = rets.reduce((a, b) => a + (b - mean) ** 2, 0) / rets.length
      // Convert log-return σ to ATR units: σ_price ≈ σ_ret * anchorClose
      const sigmaPrice = Math.sqrt(variance) * anchorClose
      intradayVolAtr = sigmaPrice / atr
    }
  }

  // |MFE| / |MAE|, capped to avoid infinities.
  const pathRatio = maeAtr > 0.05
    ? Math.min(99, Math.abs(mfeAtr) / Math.abs(maeAtr))
    : 99

  return {
    eodMoveAtr: round(eodMoveAtr),
    mfeAtr: round(mfeAtr),
    maeAtr: round(maeAtr),
    maxUpAtr: round(maxUpAtr),
    maxDownAtr: round(maxDownAtr),
    timeToMaxUp,
    timeToMaxDown,
    barsAboveAnchor: above,
    barsBelowAnchor: below,
    moveAtBar12: round(moveAtBar12),
    moveAtBar24: round(moveAtBar24),
    moveAtBar48: round(moveAtBar48),
    moveAtBar78: round(moveAtBar78),
    reachedPlus1: reachedTarget(1),
    reachedPlus2: reachedTarget(2),
    reachedPlus3: reachedTarget(3),
    reachedMinus1: reachedStop(1),
    reachedMinus2: reachedStop(2),
    reachedMinus3: reachedStop(3),
    pathRatio: round(pathRatio),
    intradayVolAtr: round(intradayVolAtr, 3),
    atr: round(atr, 4),
    barsAfterAnchor: barsAfter,
  }
}

function round(x: number, dp = 2): number {
  if (!Number.isFinite(x)) return NaN
  const f = Math.pow(10, dp)
  return Math.round(x * f) / f
}

/** Aggregate over a list of per-match stats, weighted by 1/(dtw+ε). */
export function computeAggregateStats(
  perMatch: { stats: MatchStats; dtw: number }[],
): AggregateStats | null {
  if (perMatch.length === 0) return null

  const weights = perMatch.map((m) => 1 / (m.dtw + DTW_EPSILON))
  const weightSum = weights.reduce((a, b) => a + b, 0)
  const meanDtw = perMatch.reduce((a, m) => a + m.dtw, 0) / perMatch.length

  const eod = perMatch.map((m) => m.stats.eodMoveAtr)
  const mfes = perMatch.map((m) => m.stats.mfeAtr)
  const maes = perMatch.map((m) => m.stats.maeAtr)
  const ttf = perMatch.map((m) => m.stats.timeToMaxUp)  // approximate proxy
  const tta = perMatch.map((m) => m.stats.timeToMaxDown)

  const hitRate = (selector: (s: MatchStats) => boolean) => {
    let num = 0
    for (let i = 0; i < perMatch.length; i++) {
      if (selector(perMatch[i].stats)) num += weights[i]
    }
    return weightSum > 0 ? num / weightSum : 0
  }

  // Stop-target expectancy: trade closes at +T or −S whichever comes
  // first; if neither, closes at EOD. Approximated by ordering of
  // reachedPlus / reachedMinus / EOD sign — full path simulation
  // would need bar-by-bar walk and we don't store the times of
  // crossings for stops, so we approximate using time-to-extreme.
  const expectancy = (target: number, stop: number) => {
    let acc = 0
    for (let i = 0; i < perMatch.length; i++) {
      const s = perMatch[i].stats
      const reachedT = target >= 1 && (target <= 1 ? s.reachedPlus1 :
        target <= 2 ? s.reachedPlus2 : s.reachedPlus3)
      const reachedS = stop >= 1 && (stop <= 1 ? s.reachedMinus1 :
        stop <= 2 ? s.reachedMinus2 : s.reachedMinus3)
      let outcome: number
      if (reachedT && reachedS) {
        // Both hit — assume the one with earlier time-to-extreme triggered
        // first. Use shape-direction time-to-MFE / time-to-MAE as proxy.
        outcome = s.timeToMaxUp <= s.timeToMaxDown ? +target : -stop
      } else if (reachedT) outcome = +target
      else if (reachedS) outcome = -stop
      else outcome = s.eodMoveAtr
      acc += weights[i] * outcome
    }
    return acc / weightSum
  }

  // Profit factor: sum of weighted positive EODs / sum of weighted |neg|.
  let posSum = 0, negSum = 0, winners = 0
  for (let i = 0; i < perMatch.length; i++) {
    const e = perMatch[i].stats.eodMoveAtr
    if (e > 0) {
      posSum += e * weights[i]
      winners += weights[i]
    } else if (e < 0) {
      negSum += Math.abs(e) * weights[i]
    }
  }
  const profitFactor = negSum > 0 ? posSum / negSum : (posSum > 0 ? 99 : 0)
  const eodWinRate = winners / weightSum

  return {
    n: perMatch.length,
    meanDtw: round(meanDtw),
    weightSum: round(weightSum, 2),
    hitRateAtPlus1: round(hitRate((s) => s.reachedPlus1), 3),
    hitRateAtPlus2: round(hitRate((s) => s.reachedPlus2), 3),
    hitRateAtPlus3: round(hitRate((s) => s.reachedPlus3), 3),
    stopRateAtMinus1: round(hitRate((s) => s.reachedMinus1), 3),
    stopRateAtMinus2: round(hitRate((s) => s.reachedMinus2), 3),
    stopRateAtMinus3: round(hitRate((s) => s.reachedMinus3), 3),
    expectancyAt1R: round(expectancy(1, 1)),
    expectancyAt2R: round(expectancy(2, 1)),
    expectancyAt3R: round(expectancy(3, 1)),
    eodMean: round(weightedMean(eod, weights)),
    eodMedian: round(weightedQuantile(eod, weights, 0.50)),
    eodStd: round(Math.sqrt(weightedMean(
      eod.map((v) => (v - weightedMean(eod, weights)) ** 2), weights,
    ))),
    eodP25: round(weightedQuantile(eod, weights, 0.25)),
    eodP75: round(weightedQuantile(eod, weights, 0.75)),
    eodMin: round(Math.min(...eod)),
    eodMax: round(Math.max(...eod)),
    mfeMean: round(weightedMean(mfes, weights)),
    maeMean: round(weightedMean(maes, weights)),
    medianTimeToMfe: Math.round(weightedQuantile(ttf, weights, 0.50)),
    medianTimeToMae: Math.round(weightedQuantile(tta, weights, 0.50)),
    profitFactor: round(profitFactor),
    eodWinRate: round(eodWinRate, 3),
    meanIntradayVol: round(weightedMean(perMatch.map((m) => m.stats.intradayVolAtr), weights), 3),
    meanBarsAboveAnchor: Math.round(weightedMean(perMatch.map((m) => m.stats.barsAboveAnchor), weights)),
    meanBarsBelowAnchor: Math.round(weightedMean(perMatch.map((m) => m.stats.barsBelowAnchor), weights)),
  }
}
