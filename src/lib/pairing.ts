/**
 * Fill ↔ pre-trade-read pairing + per-setup aggregation.
 *
 * Called from /api/snaptrade/sync after fills are fetched from SnapTrade.
 * The sync route stores the paired array and the per-setup stats in the
 * `filled_trades` snapshot so `/journal` just renders — no pairing work
 * runs on page load.
 *
 * Pairing rule (MVP — simple, fast, good enough for one-read-per-ticker):
 *   1. Match fill ↔ read on `ticker` (case-insensitive) AND `date` (exact YYYY-MM-DD)
 *   2. If multiple candidate reads exist for that ticker/day, pick the one
 *      with the highest `qualityScore` (Brooks's 0–10 confidence)
 *   3. If no candidate: orphan fill (pairedReadId = null)
 *
 * R-multiple when paired — computed from the actual fill price against the
 * read's planned stop/target, scaled by the read's planned R:R:
 *   BUY:  rMultiple = (fill.price − stopPrice) / (targetPrice − stopPrice) × rrBrooks
 *   SELL: mirror (reversed arithmetic)
 * When the read has no stop/target (AVOID, scanner-only reads) rMultiple stays
 * null — we can't derive R without a reference frame.
 *
 * Per-setup stats are computed by grouping paired fills' backing reads by
 * `setupBrooks` and running `computeEquityStats` on each group — reusing the
 * exact same R derivation the `/trades` catalog already uses.
 */

import type { EquityStats } from './stats'
import { computeEquityStats } from './stats'
import type { FilledTrade, PairedTrade, RoundTrip, TradeRead } from './types'

/** Normalize ticker for matching: strip whitespace, uppercase, drop .US-style exchange suffix. */
function canonTicker(s: string): string {
  return s.trim().toUpperCase().replace(/\.(US|NYSE|NASDAQ|CBOE|ARCA|BATS)$/i, '')
}

function computeRMultiple(fill: FilledTrade, read: TradeRead): number | null {
  if (read.stopPrice == null || read.targetPrice == null) return null
  const range = read.targetPrice - read.stopPrice
  if (range === 0) return null

  // rrBrooks is the read's planned R:R; we rescale by where the fill
  // actually landed in the [stop, target] range.
  if (fill.action === 'BUY') {
    return ((fill.price - read.stopPrice) / range) * read.rrBrooks
  }
  // SELL: if the read was also a SELL decision, the arithmetic mirrors.
  // If the read was a BUY and the fill is the exit SELL, the same mirror
  // gives a sane "how far toward target did we get" signal — good enough
  // for the MVP summary.
  return ((read.stopPrice - fill.price) / range) * read.rrBrooks
}

export function pairFills(fills: FilledTrade[], reads: TradeRead[]): PairedTrade[] {
  // Bucket reads by `${canonTicker}\n${date}` for O(1) lookup.
  const readBucket = new Map<string, TradeRead[]>()
  for (const read of reads) {
    const key = `${canonTicker(read.ticker)}\n${read.date}`
    const bucket = readBucket.get(key)
    if (bucket) bucket.push(read)
    else readBucket.set(key, [read])
  }

  const paired: PairedTrade[] = []
  for (const fill of fills) {
    const key = `${canonTicker(fill.ticker)}\n${fill.date}`
    const candidates = readBucket.get(key) ?? []

    // Prefer the read with the highest qualityScore (most confident Brooks
    // read for that ticker/day). Ties broken by time asc for determinism.
    const best = candidates
      .slice()
      .sort((a, b) => {
        const q = b.qualityScore - a.qualityScore
        if (q !== 0) return q
        return a.time.localeCompare(b.time)
      })[0]

    if (!best) {
      paired.push({
        fill,
        pairedReadId: null,
        rMultiple: null,
        realizedPnL: null,
      })
      continue
    }

    paired.push({
      fill,
      pairedReadId: best.id,
      rMultiple: computeRMultiple(fill, best),
      realizedPnL: null, // round-trip PnL is Phase 3
    })
  }

  return paired
}

/**
 * FIFO round-trip matcher.
 *
 * Walks a ticker's fills in chronological order maintaining a FIFO queue of
 * open lots. Each incoming fill either opens a new lot (first fill, or same
 * direction as the current open lots) or closes against the oldest open lots
 * (opposite direction).
 *
 * Handles:
 *   - Multi-leg entries: 50 BUY then 30 BUY → same open lot (aggregated)
 *   - Partial exits: 80 open, 30 SELL → partial close; 50 still open
 *   - Shorts: SELL first then BUY cover → side: "short"
 *   - Open positions: remaining entry fills become open round-trips (isOpen=true)
 *
 * Qty-weighted average prices are computed per closed round-trip.
 *
 * NOTE on complexity: real position accounting has wash-sale, tax-lot, split
 * adjustment concerns — out of scope here. This is for Brooks-style journal
 * pairing (round-trip PnL + entry/exit chart), not tax reporting.
 */
