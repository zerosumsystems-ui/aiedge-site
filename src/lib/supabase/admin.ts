import { createClient } from '@supabase/supabase-js'

/**
 * Service-role Supabase client for server-side route handlers.
 *
 * Uses SUPABASE_SERVICE_ROLE_KEY — MUST NEVER be imported from a client
 * component. Bypasses RLS; callers are responsible for their own auth
 * (requireSyncSecret, requireSession) before calling through.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error(
      'Supabase admin client requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY'
    )
  }

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}
