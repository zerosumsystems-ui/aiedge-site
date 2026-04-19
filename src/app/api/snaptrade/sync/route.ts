import type {
  FilledTrade,
  FilledTradesPayload,
} from '@/lib/types'
import { requireSession } from '@/lib/auth/require-session'
import { requireSyncSecret } from '@/lib/auth/sync-secret'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createSnaptradeClient } from '@/lib/snaptrade/client'
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
  syncedAt: '',
  lastSyncError: null,
  accountCount: 0,
}

type SnapSymbol = {
  symbol?: string
  description?: string
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
  description?: string
  account?: { id?: string; name?: string | null } | null
}

type SnapAccount = {
  id?: string
  name?: string | null
  number?: string | null
  institutionName?: string | null
  brokerage?: { name?: string | null } | null
}

/** Ported verbatim (minus types) from the old activityToTrade in snaptrade-sync.js */
function activityToFilled(
  activity: SnapActivity,
  accountId: string,
  accountName: string | null
): FilledTrade | null {
  const type = (activity.type ?? '').toUpperCase()
  if (type !== 'BUY' && type !== 'SELL') return null

  const rawSymbol =
    activity.symbol?.symbol ?? activity.symbol?.description ?? ''
  if (!rawSymbol) return null
  const ticker = rawSymbol.split(' ')[0].toUpperCase()

  const qty = Math.abs(activity.units ?? activity.quantity ?? 0)
  const price = activity.price ?? 0
  if (qty === 0 || price === 0) return null

  const dateStr =
    activity.tradeDate ??
    activity.trade_date ??
    activity.settlementDate ??
    ''
  if (!dateStr) return null
  const fillTime = new Date(dateStr).toISOString()
  const date = fillTime.split('T')[0]

  const brokerTradeId = activity.id ?? null
  const id = brokerTradeId ?? `${fillTime}_${ticker}_${type}_${qty}`

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
    accountId,
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

  const { data: accountsResp } = await snaptrade.accountInformation.listUserAccounts({
    userId: conn.snaptrade_user_id,
    userSecret: conn.snaptrade_user_secret,
  })

  const accounts: SnapAccount[] = Array.isArray(accountsResp) ? accountsResp : []
  const fills: FilledTrade[] = []

  for (const account of accounts) {
    if (!account.id) continue
    const accountLabel = account.name
      ?? `${account.institutionName ?? account.brokerage?.name ?? 'Broker'}${account.number ? ` ${account.number}` : ''}`

    try {
      let offset = 0
      const limit = 1000
      let hasMore = true

      while (hasMore) {
        const { data: page } = await snaptrade.accountInformation.getAccountActivities({
          accountId: account.id,
          userId: conn.snaptrade_user_id,
          userSecret: conn.snaptrade_user_secret,
          startDate,
          endDate,
          type: 'BUY,SELL',
          offset,
          limit,
        })

        // SDK historically has shipped both shapes — defend against either.
        const pageData = page as { activities?: SnapActivity[] } | SnapActivity[] | undefined
        const activities: SnapActivity[] = Array.isArray(pageData)
          ? pageData
          : pageData?.activities ?? []

        if (activities.length === 0) {
          hasMore = false
          break
        }

        for (const activity of activities) {
          const fill = activityToFilled(activity, account.id, accountLabel ?? null)
          if (fill) fills.push(fill)
        }

        hasMore = activities.length === limit
        offset += limit
      }
    } catch (acctErr) {
      console.error(
        `[snaptrade/sync] account ${account.id} failed:`,
        acctErr instanceof Error ? acctErr.message : String(acctErr)
      )
    }
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
  const startDate = body.startDate ?? '2020-01-01'
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

  const payload: FilledTradesPayload = {
    fills: mergedFills,
    paired: [],       // Phase 2 populates
    stats: {},        // Phase 2 populates
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