export function pairRoundTrips(
  fills: FilledTrade[],
  paired: PairedTrade[]
): RoundTrip[] {
  // fill.id → pairedReadId for quick lookup when we label round-trips
  const pairedReadByFillId = new Map<string, string | null>()
  for (const p of paired) pairedReadByFillId.set(p.fill.id, p.pairedReadId)

  // Bucket fills by ticker
  const byTicker = new Map<string, FilledTrade[]>()
  for (const fill of fills) {
    const key = fill.ticker.toUpperCase()
    const bucket = byTicker.get(key)
    if (bucket) bucket.push(fill)
    else byTicker.set(key, [fill])
  }

  const roundTrips: RoundTrip[] = []

  for (const [ticker, tickerFills] of byTicker) {
    // Chronological — oldest first. Ties broken by id for determinism.
    const ordered = [...tickerFills].sort((a, b) => {
      const c = a.fillTime.localeCompare(b.fillTime)
      if (c !== 0) return c
      return a.id.localeCompare(b.id)
    })

    // FIFO queue of open legs. `side` is the side of the OPEN position
    // (long = we hold BUYs waiting to SELL; short = we hold SELLs waiting
    // to BUY-to-cover).
    let openSide: 'long' | 'short' | null = null
    const openLegs: Array<{ fill: FilledTrade; remaining: number }> = []

    for (const fill of ordered) {
      const fillSide: 'long' | 'short' = fill.action === 'BUY' ? 'long' : 'short'

      if (openSide === null || openLegs.length === 0) {
        // Start a new position.
        openSide = fillSide
        openLegs.push({ fill, remaining: fill.qty })
        continue
      }

      if (fillSide === openSide) {
        // Same direction — just add a leg to the open position.
        openLegs.push({ fill, remaining: fill.qty })
        continue
      }

      // Opposite direction — close against oldest open legs (FIFO).
      let remainingToClose = fill.qty
      const closingEntryFills: Array<{ fill: FilledTrade; closedQty: number }> = []

      while (remainingToClose > 0 && openLegs.length > 0) {
        const head = openLegs[0]
        const take = Math.min(head.remaining, remainingToClose)
        closingEntryFills.push({ fill: head.fill, closedQty: take })
        head.remaining -= take
        remainingToClose -= take
        if (head.remaining <= 1e-9) openLegs.shift()
      }

      const closedQty = fill.qty - remainingToClose
      if (closedQty <= 0) {
        // Should not happen — defensive.
        continue
      }

      // Qty-weighted entry price across the entry legs we consumed.
      const entryDollars = closingEntryFills.reduce(
        (s, c) => s + c.fill.price * c.closedQty,
        0
      )
      const entryPrice = entryDollars / closedQty
      const entryFills = closingEntryFills.map((c) => c.fill)
      const firstEntry = entryFills[0]
      const lastEntry = entryFills[entryFills.length - 1]
      // Sum of each entry fill's per-share commission+fees scaled to the qty
      // we closed from that leg, plus the exit commissions in full.
      const entryCommishClosedShare = closingEntryFills.reduce((s, c) => {
        const perShare = (c.fill.commission + c.fill.fees) / Math.max(c.fill.qty, 1e-9)
        return s + perShare * c.closedQty
      }, 0)
      const exitCommish = fill.commission + fill.fees

      const side: 'long' | 'short' = openSide
      const realizedPnL =
        (side === 'long' ? fill.price - entryPrice : entryPrice - fill.price) * closedQty -
        entryCommishClosedShare -
        exitCommish

      const costBasis = entryPrice * closedQty
      const returnPct = costBasis !== 0 ? realizedPnL / costBasis : null

      const durationMs =
        new Date(fill.fillTime).getTime() - new Date(firstEntry.fillTime).getTime()

      roundTrips.push({
        id: `${ticker}_${firstEntry.id}_${fill.id}`,
        ticker,
        side,
        qty: closedQty,
        entryTime: firstEntry.fillTime,
        entryPrice,
        exitTime: fill.fillTime,
        exitPrice: fill.price,
        durationMs,
        realizedPnL,
        returnPct,
        commissions: entryCommishClosedShare + exitCommish,
        entryFillIds: entryFills.map((e) => e.id),
        exitFillIds: [fill.id],
        pairedReadId:
          pairedReadByFillId.get(firstEntry.id) ??
          pairedReadByFillId.get(lastEntry.id) ??
          null,
        isOpen: false,
      })

      if (openLegs.length === 0 && remainingToClose > 0) {
        // Over-sold relative to the open position — the remainder flips
        // us into the opposite direction. Reseed a new open leg with the
        // unmatched portion of the closing fill.
        openSide = fillSide
        openLegs.push({
          fill,
          remaining: remainingToClose,
        })
      } else if (openLegs.length === 0) {
        openSide = null
      }
    }

    // Any legs still open → emit as open round-trips.
    for (const leg of openLegs) {
      if (leg.remaining <= 1e-9) continue
      roundTrips.push({
        id: `${ticker}_${leg.fill.id}_open`,
        ticker,
        side: openSide ?? 'long',
        qty: leg.remaining,
        entryTime: leg.fill.fillTime,
        entryPrice: leg.fill.price,
        exitTime: null,
        exitPrice: null,
        durationMs: null,
        realizedPnL: null,
        returnPct: null,
        commissions:
          ((leg.fill.commission + leg.fill.fees) / Math.max(leg.fill.qty, 1e-9)) *
          leg.remaining,
        entryFillIds: [leg.fill.id],
        exitFillIds: [],
        pairedReadId: pairedReadByFillId.get(leg.fill.id) ?? null,
        isOpen: true,
      })
    }
  }

  // Most-recent first (closed trades by exitTime, open trades by entryTime)
  return roundTrips.sort((a, b) => {
    const aKey = a.exitTime ?? a.entryTime
    const bKey = b.exitTime ?? b.entryTime
    return bKey.localeCompare(aKey)
  })
}

