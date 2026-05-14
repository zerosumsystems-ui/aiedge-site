import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

/**
 * PATCH /api/scanner/candidates/[id]
 *
 * Updates trader feedback on a scanner candidate: status (one of
 * 'new' | 'good' | 'bad' | 'traded') and/or note (free-form text).
 *
 * Auth is intentionally loose for this build — AIedge is public and
 * requireSession is currently a no-op. Once the site re-gates we'll
 * tighten to the trader's own labels; the RLS policy already restricts
 * UPDATE to the authenticated role.
 */

const ALLOWED_STATUSES = new Set(['new', 'good', 'bad', 'traded'])

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: idRaw } = await params
  const id = Number(idRaw)
  if (!Number.isFinite(id) || id <= 0) {
    return Response.json({ error: 'invalid id' }, { status: 400, headers: { 'Cache-Control': 'no-store' } })
  }

  let body: { status?: string; note?: string }
  try {
    body = (await request.json()) as { status?: string; note?: string }
  } catch {
    return Response.json({ error: 'invalid json body' }, { status: 400, headers: { 'Cache-Control': 'no-store' } })
  }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (typeof body.status === 'string') {
    const next = body.status.trim().toLowerCase()
    if (!ALLOWED_STATUSES.has(next)) {
      return Response.json(
        { error: `invalid status — must be one of: ${[...ALLOWED_STATUSES].join(', ')}` },
        { status: 400, headers: { 'Cache-Control': 'no-store' } },
      )
    }
    update.status = next
  }
  if (typeof body.note === 'string') {
    update.note = body.note.slice(0, 4000)   // cap free-form input
  }
  if (Object.keys(update).length === 1) {
    return Response.json({ error: 'nothing to update' }, { status: 400, headers: { 'Cache-Control': 'no-store' } })
  }

  let supabase
  try {
    supabase = createAdminClient()
  } catch {
    return Response.json({ error: 'supabase not configured' }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
  }

  const { data, error } = await supabase
    .from('setup_candidates')
    .update(update)
    .eq('id', id)
    .select('id, symbol, session_date, pattern, direction, status, note, updated_at')
    .maybeSingle()

  if (error) {
    return Response.json({ error: error.message }, { status: 500, headers: { 'Cache-Control': 'no-store' } })
  }
  if (!data) {
    return Response.json({ error: 'candidate not found' }, { status: 404, headers: { 'Cache-Control': 'no-store' } })
  }
  return Response.json({ candidate: data }, { status: 200, headers: { 'Cache-Control': 'no-store' } })
}
