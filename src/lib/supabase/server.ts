import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export function isSupabaseConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
}

/**
 * Supabase client for Server Components, Server Actions, and Route Handlers.
 * Reads + writes the session cookie via next/headers. `cookies()` is async
 * in Next.js 16 — callers must await this function.
 */
export async function createClient() {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase is not configured')
  }

  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Called from a Server Component — ignore. The proxy handles
            // session refresh for subsequent requests.
          }
        },
      },
    }
  )
}
