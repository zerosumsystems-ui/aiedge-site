import { requireSession } from '@/lib/auth/require-session'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createSnaptradeClient } from '@/lib/snaptrade/client'

export const dynamic = 'force-dynamic'

/**
 * Port of git show b5f196f:api/snaptrade-disconnect.js — reworked for Next.js
 * app-router + Supabase SSR cookie auth.
 *
 * POST /api/snaptrade/disconnect
 *   - calls deleteSnapTradeUser (best-effort, non-fatal if SDK errors)
 *   - deletes the broker_connections row
 *
 * Response: { success: true }
 */
export async function POST(request: Request) {
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
      .select('snaptrade_user_id')
      .eq('user_id', user.id)
      .maybeSingle()

    if (conn?.snaptrade_user_id) {
      try {
        const snaptrade = createSnaptradeClient()
        await snaptrade.authentication.deleteSnapTradeUser({
          userId: conn.snaptrade_user_id,
        })
      } catch (snapErr) {
        console.error(
          '[snaptrade/disconnect] SDK delete failed (non-fatal):',
          snapErr instanceof Error ? snapErr.message : String(snapErr)
        )
      }
    }

    await admin.from('broker_connections').delete().eq('user_id', user.id)

    return Response.json({ success: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[snaptrade/disconnect] failed:', message)
    return Response.json({ error: message }, { status: 500 })
  }
}
