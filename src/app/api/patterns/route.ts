import { readFile, writeFile } from 'fs/promises'
import type { PatternLabPayload } from '@/lib/types'

export const dynamic = 'force-dynamic'

const PATTERNS_FILE = '/tmp/aiedge-patterns-latest.json'

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

let cachedPayload: PatternLabPayload | null = null

export async function GET() {
  if (cachedPayload) {
    return Response.json(cachedPayload, { headers: CORS_HEADERS })
  }
  try {
    const raw = await readFile(PATTERNS_FILE, 'utf-8')
    const payload: PatternLabPayload = JSON.parse(raw)
    cachedPayload = payload
    return Response.json(payload, { headers: CORS_HEADERS })
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === 'ENOENT') {
      return Response.json(EMPTY_PAYLOAD, { headers: CORS_HEADERS })
    }
    const message = err instanceof Error ? err.message : String(err)
    return Response.json({ error: message }, { status: 500, headers: CORS_HEADERS })
  }
}

export async function POST(request: Request) {
  try {
    const payload: PatternLabPayload = await request.json()
    cachedPayload = payload
    await writeFile(PATTERNS_FILE, JSON.stringify(payload), 'utf-8')
    return Response.json({ ok: true }, { status: 200, headers: CORS_HEADERS })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return Response.json({ error: message }, { status: 500, headers: CORS_HEADERS })
  }
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS })
}
