import type { TradeRead, TradesPayload } from '@/lib/types'
import { requireSyncSecret } from '@/lib/auth/sync-secret'
import { requireSession } from '@/lib/auth/require-session'
import { getSnapshot, setSnapshot } from '@/lib/snapshots'

export const dynamic = 'force-dynamic'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

const EMPTY_PAYLOAD: TradesPayload = { trades: [], syncedAt: '', tradeCount: 0 }

export async function GET(request: Request) {
  const unauth = await requireSession(request)
  if (unauth) return unauth
  const { searchParams } = new URL(request.url)
  const ticker = searchParams.get('ticker')
  const date = searchParams.get('date')
  const decision = searchParams.get('decision')
  const setup = searchParams.get('setup')
  const agreement = searchParams.get('agreement')

  const payload = await getSnapshot<TradesPayload>('trades', EMPTY_PAYLOAD)
  let trades = payload.trades

  if (ticker) trades = trades.filter((t) => t.ticker.toLowerCase() === ticker.toLowerCase())
  if (date) trades = trades.filter((t) => t.date === date)
  if (decision) trades = trades.filter((t) => t.decisionBrooks === decision)
  if (setup) trades = trades.filter((t) => t.setupBrooks === setup)
  if (agreement) trades = trades.filter((t) => t.agreementVsScanner === agreement)

  return Response.json(
    { trades, tradeCount: trades.length, syncedAt: payload.syncedAt },
    { headers: CORS_HEADERS }
  )
}

export async function POST(request: Request) {
  const unauth = requireSyncSecret(request)
  if (unauth) return unauth
  try {
    const body = await request.json()

    // Bulk sync — replace all trades
    if (body.trades) {
      const payload: TradesPayload = {
        trades: body.trades,
        syncedAt: body.syncedAt || new Date().toISOString(),
        tradeCount: body.trades.length,
      }
      await setSnapshot('trades', payload)
      return Response.json(
        { ok: true, tradeCount: payload.tradeCount },
        { status: 200, headers: CORS_HEADERS }
      )
    }

    // Single trade — append or update by id
    const trade: TradeRead = body
    const payload = await getSnapshot<TradesPayload>('trades', { ...EMPTY_PAYLOAD })
    const existing = payload.trades.findIndex((t) => t.id === trade.id)
    if (existing >= 0) {
      payload.trades[existing] = trade
    } else {
      payload.trades.push(trade)
    }
    payload.syncedAt = new Date().toISOString()
    payload.tradeCount = payload.trades.length
    await setSnapshot('trades', payload)
    return Response.json(
      { ok: true, id: trade.id, tradeCount: payload.tradeCount },
      { status: 200, headers: CORS_HEADERS }
    )
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return Response.json({ error: message }, { status: 500, headers: CORS_HEADERS })
  }
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS })
}
