import { readFile, writeFile } from 'fs/promises'
import type { JournalEntry, JournalPayload } from '@/lib/types'

export const dynamic = 'force-dynamic'

const JOURNAL_FILE = '/tmp/aiedge-journal-latest.json'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

const EMPTY_PAYLOAD: JournalPayload = { entries: [], syncedAt: '', entryCount: 0 }

let cachedPayload: JournalPayload | null = null

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const type = searchParams.get('type')
  const date = searchParams.get('date')

  const payload = await getPayload()
  let entries = payload.entries

  if (type) entries = entries.filter((e) => e.type === type)
  if (date) entries = entries.filter((e) => e.date === date)

  return Response.json(
    { entries, entryCount: entries.length, syncedAt: payload.syncedAt },
    { headers: CORS_HEADERS }
  )
}

export async function POST(request: Request) {
  try {
    const body = await request.json()

    // Bulk sync — replace all entries
    if (body.entries) {
      const payload: JournalPayload = {
        entries: body.entries,
        syncedAt: body.syncedAt || new Date().toISOString(),
        entryCount: body.entries.length,
      }
      cachedPayload = payload
      await writeFile(JOURNAL_FILE, JSON.stringify(payload), 'utf-8')
      return Response.json(
        { ok: true, entryCount: payload.entryCount },
        { status: 200, headers: CORS_HEADERS }
      )
    }

    // Single entry — append or update by id
    const entry: JournalEntry = body
    const payload = await getPayload()
    const existing = payload.entries.findIndex((e) => e.id === entry.id)
    if (existing >= 0) {
      payload.entries[existing] = entry
    } else {
      payload.entries.push(entry)
    }
    payload.syncedAt = new Date().toISOString()
    payload.entryCount = payload.entries.length
    cachedPayload = payload
    await writeFile(JOURNAL_FILE, JSON.stringify(payload), 'utf-8')
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

async function getPayload(): Promise<JournalPayload> {
  if (cachedPayload) return cachedPayload
  try {
    const raw = await readFile(JOURNAL_FILE, 'utf-8')
    const payload: JournalPayload = JSON.parse(raw)
    cachedPayload = payload
    return payload
  } catch {
    return { ...EMPTY_PAYLOAD }
  }
}
