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
    const detail = extractSnaptradeError(err)
    console.error('[snaptrade/register] failed:', detail)
    return Response.json(
      { error: detail.message, snaptrade: detail.body, status: detail.status },
      { status: 500 }
    )
  }
}

type SnaptradeErrorDetail = {
  message: string
  status?: number
  body?: unknown
}

// The SnapTrade SDK wraps axios, so on 4xx the useful info is on
// err.response.{status,data}. err.message alone is just "Request failed with
// status code 400" — surface the SnapTrade body so the caller can act on it
// (shown in the BrokerPanel toast and in Vercel runtime logs).
function extractSnaptradeError(err: unknown): SnaptradeErrorDetail {
  if (typeof err === 'object' && err !== null) {
    const maybeResponse = (err as { response?: { status?: number; data?: unknown } }).response
    if (maybeResponse && (maybeResponse.status || maybeResponse.data)) {
      const body = maybeResponse.data
      const bodyMessage =
        typeof body === 'object' && body !== null
          ? (body as { detail?: string; message?: string }).detail ??
            (body as { detail?: string; message?: string }).message
          : typeof body === 'string'
            ? body
            : undefined
      const fallback = err instanceof Error ? err.message : 'SnapTrade request failed'
      return {
        message: bodyMessage ?? fallback,
        status: maybeResponse.status,
        body,
      }
    }
  }
  return { message: err instanceof Error ? err.message : String(err) }
}