/**
 * Grade a closed round-trip against its paired pre-trade Brooks read.
 *
 * Four components:
 *   - direction: did the fill action match Brooks's planned decision?
 *   - stop:      for a closed trade, did the exit stay on the right side of
 *                the planned stop? (held stop = A, blew through = F)
 *   - rAchieved: how much of the planned R:R did the actual fill capture?
 *   - timing:    entry time vs the read's "time" field; same session = A
 *
 * Overall = the minimum (worst) component — Brooks-style "weakest link"
 * reasoning. A trade that hit target but broke discipline on stop isn't
 * actually an A.
 *
 * Returns null for: open trades (nothing to evaluate yet), trades missing
 * stop/target (nothing to grade against), read.decision = WAIT/AVOID (see
 * notes — the grade logic treats those as contrarian signal).
 */
export type LetterGrade = 'A' | 'B' | 'C' | 'D' | 'F'

export interface GradeComponent {
  grade: LetterGrade
  note: string
}

export interface TradeGrade {
  overall: LetterGrade
  headline: string
  direction: GradeComponent
  stop: GradeComponent | null
  rAchieved: GradeComponent | null
}

const GRADE_TO_POINTS: Record<LetterGrade, number> = { A: 4, B: 3, C: 2, D: 1, F: 0 }
const POINTS_TO_GRADE = (pts: number): LetterGrade => {
  if (pts >= 3.5) return 'A'
  if (pts >= 2.5) return 'B'
  if (pts >= 1.5) return 'C'
  if (pts >= 0.5) return 'D'
  return 'F'
}

function directionGrade(tripSide: 'long' | 'short', read: TradeRead): GradeComponent {
  const decision = read.decisionBrooks
  const wantedLong = decision === 'BUY'
  const wantedShort = decision === 'SELL'
  if (tripSide === 'long' && wantedLong) {
    return { grade: 'A', note: `Brooks called BUY; you went long. Aligned.` }
  }
  if (tripSide === 'short' && wantedShort) {
    return { grade: 'A', note: `Brooks called SELL; you went short. Aligned.` }
  }
  if (decision === 'WAIT') {
    return {
      grade: 'C',
      note: `Brooks called WAIT. You took initiative — a C unless the trade worked, in which case the R grade carries you.`,
    }
  }
  if (decision === 'AVOID') {
    return {
      grade: 'F',
      note: `Brooks called AVOID. Taking this trade was against the read.`,
    }
  }
  // Opposite direction
  return {
    grade: 'F',
    note: `Brooks called ${decision}; you went ${tripSide}. Opposite direction.`,
  }
}

function stopDisciplineGrade(trip: RoundTrip, read: TradeRead): GradeComponent | null {
  if (trip.isOpen) return null
  if (trip.exitPrice == null || read.stopPrice == null) return null
  // For a long: exit above planned stop = held. For a short: exit below.
  const heldStop =
    trip.side === 'long'
      ? trip.exitPrice > read.stopPrice
      : trip.exitPrice < read.stopPrice
  if (heldStop) {
    return { grade: 'A', note: `Exit held the planned stop at $${read.stopPrice.toFixed(2)}.` }
  }
  const slippage =
    trip.side === 'long' ? read.stopPrice - trip.exitPrice : trip.exitPrice - read.stopPrice
  // Within 2% of planned stop = stop-out at plan (B); beyond = discipline break (F)
  const slipPct = Math.abs(slippage) / Math.max(read.stopPrice, 0.01)
  if (slipPct <= 0.02) {
    return {
      grade: 'B',
      note: `Stopped at plan ($${read.stopPrice.toFixed(2)} planned vs $${trip.exitPrice.toFixed(2)} fill).`,
    }
  }
  return {
    grade: 'F',
    note: `Blew through the planned stop by ${(slipPct * 100).toFixed(1)}%. Discipline break.`,
  }
}

