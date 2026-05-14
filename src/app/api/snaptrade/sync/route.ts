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
 * Same filter rules as activityToFilled — but applied to existing FilledTrade
 * records that may predate the filter. We run this on the merged snapshot so
 * that SPAXX / sub-share fills that slipped in before these rules landed get
 * cleaned up on the next sync, not stuck forever.
 */
function isRealFill(fill: FilledTrade): boolean {
  if (CASH_SWEEP_TICKERS.has(fill.ticker.toUpperCase())) return false
  if (fill.qty < MIN_QTY) return false
  if (fill.price <= 0) return false
  return true
}

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

type SnaptradeClient = ReturnType<typeof createSnaptradeClient>

interface AccountDiag {
  accountId: string
  accountName: string | null
  institution: string | null
  endpoint: 'account-level' | 'transactions-fallback' | 'failed'
  pages: number
  activitiesFetched: number
  fillsAfterFilter: number
  error: string | null
}

/**
 * Fallback chunking for the deprecated transactionsAndReporting endpoint.
 * Only used if the modern accountInformation.getAccountActivities path
 * throws — it paginates by offset/limit instead, no chunking needed there.
 */
const CHUNK_DAYS = 180

function chunkDateRange(startDate: string, endDate: string): { start: string; end: string }[] {
  const start = new Date(startDate + 'T00:00:00Z').getTime()
  const end = new Date(endDate + 'T00:00:00Z').getTime()
  if (!isFinite(start) || !isFinite(end) || end < start) {
    return [{ start: startDate, end: endDate }]
  }
  const dayMs = 86_400_000
  const chunks: { start: string; end: string }[] = []
  let cursor = start
  while (cursor <= end) {
    const next = Math.min(cursor + (CHUNK_DAYS - 1) * dayMs, end)
    chunks.push({
      start: new Date(cursor).toISOString().slice(0, 10),
      end: new Date(next).toISOString().slice(0, 10),
    })
    cursor = next + dayMs
  }
  return chunks
}

/**
 * Modern path — SnapTrade's recommended endpoint as of the 2026-04-25
 * deprecation of transactionsAndReporting.getActivities. Per-account,
 * offset-paginated, 1000 rows/page. Returns the raw activities; let the
 * caller dedupe and filter.
 */
async function fetchAccountActivitiesPaginated(
  snaptrade: SnaptradeClient,
  conn: Connection,
  accountId: string,
  startDate: string,
  endDate: string
): Promise<{ activities: SnapActivity[]; pages: number }> {
  const out: SnapActivity[] = []
  const limit = 1000
  const MAX_PAGES = 50 // safety: 50k activities/account is plenty
  let offset = 0
  let pages = 0
  for (let i = 0; i < MAX_PAGES; i++) {
    const { data } = await snaptrade.accountInformation.getAccountActivities({
      accountId,
      userId: conn.snaptrade_user_id,
      userSecret: conn.snaptrade_user_secret,
      startDate,
      endDate,
      offset,
      limit,
    })
    pages++
    const page = (data as { data?: SnapActivity[] } | undefined)?.data ?? []
    out.push(...page)
    if (page.length < limit) break
    offset += limit
  }
  return { activities: out, pages }
}

/**
 * Legacy fallback — only fires if the modern endpoint throws for an
 * account. Chunked by date because the deprecated endpoint silently caps
 * results per request.
 */
async function fetchActivitiesViaTransactionsAPI(
  snaptrade: SnaptradeClient,
  conn: Connection,
  startDate: string,
  endDate: string,
  accountId: string
): Promise<SnapActivity[]> {
  const out: SnapActivity[] = []
  for (const { start, end } of chunkDateRange(startDate, endDate)) {
    const { data } = await snaptrade.transactionsAndReporting.getActivities({
      userId: conn.snaptrade_user_id,
      userSecret: conn.snaptrade_user_secret,
      startDate: start,
      endDate: end,
      accounts: accountId,
    })
    const activitiesData = data as
      | { activities?: SnapActivity[] }
      | SnapActivity[]
      | undefined
    const activities: SnapActivity[] = Array.isArray(activitiesData)
      ? activitiesData
      : activitiesData?.activities ?? []
    out.push(...activities)
  }
  return out
}

