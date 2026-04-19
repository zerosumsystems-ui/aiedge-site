import { SnaptradeError } from 'snaptrade-typescript-sdk'
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
 * Self-healing on two common production failure modes:
 *   1. Stored credentials exist but SnapTrade rejects them (stale) → delete + re-register
 *   2. No stored credentials but SnapTrade already has a user with this userId
 *      (disconnect didn't land server-side) → delete upstream + re-register
 *
 * Response: { redirectURI: string }
 *   Frontend navigates to redirectURI (SnapTrade Connection Portal); SnapTrade
 *   redirects back to SNAPTRADE_REDIRECT_URI on completion.
 */

function describeError(err: unknown): { message: string; status?: number; body?: unknown } {
  if (err instanceof SnaptradeError) {
    return {
      message: `SnapTrade ${err.status ?? '?'} ${err.statusText ?? ''}: ${err.message}`.trim(),
      status: err.status,
      body: err.responseBody,
    }
  }
  if (err instanceof Error) return { message: err.message }
  return { message: String(err) }
}

/** SnapTrade returns 4xx for "user not found" (stale creds) and 400 for
 * "already registered" (orphan user). Anything non-5xx we can try to self-heal. */
function isRecoverable(status?: number): boolean {
  return typeof status === 'number' && status >= 400 && status < 500
}

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

    // --- Path A: stored creds → try login, fall back to re-register on stale creds ---
    if (existing?.snaptrade_user_secret && existing.snaptrade_user_id) {
      try {
        const { data: loginData } = await snaptrade.authentication.loginSnapTradeUser({
          userId: existing.snaptrade_user_id,
          userSecret: existing.snaptrade_user_secret,
          connectionType: 'read',
          customRedirect: redirectBase,
        })
        return Response.json({
          redirectURI: (loginData as { redirectURI?: string }).redirectURI,
        })
      } catch (loginErr) {
        const info = describeError(loginErr)
        if (!isRecoverable(info.status)) throw loginErr
        console.warn(
          '[snaptrade/register] login with stored creds failed, re-registering:',
          info.message,
          info.body
        )
        // Fall through to re-register below.
      }
    }

    // --- Path B: no creds (or stale) → register, self-heal on "already exists" ---
    const registerOnce = () =>
      snaptrade.authentication.registerSnapTradeUser({ userId: user.id })

    let regData: { userId?: string; userSecret?: string }
    try {
      const { data } = await registerOnce()
      regData = data
    } catch (regErr) {
      const info = describeError(regErr)
      if (!isRecoverable(info.status)) throw regErr
      // SnapTrade likely already has a user with userId=user.id (orphan
      // upstream, no local row). Best-effort delete, then retry.
      console.warn(
        '[snaptrade/register] register failed, attempting delete+retry:',
        info.message,
        info.body
      )
      try {
        await snaptrade.authentication.deleteSnapTradeUser({ userId: user.id })
      } catch (deleteErr) {
        const dInfo = describeError(deleteErr)
        console.error(
          '[snaptrade/register] upstream delete failed (non-fatal, will still retry):',
          dInfo.message,
          dInfo.body
        )
      }
      const { data } = await registerOnce()
      regData = data
    }

    if (!regData.userId || !regData.userSecret) {
      throw new Error('SnapTrade register returned no userId/userSecret')
    }

    // Use delete-then-insert instead of upsert(onConflict) to sidestep any
    // PostgREST schema-cache staleness around unique-constraint metadata —
    // if we got here the old row (if any) is stale anyway because we just
    // re-registered upstream. We also avoid passing columns that might be
    // missing from the cache, keeping the insert minimal.
    const { error: deleteErr } = await admin
      .from('broker_connections')
      .delete()
      .eq('user_id', user.id)
    if (deleteErr) {
      console.error(
        '[snaptrade/register] pre-insert delete failed:',
        `code=${deleteErr.code}`,
        `msg=${deleteErr.message}`,
        `details=${deleteErr.details ?? ''}`
      )
      throw new Error(
        `Failed to clear stale broker row (code=${deleteErr.code ?? '?'}): ${deleteErr.message}`
      )
    }

    const { error: insertErr } = await admin
      .from('broker_connections')
      .insert({
        user_id: user.id,
        snaptrade_user_id: regData.userId,
        snaptrade_user_secret: regData.userSecret,
      })
    if (insertErr) {
      console.error(
        '[snaptrade/register] insert failed:',
        `code=${insertErr.code}`,
        `msg=${insertErr.message}`,
        `details=${insertErr.details ?? ''}`,
        `hint=${insertErr.hint ?? ''}`
      )
      throw new Error(
        `Failed to persist SnapTrade credentials (code=${insertErr.code ?? '?'}): ${insertErr.message}`
      )
    }

    const { data: loginData } = await snaptrade.authentication.loginSnapTradeUser({
      userId: regData.userId,
      userSecret: regData.userSecret,
      connectionType: 'read',
      customRedirect: redirectBase,
    })

    return Response.json({ redirectURI: (loginData as { redirectURI?: string }).redirectURI })
  } catch (err: unknown) {
    const info = describeError(err)
    console.error(
      '[snaptrade/register] failed:',
      JSON.stringify({ status: info.status, message: info.message, body: info.body })
    )
    return Response.json(
      { error: info.message, snaptrade: info.body, status: info.status ?? 500 },
      { status: 500 }
    )
  }
}
