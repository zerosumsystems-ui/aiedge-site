import { getSnapshot, setSnapshot } from '@/lib/snapshots'

export const dynamic = 'force-dynamic'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

const DECK_ID = 'aapl-opening-v1'
const SNAPSHOT_KEY = 'training-aapl-opening-v1'

const VALID_LABELS = new Set([
  'trend_open_long',
  'long_reversal',
  'no_trade',
  'short_reversal',
  'trend_open_short',
])

type TrainingLabel = {
  label: string
  note: string
  labeledAt: string
}

type TrainingReview = TrainingLabel & {
  confidence: 'sure' | 'unsure'
  firstPassLabel: string
}

type TrainingLabelsPayload = {
  deckId: string
  labels: Record<string, TrainingLabel>
  reviews: Record<string, TrainingReview>
  updatedAt: string
}

const EMPTY_PAYLOAD: TrainingLabelsPayload = {
  deckId: DECK_ID,
  labels: {},
  reviews: {},
  updatedAt: '',
}

function badRequest(message: string) {
  return Response.json({ error: message }, { status: 400, headers: CORS_HEADERS })
}

function assertDeck(searchDeckId: string | null) {
  return !searchDeckId || searchDeckId === DECK_ID
}

function normalizeText(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function normalizeConfidence(value: unknown): 'sure' | 'unsure' {
  return value === 'unsure' ? 'unsure' : 'sure'
}

async function readPayload() {
  const payload = await getSnapshot<TrainingLabelsPayload>(SNAPSHOT_KEY, EMPTY_PAYLOAD)
  return {
    deckId: DECK_ID,
    labels: payload.labels ?? {},
    reviews: payload.reviews ?? {},
    updatedAt: payload.updatedAt ?? '',
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    if (!assertDeck(searchParams.get('deckId'))) return badRequest('Unknown training deck')

    const payload = await readPayload()
    return Response.json(payload, { headers: CORS_HEADERS })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return Response.json({ error: message }, { status: 500, headers: CORS_HEADERS })
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>
    const deckId = normalizeText(body.deckId)
    const exampleId = normalizeText(body.exampleId)
    const label = normalizeText(body.label)
    const mode = normalizeText(body.mode)
    const isReview = mode === 'review'

    if (deckId !== DECK_ID) return badRequest('Unknown training deck')
    if (!exampleId) return badRequest('Missing exampleId')
    if (label && !VALID_LABELS.has(label)) return badRequest('Invalid label')

    const payload = await readPayload()
    const now = new Date().toISOString()

    if (isReview) {
      if (!label) {
        delete payload.reviews[exampleId]
      } else {
        payload.reviews[exampleId] = {
          label,
          note: normalizeText(body.note),
          confidence: normalizeConfidence(body.confidence),
          firstPassLabel: normalizeText(body.firstPassLabel),
          labeledAt: normalizeText(body.labeledAt) || now,
        }
      }
    } else if (!label) {
      delete payload.labels[exampleId]
    } else {
      payload.labels[exampleId] = {
        label,
        note: normalizeText(body.note),
        labeledAt: normalizeText(body.labeledAt) || now,
      }
    }

    payload.updatedAt = now
    await setSnapshot(SNAPSHOT_KEY, payload)

    return Response.json({ ok: true, payload }, { status: 200, headers: CORS_HEADERS })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return Response.json({ error: message }, { status: 500, headers: CORS_HEADERS })
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const deckId = searchParams.get('deckId')
    const exampleId = searchParams.get('exampleId')
    const mode = searchParams.get('mode')
    const target = mode === 'review' ? 'reviews' : 'labels'

    if (!assertDeck(deckId)) return badRequest('Unknown training deck')

    const payload = await readPayload()
    if (exampleId) {
      delete payload[target][exampleId]
    } else {
      payload[target] = {}
    }

    payload.updatedAt = new Date().toISOString()
    await setSnapshot(SNAPSHOT_KEY, payload)

    return Response.json({ ok: true, payload }, { status: 200, headers: CORS_HEADERS })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return Response.json({ error: message }, { status: 500, headers: CORS_HEADERS })
  }
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS })
}
