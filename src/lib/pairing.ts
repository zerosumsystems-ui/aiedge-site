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
