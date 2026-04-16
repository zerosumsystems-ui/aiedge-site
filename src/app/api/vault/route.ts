import type { VaultPayload } from '@/lib/types'
import { requireSyncSecret } from '@/lib/auth/sync-secret'
import { getSnapshot, setSnapshot } from '@/lib/snapshots'

export const dynamic = 'force-dynamic'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

const EMPTY_PAYLOAD: VaultPayload = {
  notes: [],
  syncedAt: '',
  noteCount: 0,
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const slug = searchParams.get('slug')

  const payload = await getSnapshot<VaultPayload>('vault', EMPTY_PAYLOAD)

  if (slug) {
    const note = payload.notes.find((n) => n.slug === slug)
    if (!note) {
      return Response.json({ error: 'Note not found' }, { status: 404, headers: CORS_HEADERS })
    }
    return Response.json(note, { headers: CORS_HEADERS })
  }

  return Response.json(payload, { headers: CORS_HEADERS })
}

export async function POST(request: Request) {
  const unauth = requireSyncSecret(request)
  if (unauth) return unauth
  try {
    const payload: VaultPayload = await request.json()
    await setSnapshot('vault', payload)
    return Response.json({ ok: true, noteCount: payload.noteCount }, { status: 200, headers: CORS_HEADERS })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return Response.json({ error: message }, { status: 500, headers: CORS_HEADERS })
  }
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS })
}
