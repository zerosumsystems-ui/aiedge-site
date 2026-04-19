import type {
  FilledTrade,
  FilledTradesPayload,
  TradesPayload,
} from '@/lib/types'
import { requireSession } from '@/lib/auth/require-session'
import { requireSyncSecret } from '@/lib/auth/sync-secret'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createSnaptradeClient } from '@/lib/snaptrade/client'
import { pairFills, pairRoundTrips, perSetupStats } from '@/lib/pairing'
import { getSnapshot, setSnapshot } from '@/lib/snapshots'

export const dynamic = 'force-dynamic'

/**
 * Port of git show b5f196f:api/snaptrade-sync.js — reworked for Next.js
 * app-router, Supabase SSR cookie auth, and api_snapshots JSONB storage
 * (replaces the old `trades` SQL table that was dropped in the migration).
 *
 * POST /api/snaptrade/sync
 *   Dual auth:
 *     - Authorization: Bearer $SYNC_SECRET  → cron path, syncs ALL users
 *     - Supabase session cookie              → user path, syncs only that user
 *
 *   Body (optional): { startDate?: "YYYY-MM-DD", endDate?: "YYYY-MM-DD" }
 *     Defaults: 2020-01-01 → today.
 *
 *   GET /api/snaptrade/sync → returns the current filled_trades snapshot
 *     (read is session-gated; POST handles writes + fresh pull).
 */

const EMPTY_PAYLOAD: FilledTradesPayload = {
  fills: [],
  paired: [],
  stats: {},
  roundTrips: [],
  syncedAt: '',
  lastSyncError: null,
  accountCount: 0,
}

type SnapSymbol = {
  symbol?: string
  raw_symbol?: string
  rawSymbol?: string
  description?: string
} | null | undefined

type SnapActivityAccount = {
  id?: string
  name?: string | null
  number?: string | null
} | null | undefined

type SnapActivity = {
  id?: string
  type?: string
  symbol?: SnapSymbol
  units?: number
  quantity?: number
  price?: number
  commission?: number
  fee?: number
  fees?: number
  tradeDate?: string
  trade_date?: string
  settlementDate?: string
  settlement_date?: string
  description?: string
  institution?: string
  account?: SnapActivityAccount
}

type SnapAccount = {
  id?: string
  name?: string | null
  number?: string | null
  institutionName?: string | null
  brokerage?: { name?: string | null } | null
}

/**
 * Money-market / cash-sweep tickers that brokers auto-buy/sell to park idle
 * cash. These are not discretionary trades and would only add noise to the
 * Fills tab + skew per-setup stats.
 *
 *   Fidelity: SPAXX, FDRXX, FCASH, FZFXX, FGMXX, FGCXX, FDLXX
 *   Schwab:   SWVXX, SNAXX, SNOXX, SNVXX
 *   Vanguard: VMFXX, VMRXX
 *   Others:   TFDXX (T. Rowe), JPCXX (JP Morgan)
 */
const CASH_SWEEP_TICKERS = new Set([
  'SPAXX', 'FDRXX', 'FCASH', 'FZFXX', 'FGMXX', 'FGCXX', 'FDLXX',
  'SWVXX', 'SNAXX', 'SNOXX', 'SNVXX',
  'VMFXX', 'VMRXX',
  'TFDXX', 'JPCXX',
])

/**
 * Minimum share quantity to treat a fill as a real trade. Below this we
 * assume the fill is DRIP / fractional dividend reinvestment / rounding
 * artifact, not a discretionary entry. One share is the standard Brooks
 * unit anyway — anything sub-share is noise for journaling.
 */
const MIN_QTY = 1

/**
 * Map a SnapTrade UniversalActivity into our FilledTrade shape. Handles both
 * the newer transactionsAndReporting.getActivities (snake_case) shape and the
 * older accountInformation.getAccountActivities (camelCase) shape.
 */
