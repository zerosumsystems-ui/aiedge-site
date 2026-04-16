import { readFile, writeFile } from 'fs/promises'
import type { TradeRead, TradesPayload } from '@/lib/types'

export const dynamic = 'force-dynamic'

const TRADES_FILE = '/tmp/aiedge-trades-latest.json'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

const EMPTY_PAYLOAD: TradesPayload = { trades: [], syncedAt: '', tradeCount: 0 }

let cachedPayload: TradesPayload | null = null

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const ticker = searchParams.get('ticker')
  const date = searchParams.get('date')
  const decision = searchParams.get('decision')
  const setup = searchParams.get('setup')
  const agreement = searchParams.get('agreement')

  const payload = await getPayload()
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
  try {
    const body = await request.json()

    // Bulk sync — replace all trades
    if (body.trades) {
      const payload: TradesPayload = {
        trades: body.trades,
        syncedAt: body.syncedAt || new Date().toISOString(),
        tradeCount: body.trades.length,
      }
      cachedPayload = payload
      await writeFile(TRADES_FILE, JSON.stringify(payload), 'utf-8')
      return Response.json(
        { ok: true, tradeCount: payload.tradeCount },
        { status: 200, headers: CORS_HEADERS }
      )
    }

    // Single trade — append or update by id
    const trade: TradeRead = body
    const payload = await getPayload()
    const existing = payload.trades.findIndex((t) => t.id === trade.id)
    if (existing >= 0) {
      payload.trades[existing] = trade
    } else {
      payload.trades.push(trade)
    }
    payload.syncedAt = new Date().toISOString()
    payload.tradeCount = payload.trades.length
    cachedPayload = payload
    await writeFile(TRADES_FILE, JSON.stringify(payload), 'utf-8')
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

async function getPayload(): Promise<TradesPayload> {
  if (cachedPayload) return cachedPayload
  try {
    const raw = await readFile(TRADES_FILE, 'utf-8')
    const payload: TradesPayload = JSON.parse(raw)
    cachedPayload = payload
    return payload
  } catch {
    return { ...EMPTY_PAYLOAD }
  }
}