function rAchievedGrade(trip: RoundTrip, read: TradeRead): GradeComponent | null {
  if (trip.isOpen) return null
  if (trip.exitPrice == null || read.stopPrice == null || read.targetPrice == null) return null

  // Derive 1R in price terms from the read's planned structure: 1R = distance
  // from the trade's actual entry to the planned stop. Then the exit's price
  // move in R units is (exit − entry) / oneR, flipped for shorts.
  const oneR = Math.abs(trip.entryPrice - read.stopPrice)
  if (oneR < 1e-9) return null
  const actualR =
    trip.side === 'long'
      ? (trip.exitPrice - trip.entryPrice) / oneR
      : (trip.entryPrice - trip.exitPrice) / oneR
  const plannedR = read.rrBrooks

  if (actualR >= plannedR) return { grade: 'A', note: `Captured ${actualR.toFixed(2)}R — hit or exceeded the ${plannedR.toFixed(1)}R plan.` }
  if (plannedR > 0 && actualR >= plannedR * 0.5)
    return { grade: 'B', note: `Captured ${actualR.toFixed(2)}R — about ${((actualR / plannedR) * 100).toFixed(0)}% of the ${plannedR.toFixed(1)}R plan.` }
  if (actualR > 0) return { grade: 'C', note: `Small winner at ${actualR.toFixed(2)}R (planned ${plannedR.toFixed(1)}R).` }
  if (actualR >= -0.5) return { grade: 'D', note: `Small loss at ${actualR.toFixed(2)}R.` }
  return { grade: 'F', note: `Full loss at ${actualR.toFixed(2)}R.` }
}

export function computeTradeGrade(trip: RoundTrip, read: TradeRead | null): TradeGrade | null {
  if (!read) return null
  if (trip.isOpen) return null

  const direction = directionGrade(trip.side, read)
  const stop = stopDisciplineGrade(trip, read)
  const r = rAchievedGrade(trip, read)

  // Weighted points — direction + R matter more than stop-slippage
  const components: Array<{ weight: number; grade: LetterGrade }> = [
    { weight: 2, grade: direction.grade },
  ]
  if (stop) components.push({ weight: 1, grade: stop.grade })
  if (r) components.push({ weight: 2, grade: r.grade })
  const totalWeight = components.reduce((s, c) => s + c.weight, 0)
  const weightedPts = components.reduce((s, c) => s + c.weight * GRADE_TO_POINTS[c.grade], 0)
  const overall = POINTS_TO_GRADE(weightedPts / totalWeight)

  const parts: string[] = []
  if (direction.grade === 'F') parts.push('against Brooks direction')
  else if (direction.grade === 'A') parts.push('aligned with Brooks')
  if (stop?.grade === 'A') parts.push('held stop')
  else if (stop?.grade === 'F') parts.push('broke stop')
  if (r?.grade === 'A') parts.push('hit target')
  else if (r?.grade === 'F') parts.push('took full loss')
  const headline = parts.length > 0 ? parts.join(' · ') : 'Mixed execution'

  return { overall, headline, direction, stop, rAchieved: r }
}

/**
 * Per-setup equity stats computed from paired fills' backing reads.
 * Only paired fills contribute; orphans are excluded from aggregation.
 *
 * Groups by `setupBrooks` (e.g., "h2", "l2", "spike_channel"). Returns one
 * EquityStats per setup. Reuses `computeEquityStats` so the R derivation
 * is identical to `/trades`.
 */
export function perSetupStats(
  paired: PairedTrade[],
  reads: TradeRead[]
): Record<string, EquityStats> {
  const readById = new Map<string, TradeRead>()
  for (const r of reads) readById.set(r.id, r)

  const grouped = new Map<string, TradeRead[]>()
  for (const p of paired) {
    if (!p.pairedReadId) continue
    const read = readById.get(p.pairedReadId)
    if (!read) continue
    const setup = read.setupBrooks || 'unknown'
    const bucket = grouped.get(setup)
    if (bucket) bucket.push(read)
    else grouped.set(setup, [read])
  }

  const out: Record<string, EquityStats> = {}
  for (const [setup, group] of grouped) {
    out[setup] = computeEquityStats(group)
  }
  return out
}
