import type { JournalEntry, JournalPayload } from '@/lib/types'
import { requireSyncSecret } from '@/lib/auth/sync-secret'
import { requireSession } from '@/lib/auth/require-session'
import { getSnapshot, setSnapshot } from '@/lib/snapshots'

export const dynamic = 'force-dynamic'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

const EMPTY_PAYLOAD: JournalPayload = { entries: [], syncedAt: '', entryCount: 0 }

export async function GET(request: Request) {
  const unauth = await requireSession(request)
  if (unauth) return unauth
  const { searchParams } = new URL(request.url)
  const type = searchParams.get('type')
  const date = searchParams.get('date')

  const payload = await getSnapshot<JournalPayload>('journal', EMPTY_PAYLOAD)
  let entries = payload.entries

  if (type) entries = entries.filter((e) => e.type === type)
  if (date) entries = entries.filter((e) => e.date === date)

  return Response.json(
    { entries, entryCount: entries.length, syncedAt: payload.syncedAt },
    { headers: CORS_HEADERS }
  )
}

export async function POST(request: Request) {
  const unauth = requireSyncSecret(request)
  if (unauth) return unauth
  try {
    const body = await request.json()

    // Bulk sync — replace all entries
    if (body.entries) {
      const payload: JournalPayload = {
        entries: body.entries,
        syncedAt: body.syncedAt || new Date().toISOString(),
        entryCount: body.entries.length,
      }
      await setSnapshot('journal', payload)
      return Response.json(
        { ok: true, entryCount: payload.entryCount },
        { status: 200, headers: CORS_HEADERS }
      )
    }

    // Single entry — append or update by id
    const entry: JournalEntry = body
    const payload = await getSnapshot<JournalPayload>('journal', { ...EMPTY_PAYLOAD })
    const existing = payload.entries.findIndex((e) => e.id === entry.id)
    if (existing >= 0) {
      payload.entries[existing] = entry
    } else {
      payload.entries.push(entry)
    }
    payload.syncedAt = new Date().toISOString()
    payload.entryCount = payload.entries.length
    await setSnapshot('journal', payload)
    return Response.json(
      { ok: true, id: entry.id, entryCount: payload.entryCount },
      { status: 200, headers: CORS_HEADERS }
    )
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return Response.json({ error: message }, { status: 500, headers: CORS_HEADERS })
  }
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS })
}