function activityToFilled(activity: SnapActivity): FilledTrade | null {
  const type = (activity.type ?? '').toUpperCase()
  if (type !== 'BUY' && type !== 'SELL') return null

  const rawSymbol =
    activity.symbol?.symbol ??
    activity.symbol?.raw_symbol ??
    activity.symbol?.rawSymbol ??
    activity.symbol?.description ??
    ''
  if (!rawSymbol) return null
  const ticker = rawSymbol.split(' ')[0].toUpperCase()
  if (CASH_SWEEP_TICKERS.has(ticker)) return null

  const qty = Math.abs(activity.units ?? activity.quantity ?? 0)
  const price = activity.price ?? 0
  if (qty === 0 || price === 0) return null
  if (qty < MIN_QTY) return null

  const dateStr =
    activity.tradeDate ??
    activity.trade_date ??
    activity.settlementDate ??
    activity.settlement_date ??
    ''
  if (!dateStr) return null
  const fillTime = new Date(dateStr).toISOString()
  const date = fillTime.split('T')[0]

  const brokerTradeId = activity.id ?? null
  const id = brokerTradeId ?? `${fillTime}_${ticker}_${type}_${qty}`

  // accountName: prefer the activity's own account payload (cross-account
  // endpoint); fall back to institution string for the older shape.
  const acct = activity.account
  const accountName = acct?.name
    ?? (acct?.number ? `${activity.institution ?? 'Broker'} ${acct.number}` : null)
    ?? activity.institution
    ?? null

  return {
    id,
    ticker,
    action: type,
    qty,
    price,
    commission: Math.abs(activity.commission ?? 0),
    fees: Math.abs(activity.fee ?? activity.fees ?? 0),
    amount: qty * price,
    fillTime,
    date,
    accountId: acct?.id ?? '',
    accountName,
    brokerTradeId,
    description: activity.description ?? activity.symbol?.description ?? null,
  }
}

type Connection = {
  user_id: string
  snaptrade_user_id: string
  snaptrade_user_secret: string
}

async function syncConnection(
  conn: Connection,
  startDate: string,
  endDate: string
): Promise<{ fills: FilledTrade[]; accountCount: number }> {
  const snaptrade = createSnaptradeClient()

  // List accounts for the display count (the cross-account activities
  // endpoint doesn't tell us total account count directly).
  const { data: accountsResp } = await snaptrade.accountInformation.listUserAccounts({
    userId: conn.snaptrade_user_id,
    userSecret: conn.snaptrade_user_secret,
  })
  const accounts: SnapAccount[] = Array.isArray(accountsResp) ? accountsResp : []

  // Pull ALL activities across ALL accounts in one shot. This endpoint is
  // the canonical one — the older per-account `getAccountActivities` returns
  // 0 for some account types (notably IRAs at Fidelity), even when the
  // transactions endpoint returns hundreds of records for the same account.
  const { data: activitiesResp } = await snaptrade.transactionsAndReporting.getActivities({
    userId: conn.snaptrade_user_id,
    userSecret: conn.snaptrade_user_secret,
    startDate,
    endDate,
    // Don't pass `type` — we'll filter BUY/SELL in `activityToFilled` so
    // we can also see dividends/reinvestments in future phases if useful.
  })

  // SDK historically has shipped both shapes — defend against either.
  const activitiesData = activitiesResp as
    | { activities?: SnapActivity[] }
    | SnapActivity[]
    | undefined
  const activities: SnapActivity[] = Array.isArray(activitiesData)
    ? activitiesData
    : activitiesData?.activities ?? []

  const fills: FilledTrade[] = []
  for (const activity of activities) {
    const fill = activityToFilled(activity)
    if (fill) fills.push(fill)
  }

  return { fills, accountCount: accounts.length }
}

