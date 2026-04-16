import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isAllowed } from '@/lib/auth/allowlist'

/**
 * Magic-link return target. Supabase appends ?code=<otp> and ?next=<path>.
 * Exchange the code for a session, re-check the allowlist (belt +
 * suspenders — the login action already checked, but the row could have
 * been removed between send and click), then land the user on `next`.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const nextParam = searchParams.get('next') ?? '/'
  // Prevent open-redirect: only allow same-origin absolute paths.
  const next = nextParam.startsWith('/') ? nextParam : '/'

  if (!code) {
    console.warn('[auth/callback] no code in query string')
    return NextResponse.redirect(`${origin}/login?error=callback_failed`)
  }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.exchangeCodeForSession(code)

  if (error || !data.session) {
    console.warn('[auth/callback] exchangeCodeForSession failed:', {
      errorName: error?.name,
      errorMessage: error?.message,
      errorCode: (error as unknown as { code?: string })?.code,
      hasSession: Boolean(data?.session),
      codePrefix: code.slice(0, 10),
    })
    return NextResponse.redirect(`${origin}/login?error=callback_failed`)
  }

  const email = data.session.user.email
  if (!isAllowed(email)) {
    console.warn('[auth/callback] email not on allowlist:', { email })
    await supabase.auth.signOut()
    return NextResponse.redirect(`${origin}/login?error=not_invited`)
  }

  console.log('[auth/callback] success', { email, next })
  return NextResponse.redirect(`${origin}${next}`)
}
