import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { isAllowed } from '@/lib/auth/allowlist'

/**
 * Routes that never require a session. Anything else hitting the proxy
 * without a signed-in + allowlisted user gets redirected to /login.
 *
 * /api/* is excluded from the proxy matcher entirely (see src/proxy.ts)
 * so API auth is enforced per-route.
 */
const PUBLIC_PREFIXES = ['/login', '/auth', '/blog']

function isPublic(pathname: string) {
  return PUBLIC_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  )
}

/**
 * Runs on every page request via src/proxy.ts. Refreshes the Supabase
 * session cookie if expired, then gates private routes. Returns a
 * response that MUST be returned from proxy — it may carry Set-Cookie
 * headers from the session refresh.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // IMPORTANT: don't run any code between createServerClient and getUser.
  // A simple bug can cause session refresh to desync from the response.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname, search } = request.nextUrl

  if (isPublic(pathname)) {
    return supabaseResponse
  }

  // Gated route — require a signed-in, allowlisted user.
  if (!user) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.search = `?next=${encodeURIComponent(pathname + search)}`
    return NextResponse.redirect(url)
  }

  if (!isAllowed(user.email)) {
    // Signed in but email not on the allowlist. Sign them out and bounce.
    await supabase.auth.signOut()
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.search = '?error=not_invited'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}
