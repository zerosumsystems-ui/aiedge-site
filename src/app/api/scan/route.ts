import type { ScanPayload } from '@/lib/types'
import { requireSyncSecret } from '@/lib/auth/sync-secret'
import { requireSession } from '@/lib/auth/require-session'
import { getSnapshot, setSnapshot } from '@/lib/snapshots'

export const dynamic = 'force-dynamic'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

const EMPTY_PAYLOAD: ScanPayload = {
  results: [],
  timestamp: '',
  date: '',
  symbolsScanned: 0,
  passedFilters: 0,
  scanTime: '',
  nextScan: '',
}

export async function GET(request: Request) {
  const unauth = await requireSession(request)
  if (unauth) return unauth
  const payload = await getSnapshot<ScanPayload>('scan', EMPTY_PAYLOAD)
  return Response.json(payload, { headers: CORS_HEADERS })
}

export async function POST(request: Request) {
  const unauth = requireSyncSecret(request)
  if (unauth) return unauth
  try {
    const payload: ScanPayload = await request.json()
    await setSnapshot('scan', payload)
    return Response.json({ ok: true }, { status: 200, headers: CORS_HEADERS })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return Response.json({ error: message }, { status: 500, headers: CORS_HEADERS })
  }
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS })
}
