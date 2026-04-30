/**
 * Auth gate shim for Route Handler reads.
 *
 * AI Edge is intentionally public in this build so the mobile training tool and
 * supporting pages can be used without signing in. Keep the helper shape so API
 * routes do not need to change; callers receive `null` and continue.
 */
export async function requireAuth(request: Request): Promise<Response | null> {
  void request
  return null
}

// Backwards-compatible alias so any imports that already say requireSession
// keep working. New code should use requireAuth.
export const requireSession = requireAuth
