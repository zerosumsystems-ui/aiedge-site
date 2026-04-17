import type { PatternLabPayload } from '@/lib/types'
import { requireSyncSecret } from '@/lib/auth/sync-secret'
import { requireSession } from '@/lib/auth/require-session'
import { getSnapshot, setSnapshot, type SnapshotKey } from '@/lib/snapshots'

export const dynamic = 'force-dynamic'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

const EMPTY_PAYLOAD: PatternLabPayload = {
  summary: { totalDetections: 0, datesTracked: 0, dateRange: { from: '', to: '' } },
  bySetup: {},
  byContext: {},
  byTimeOfDay: [],
  recentDetections: [],
}

/**
 * `/api/patterns/run/[runId]` — per-backtest-run pattern stats.
 *
 * Storage: `api_snapshots` row keyed `patterns:run:<runId>`. One row per run.
 * Source: `claude_backtest.py --push` (Python) or direct POST from any tool
 * authenticated with `SYNC_SECRET`. Browsers read via GET with a session.
 */

function runKey(runId: string): SnapshotKey {
  return `patterns:run:${runId}` as SnapshotKey
}

function isSafeRunId(s: string): boolean {
  return /^[A-Za-z0-9_\-:.]{1,128}$/.test(s)
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const unauth = await requireSession(request)
  if (unauth) return unauth
  const { runId } = await params
  if (!isSafeRunId(runId)) {
    return Response.json({ error: 'invalid runId' }, { status: 400, headers: CORS_HEADERS })
  }
  const payload = await getSnapshot<PatternLabPayload>(runKey(runId), EMPTY_PAYLOAD)
  return Response.json(payload, { headers: CORS_HEADERS })
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const unauth = requireSyncSecret(request)
  if (unauth) return unauth
  const { runId } = await params
  if (!isSafeRunId(runId)) {
    return Response.json({ error: 'invalid runId' }, { status: 400, headers: CORS_HEADERS })
  }
  try {
    const payload: PatternLabPayload = await request.json()
    await setSnapshot(runKey(runId), payload)
    return Response.json({ ok: true, runId }, { status: 200, headers: CORS_HEADERS })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return Response.json({ error: message }, { status: 500, headers: CORS_HEADERS })
  }
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS })
}