async function syncConnection(
  conn: Connection,
  startDate: string,
  endDate: string
): Promise<{ fills: FilledTrade[]; accountCount: number; accountDiags: AccountDiag[] }> {
  const snaptrade = createSnaptradeClient()

  const { data: accountsResp } = await snaptrade.accountInformation.listUserAccounts({
    userId: conn.snaptrade_user_id,
    userSecret: conn.snaptrade_user_secret,
  })
  const accounts: SnapAccount[] = Array.isArray(accountsResp) ? accountsResp : []

  const allFills: FilledTrade[] = []
  const seenIds = new Set<string>()
  const accountDiags: AccountDiag[] = []

  for (const acct of accounts) {
    if (!acct.id) continue
    const institutionName = acct.institutionName ?? acct.brokerage?.name ?? null
    const diag: AccountDiag = {
      accountId: acct.id,
      accountName: acct.name ?? null,
      institution: institutionName,
      endpoint: 'account-level',
      pages: 0,
      activitiesFetched: 0,
      fillsAfterFilter: 0,
      error: null,
    }

    let activities: SnapActivity[] = []
    try {
      const result = await fetchAccountActivitiesPaginated(
        snaptrade,
        conn,
        acct.id,
        startDate,
        endDate
      )
      activities = result.activities
      diag.pages = result.pages
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.warn(
        `[snaptrade/sync] account-level fetch failed for ${acct.id} (${institutionName ?? '?'}): ${message}. Falling back to transactionsAndReporting.`
      )
      diag.endpoint = 'transactions-fallback'
      try {
        activities = await fetchActivitiesViaTransactionsAPI(
          snaptrade,
          conn,
          startDate,
          endDate,
          acct.id
        )
      } catch (fallbackErr) {
        diag.endpoint = 'failed'
        diag.error = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr)
        console.error(
          `[snaptrade/sync] both endpoints failed for ${acct.id}: ${diag.error}`
        )
        accountDiags.push(diag)
        continue
      }
    }

    diag.activitiesFetched = activities.length

    let fillCount = 0
    for (const activity of activities) {
      const key =
        activity.id ??
        `${activity.tradeDate ?? activity.trade_date ?? activity.settlementDate ?? activity.settlement_date ?? ''}_${
          activity.symbol?.symbol ?? activity.symbol?.raw_symbol ?? ''
        }_${activity.type ?? ''}_${activity.units ?? activity.quantity ?? ''}_${activity.price ?? ''}`
      if (seenIds.has(key)) continue
      seenIds.add(key)
      const fill = activityToFilled(activity)
      if (fill) {
        allFills.push(fill)
        fillCount++
      }
    }
    diag.fillsAfterFilter = fillCount

    console.log(
      `[snaptrade/sync] ${institutionName ?? 'broker'} ${acct.id} via ${diag.endpoint}: ${diag.activitiesFetched} activities, ${diag.fillsAfterFilter} fills`
    )

    accountDiags.push(diag)
  }

  return { fills: allFills, accountCount: accounts.length, accountDiags }
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
  const allDiags: AccountDiag[] = []

  for (const conn of connections) {
    try {
      const { fills, accountCount, accountDiags } = await syncConnection(conn, startDate, endDate)
      allFills.push(...fills)
      totalAccounts += accountCount
      allDiags.push(...accountDiags)
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

  // Merge with existing snapshot fills — dedupe by id (idempotent re-syncs).
  // Apply the cash-sweep + min-qty filter to merged fills too, so old records
  // that landed before the filter existed get cleaned up on this sync.
  const existing = await getSnapshot<FilledTradesPayload>('filled_trades', EMPTY_PAYLOAD)
  const byId = new Map<string, FilledTrade>()
  for (const fill of existing.fills) if (isRealFill(fill)) byId.set(fill.id, fill)
  for (const fill of allFills) if (isRealFill(fill)) byId.set(fill.id, fill)
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
  // Naked SELLs (no preceding BUY in the stream) are treated as orphan
  // exits rather than synthesized as shorts. This prevents phantom short
  // round-trips when SnapTrade misses earlier entry fills (the common
  // failure mode with a fresh broker connection).
  const { roundTrips, orphanExitFills, orphanExitShares } = pairRoundTrips(
    mergedFills,
    paired
  )

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
    roundTripCount: roundTrips.length,
    openRoundTripCount: roundTrips.filter((t) => t.isOpen).length,
    orphanExitFills,
    orphanExitShares,
    lastSyncError,
    accountDiagnostics: allDiags,
  })
}
