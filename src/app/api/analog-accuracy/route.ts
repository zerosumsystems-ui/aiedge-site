/**
 * /api/analog-accuracy — measures whether analog-derived predictions
 * agreed with what actually happened, per scanner detection that had
 * analogs attached.
 *
 * Walks every captured day in scan-history. For each result with
 * `analogs.anchored.matches` populated, derives:
 *
 *   predicted_dir   = sign of the median eod_move_atr across top-K analogs
 *   actual_dir      = sign of (chart.bars EOD close − bar-6 close)
 *   correct         = predicted_dir === actual_dir
 *
 * Aggregates: total queries, correct count, hit rate, simple binomial
 * p-value vs the 50/50 null. Also returns the most recent N observations
 * so the UI can show a per-query log.
 *
 * Pure read; no caching, no writes — data source is the same Supabase
 * snapshot the /history pages already use.
 */
import type { DailySnapshot, HistoryPayload, ScanResult, AnalogMatch } from '@/lib/types'
import { requireSession } from '@/lib/auth/require-session'
import { getSnapshot } from '@/lib/snapshots'

export const dynamic = 'force-dynamic'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

const RECENT_LIMIT = 50
const N_OPEN_BARS = 6
const FLAT_THRESHOLD_ATR = 0.05  // mirrors scanner_analog_matcher direction thresholds

type Direction = 'up' | 'down' | 'flat'

interface Observation {
  date: string
  ticker: string
  signal: string
  // Predicted (from analog aggregate)
  predictedDir: Direction
  predictedEodAtr: number       // median across top-K matches
  predictedHitCount: number     // analogs that matched the same direction
  analogsConsidered: number
  meanDtw: number
  // Actual (from chart.bars on the same captured day)
  actualDir: Direction
  actualEodAtr: number
  // Verdict
  correct: boolean | null       // null when actual is flat or insufficient bars
}

interface AccuracyPayload {
  total: number
  graded: number              // observations where actual wasn't flat (correct ∈ {true,false})
  correct: number
  hitRate: number | null      // correct / graded, null when graded = 0
  pValueVsRandom: number | null
  byDirection: {
    up:   { graded: number; correct: number; hitRate: number | null }
    down: { graded: number; correct: number; hitRate: number | null }
  }
  recent: Observation[]
  oldestDate: string | null
  latestDate: string | null
}

const EMPTY: AccuracyPayload = {
  total: 0, graded: 0, correct: 0, hitRate: null, pValueVsRandom: null,
  byDirection: {
    up:   { graded: 0, correct: 0, hitRate: null },
    down: { graded: 0, correct: 0, hitRate: null },
  },
  recent: [], oldestDate: null, latestDate: null,
}

function median(xs: number[]): number {
  if (!xs.length) return 0
  const sorted = [...xs].sort((a, b) => a - b)
  const m = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[m] : (sorted[m - 1] + sorted[m]) / 2
}

function dirOfAtr(eod: number): Direction {
  if (eod > FLAT_THRESHOLD_ATR) return 'up'
  if (eod < -FLAT_THRESHOLD_ATR) return 'down'
  return 'flat'
}

/** Compute the same ATR proxy the corpus uses: mean of (high - low) over
 *  the first 6 bars. Keeps actual outcomes comparable to predicted ones. */
function atrFromBars(bars: { h: number; l: number }[]): number {
  if (!bars.length) return 0
  let sum = 0
  for (const b of bars) sum += (b.h - b.l)
  return sum / bars.length
}

function computeActualOutcome(result: ScanResult): { dir: Direction; eodAtr: number } | null {
  const bars = result.chart?.bars
  if (!bars || bars.length < N_OPEN_BARS + 2) return null
  const first6 = bars.slice(0, N_OPEN_BARS)
  const atr = atrFromBars(first6)
  if (atr <= 0) return null
  const anchorClose = bars[N_OPEN_BARS - 1].c
  const eodClose = bars[bars.length - 1].c
  const eodAtr = (eodClose - anchorClose) / atr
  return { dir: dirOfAtr(eodAtr), eodAtr }
}

/** "Predicted" direction = sign of median(eod_move_atr) across the top-K
 *  anchored analogs. Direction-aware framing so a SELL signal prediction
 *  flips: if the analog crowd predicts the price went DOWN after the
 *  anchor, that's a successful SELL. */
