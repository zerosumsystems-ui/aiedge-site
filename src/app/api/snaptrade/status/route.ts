import { requireSession } from '@/lib/auth/require-session'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createSnaptradeClient } from '@/lib/snaptrade/client'

export const dynamic = 'force-dynamic'

/**
 * Port of git show b5f196f:api/snaptrade-status.js — reworked for Next.js
 * app-router + Supabase SSR cookie auth.
 *
 * GET /api/snaptrade/status
 * Response: {
 *   connected: boolean,
 *   status: 'registered' | 'connected' | 'disconnected' | 'error',
 *   accounts: Array<{ id, name, number, institution }>,
 *   lastSync: string | null
 * }
 */
export async function GET(request: Request) {
  const unauth = await requireSession(request)
  if (unauth) return unauth

  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return Response.json({ error: 'no user session' }, { status: 401 })
    }

    const admin = createAdminClient()

    const { data: conn } = await admin
      .from('broker_connections')
      .select('snaptrade_user_id, snaptrade_user_secret, status, last_sync_at')
      .eq('user_id', user.id)
      .maybeSingle()

    if (!conn?.snaptrade_user_secret || !conn.snaptrade_user_id) {
      return Response.json({
        connected: false,
        status: 'disconnected',
        accounts: [],
        lastSync: null,
      })
    }

    const snaptrade = createSnaptradeClient()

    try {
      const { data: accounts } = await snaptrade.accountInformation.listUserAccounts({
        userId: conn.snaptrade_user_id,
        userSecret: conn.snaptrade_user_secret,
      })

      const list = Array.isArray(accounts) ? accounts : []
      const connected = list.length > 0

      if (connected && conn.status !== 'connected') {
        await admin
          .from('broker_connections')
          .update({ status: 'connected', updated_at: new Date().toISOString() })
          .eq('user_id', user.id)
      }

      type SnapAccount = {
        id?: string
        name?: string | null
        number?: string | null
        institutionName?: string | null
        brokerage?: { name?: string | null } | null
      }

      return Response.json({
        connected,
        status: connected ? 'connected' : 'registered',
        accounts: list.map((a: SnapAccount) => ({
          id: a.id ?? '',
          name: a.name ?? '',
          number: a.number ?? '',
          institution:
            a.institutionName || a.brokerage?.name || 'Unknown',
        })),
        lastSync: conn.last_sync_at ?? null,
      })
    } catch (snapErr) {
      console.error(
        '[snaptrade/status] SDK list failed:',
        snapErr instanceof Error ? snapErr.message : String(snapErr)
      )
      return Response.json({
        connected: false,
        status: 'error',
        accounts: [],
        lastSync: conn.last_sync_at ?? null,
      })
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[snaptrade/status] failed:', message)
    return Response.json({ error: message }, { status: 500 })
  }
}
