import type { DailySnapshot, HistoryPayload } from '@/lib/types'
import { requireSyncSecret } from '@/lib/auth/sync-secret'
import { requireSession } from '@/lib/auth/require-session'
import { getSnapshot, setSnapshot } from '@/lib/snapshots'

export const dynamic = 'force-dynamic'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

const EMPTY_PAYLOAD: HistoryPayload = { snapshots: [], syncedAt: '' }

export async function GET(request: Request) {
  const unauth = await requireSession(request)
  if (unauth) return unauth
  const { searchParams } = new URL(request.url)
  const date = searchParams.get('date')

  const payload = await getSnapshot<HistoryPayload>('scan-history', EMPTY_PAYLOAD)

  if (date) {
    const snap = payload.snapshots.find((s) => s.date === date)
    if (!snap) {
      return Response.json({ error: 'No snapshot for that date' }, { status: 404, headers: CORS_HEADERS })
    }
    return Response.json(snap, { headers: CORS_HEADERS })
  }

  // Return list of dates + summary stats (not full payloads)
  const index = payload.snapshots
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((s) => ({
      date: s.date,
      capturedAt: s.capturedAt,
      symbolsScanned: s.payload.symbolsScanned,
      passedFilters: s.payload.passedFilters,
      resultCount: s.payload.results.length,
    }))

  return Response.json({ dates: index, total: index.length }, { headers: CORS_HEADERS })
}

export async function POST(request: Request) {
  const unauth = requireSyncSecret(request)
  if (unauth) return unauth
  try {
    const body = await request.json()

    // Accept either a single snapshot or a full sync payload
    if (body.snapshots) {
      // Full sync — replace all history
      const payload: HistoryPayload = body
      await setSnapshot('scan-history', payload)
      return Response.json({ ok: true, total: payload.snapshots.length }, { status: 200, headers: CORS_HEADERS })
    }

    // Single snapshot — append/replace for that date
    const snapshot: DailySnapshot = body
    const payload = await getSnapshot<HistoryPayload>('scan-history', { ...EMPTY_PAYLOAD })
    const existing = payload.snapshots.findIndex((s) => s.date === snapshot.date)
    if (existing >= 0) {
      payload.snapshots[existing] = snapshot
    } else {
      payload.snapshots.push(snapshot)
    }
    payload.syncedAt = new Date().toISOString()
    await setSnapshot('scan-history', payload)
    return Response.json({ ok: true, date: snapshot.date, total: payload.snapshots.length }, { status: 200, headers: CORS_HEADERS })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return Response.json({ error: message }, { status: 500, headers: CORS_HEADERS })
  }
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS })
}