function predictForResult(result: ScanResult): {
  dir: Direction
  eodAtr: number
  hitCount: number
  considered: number
  meanDtw: number
} | null {
  const matches: AnalogMatch[] | undefined = result.analogs?.anchored?.matches
  if (!matches || matches.length === 0) return null
  const eods = matches.map((m) => m.outcome.eod_move_atr)
  const med = median(eods)
  // Direction the analog crowd points to from the trader's perspective.
  // For a BUY signal we want the analog crowd to say "price rose", for
  // SELL we want "price fell". Recording raw direction here; the caller
  // judges correct/incorrect against the actual.
  const dir = dirOfAtr(med)
  const considered = matches.length
  const hitCount = matches.filter((m) => dirOfAtr(m.outcome.eod_move_atr) === dir).length
  const meanDtw = matches.reduce((acc, m) => acc + m.dtw, 0) / matches.length
  return { dir, eodAtr: med, hitCount, considered, meanDtw }
}

/** Two-sided binomial test against p=0.5 using the normal approximation.
 *  Adequate for n ≥ 20; for smaller samples returns null. */
function binomialPvalue(correct: number, n: number): number | null {
  if (n < 20) return null
  const p = correct / n
  const sd = Math.sqrt(0.25 / n)
  const z = Math.abs(p - 0.5) / sd
  // Two-sided p ≈ 2 * (1 - Φ(z)). Approximate Φ via Abramowitz & Stegun.
  const phi = (x: number) => {
    const t = 1 / (1 + 0.2316419 * Math.abs(x))
    const d = 0.3989422804014327 * Math.exp(-x * x / 2)
    const probLeft = d * t * (
      0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429)))
    )
    return x >= 0 ? 1 - probLeft : probLeft
  }
  return Math.max(0, Math.min(1, 2 * (1 - phi(z))))
}

export async function GET(request: Request) {
  const unauth = await requireSession(request)
  if (unauth) return unauth

  const history = await getSnapshot<HistoryPayload>('scan-history', { snapshots: [], syncedAt: '' })
  if (!history.snapshots.length) {
    return Response.json(EMPTY, { headers: CORS_HEADERS })
  }

  const observations: Observation[] = []
  // Sort newest first so the recent-N slice is straightforward.
  const sorted = [...history.snapshots].sort((a, b) => b.date.localeCompare(a.date))

  for (const snap of sorted as DailySnapshot[]) {
    for (const r of snap.payload.results || []) {
      const pred = predictForResult(r)
      if (!pred) continue
      const actual = computeActualOutcome(r)
      // We accept the observation for "total" but don't grade it as
      // correct/incorrect when actual is missing or flat — the answer
      // is "no data" or "no movement," not a model error.
      const correct = actual && actual.dir !== 'flat' && pred.dir !== 'flat'
        ? pred.dir === actual.dir
        : null
      observations.push({
        date: snap.date,
        ticker: r.ticker,
        signal: r.signal,
        predictedDir: pred.dir,
        predictedEodAtr: Number(pred.eodAtr.toFixed(2)),
        predictedHitCount: pred.hitCount,
        analogsConsidered: pred.considered,
        meanDtw: Number(pred.meanDtw.toFixed(2)),
        actualDir: actual?.dir ?? 'flat',
        actualEodAtr: actual ? Number(actual.eodAtr.toFixed(2)) : 0,
        correct,
      })
    }
  }

  let graded = 0
  let correct = 0
  let upGraded = 0, upCorrect = 0
  let downGraded = 0, downCorrect = 0
  for (const o of observations) {
    if (o.correct === null) continue
    graded += 1
    if (o.correct) correct += 1
    if (o.predictedDir === 'up') {
      upGraded += 1
      if (o.correct) upCorrect += 1
    } else if (o.predictedDir === 'down') {
      downGraded += 1
      if (o.correct) downCorrect += 1
    }
  }

  const hitRate = graded > 0 ? correct / graded : null
  const pValue = binomialPvalue(correct, graded)

  const oldest = observations.length ? observations[observations.length - 1].date : null
  const latest = observations.length ? observations[0].date : null

  const payload: AccuracyPayload = {
    total: observations.length,
    graded,
    correct,
    hitRate,
    pValueVsRandom: pValue,
    byDirection: {
      up:   { graded: upGraded,   correct: upCorrect,
              hitRate: upGraded > 0 ? upCorrect / upGraded : null },
      down: { graded: downGraded, correct: downCorrect,
              hitRate: downGraded > 0 ? downCorrect / downGraded : null },
    },
    recent: observations.slice(0, RECENT_LIMIT),
    oldestDate: oldest,
    latestDate: latest,
  }
  return Response.json(payload, { headers: CORS_HEADERS })
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS })
}