async function resolveConnections(
  request: Request
): Promise<{ connections: Connection[]; scope: 'user' | 'cron' } | Response> {
  // Try bearer first (cron path — syncs all users)
  const bearerFail = requireSyncSecret(request)
  if (!bearerFail) {
    const admin = createAdminClient()
    const { data } = await admin
      .from('broker_connections')
      .select('user_id, snaptrade_user_id, snaptrade_user_secret')
      .not('snaptrade_user_secret', 'is', null)
    return { connections: (data as Connection[] | null) ?? [], scope: 'cron' }
  }

  // Fall through to session path
  const sessionFail = await requireSession(request)
  if (sessionFail) return sessionFail

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'no user session' }, { status: 401 })

  const admin = createAdminClient()
  const { data: conn } = await admin
    .from('broker_connections')
    .select('user_id, snaptrade_user_id, snaptrade_user_secret')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!conn?.snaptrade_user_secret || !conn.snaptrade_user_id) {
    return Response.json(
      { error: 'no broker connected — connect a broker first' },
      { status: 400 }
    )
  }

  return { connections: [conn as Connection], scope: 'user' }
}

export async function GET(request: Request) {
  const unauth = await requireSession(request)
  if (unauth) return unauth

  const payload = await getSnapshot<FilledTradesPayload>('filled_trades', EMPTY_PAYLOAD)
  return Response.json(payload)
}

export async function POST(request: Request) {
  const resolved = await resolveConnections(request)
  if (resolved instanceof Response) return resolved

  const { connections, scope } = resolved

  if (connections.length === 0) {
    return Response.json(
      { error: 'no broker connections to sync', scope },
      { status: 400 }
    )
  }

  let body: { startDate?: string; endDate?: string } = {}
  try {
    body = await request.json()
  } catch {
    // Empty body is fine — cron hits with no body.
  }
  const startDate = body.startDate ?? '2000-01-01'  // cover all reasonable history
  const endDate = body.endDate ?? new Date().toISOString().split('T')[0]

  const admin = createAdminClient()
  const allFills: FilledTrade[] = []
  let totalAccounts = 0
  let lastSyncError: string | null = null

  for (const conn of connections) {
    try {
      const { fills, accountCount } = await syncConnection(conn, startDate, endDate)
      allFills.push(...fills)
      totalAccounts += accountCount
      await admin
        .from('broker_connections')
        .update({
          last_sync_at: new Date().toISOString(),
          status: 'connected',
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', conn.user_id)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      lastSyncError = message
      console.error(`[snaptrade/sync] user ${conn.user_id} failed:`, message)
    }
  }

  // Merge with existing snapshot fills — dedupe by id (idempotent re-syncs)
  const existing = await getSnapshot<FilledTradesPayload>('filled_trades', EMPTY_PAYLOAD)
  const byId = new Map<string, FilledTrade>()
  for (const fill of existing.fills) byId.set(fill.id, fill)
  for (const fill of allFills) byId.set(fill.id, fill)
  const mergedFills = Array.from(byId.values()).sort((a, b) =>
    b.fillTime.localeCompare(a.fillTime)
  )

  // Pair against the Brooks Trade Catalog (pre-trade reads from /trades).
  // Pairing is a pure function — cache the result in the snapshot so the
  // journal page just renders.
  const trades = await getSnapshot<TradesPayload>('trades', {
    trades: [],
    syncedAt: '',
    tradeCount: 0,
  })
  const paired = pairFills(mergedFills, trades.trades)
  const stats = perSetupStats(paired, trades.trades)
  const roundTrips = pairRoundTrips(mergedFills, paired)

  const payload: FilledTradesPayload = {
    fills: mergedFills,
    paired,
    stats,
    roundTrips,
    syncedAt: new Date().toISOString(),
    lastSyncError,
    accountCount: totalAccounts,
  }
  await setSnapshot('filled_trades', payload)

  return Response.json({
    scope,
    accounts: totalAccounts,
    fillsFetched: allFills.length,
    fillsTotal: mergedFills.length,
    lastSyncError,
  })
}
