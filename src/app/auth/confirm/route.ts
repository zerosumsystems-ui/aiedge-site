import { NextResponse, type NextRequest } from 'next/server'
import type { EmailOtpType } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { isAllowed } from '@/lib/auth/allowlist'

function safeNextPath(value: string): string {
  return value.startsWith('/') && !value.startsWith('//') ? value : '/'
}

/**
 * Token-hash magic-link handler. The email template points here with
 * `?token_hash=...&type=magiclink&next=/...`. Unlike /auth/callback (which
 * uses PKCE and requires a code_verifier cookie set by the originating
 * browser), this flow verifies the token hash directly — no cookie needs
 * to travel with the click. That matters because iOS Mail, Gmail app, and
 * other mobile in-app browsers open links in an isolated cookie jar
 * from the one where the user submitted the form, breaking PKCE.
 *
 * On success, sets the Supabase session cookie and redirects to `next`
 * (defaulting to `/`).
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null
  const nextParam = searchParams.get('next') ?? '/'
  const next = safeNextPath(nextParam)

  if (!tokenHash || !type) {
    console.warn('[auth/confirm] missing token_hash or type', { hasToken: Boolean(tokenHash), type })
    return NextResponse.redirect(`${origin}/login?error=callback_failed`)
  }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash })

  if (error || !data.session) {
    console.warn('[auth/confirm] verifyOtp failed', {
      errorName: error?.name,
      errorMessage: error?.message,
      errorCode: (error as unknown as { code?: string })?.code,
      hasSession: Boolean(data?.session),
    })
    return NextResponse.redirect(`${origin}/login?error=callback_failed`)
  }

  const email = data.session.user.email
  if (!isAllowed(email)) {
    console.warn('[auth/confirm] email not on allowlist', { email })
    await supabase.auth.signOut()
    return NextResponse.redirect(`${origin}/login?error=not_invited`)
  }

  console.log('[auth/confirm] success', { email, next })
  return NextResponse.redirect(`${origin}${next}`)
}
