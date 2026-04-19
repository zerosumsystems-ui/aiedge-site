import { requireSession } from '@/lib/auth/require-session'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createSnaptradeClient } from '@/lib/snaptrade/client'

export const dynamic = 'force-dynamic'

/**
 * Port of git show b5f196f:api/snaptrade-register.js — reworked for Next.js
 * app-router + Supabase SSR cookie auth.
 *
 * POST /api/snaptrade/register
 *   - if user already has a SnapTrade registration → issue a fresh login redirect
 *   - else → register a new SnapTrade user, persist id+secret, issue login redirect
 *
 * Response: { redirectURI: string }
 *   Frontend navigates to redirectURI (SnapTrade Connection Portal); SnapTrade
 *   redirects back to SNAPTRADE_REDIRECT_URI on completion.
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

    const snaptrade = createSnaptradeClient()
    const admin = createAdminClient()

    const redirectBase =
      process.env.SNAPTRADE_REDIRECT_URI ??
      `${new URL(request.url).origin}/journal?broker=connected`

    const { data: existing } = await admin
      .from('broker_connections')
      .select('snaptrade_user_id, snaptrade_user_secret')
      .eq('user_id', user.id)
      .maybeSingle()

    if (existing?.snaptrade_user_secret && existing.snaptrade_user_id) {
      const { data: loginData } = await snaptrade.authentication.loginSnapTradeUser({
        userId: existing.snaptrade_user_id,
        userSecret: existing.snaptrade_user_secret,
        connectionType: 'read',
        customRedirect: redirectBase,
      })
      return Response.json({ redirectURI: (loginData as { redirectURI?: string }).redirectURI })
    }

    const { data: regData } = await snaptrade.authentication.registerSnapTradeUser({
      userId: user.id,
    })

    await admin.from('broker_connections').upsert({
      user_id: user.id,
      snaptrade_user_id: regData.userId,
      snaptrade_user_secret: regData.userSecret,
      status: 'registered',
      updated_at: new Date().toISOString(),
    })

    const { data: loginData } = await snaptrade.authentication.loginSnapTradeUser({
      userId: regData.userId!,
      userSecret: regData.userSecret!,
      connectionType: 'read',
      customRedirect: redirectBase,
    })

    return Response.json({ redirectURI: (loginData as { redirectURI?: string }).redirectURI })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[snaptrade/register] failed:', message)
    return Response.json({ error: message }, { status: 500 })
  }
}
