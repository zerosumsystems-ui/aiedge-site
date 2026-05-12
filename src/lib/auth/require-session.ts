import { isAllowed } from './allowlist'
import { createClient } from '@/lib/supabase/server'

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' }

/**
 * Auth gate for Route Handlers that expose account, trade, broker, or
 * review data. Public APIs should not call this helper; they should be
 * public by explicit route choice, not because auth is a no-op.
 */
export async function requireAuth(request: Request): Promise<Response | null> {
  void request

  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return Response.json({ error: 'unauthorized' }, { status: 401, headers: NO_STORE_HEADERS })
    }

    if (!isAllowed(user.email)) {
      await supabase.auth.signOut()
      return Response.json({ error: 'not_invited' }, { status: 403, headers: NO_STORE_HEADERS })
    }

    return null
  } catch {
    return Response.json({ error: 'auth not configured' }, { status: 503, headers: NO_STORE_HEADERS })
  }
}

export const requireSession = requireAuth
