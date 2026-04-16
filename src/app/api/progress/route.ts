import { readFileSync, existsSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import type {
  ProgressPayload,
  ScoreboardEntry,
  Lesson,
  CategoryScore,
  CategoryCount,
} from '@/lib/types'
import { requireSyncSecret } from '@/lib/auth/sync-secret'
import { requireSession } from '@/lib/auth/require-session'
import { getSnapshot, setSnapshot } from '@/lib/snapshots'

export const dynamic = 'force-dynamic'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

const EMPTY_PAYLOAD: ProgressPayload = {
  scoreboard: [],
  lessons: [],
  figuresCompleted: 0,
  figuresTotal: 687,
  nextQueue: [],
  categoryAccuracy: {
    phase: { agree: 0, partial: 0, miss: 0 },
    alwaysIn: { agree: 0, partial: 0, miss: 0 },
    strength: { agree: 0, partial: 0, miss: 0 },
    setup: { agree: 0, partial: 0, miss: 0 },
    decision: { agree: 0, partial: 0, miss: 0 },
  },
  syncedAt: '',
}

export async function GET(request: Request) {
  const unauth = await requireSession(request)
  if (unauth) return unauth

  const payload = await getSnapshot<ProgressPayload>('progress', EMPTY_PAYLOAD)

  // Dev convenience: if nothing has been synced yet, scrape from local
  // self-eval directory so the /progress page has something to render.
  if (
    process.env.NODE_ENV !== 'production' &&
    payload.syncedAt === '' &&
    payload.scoreboard.length === 0
  ) {
    const fromDisk = loadFromFilesystem()
    if (fromDisk) return Response.json(fromDisk, { headers: CORS_HEADERS })
  }

  return Response.json(payload, { headers: CORS_HEADERS })
}

export async function POST(request: Request) {
  const unauth = requireSyncSecret(request)
  if (unauth) return unauth
  try {
    const payload: ProgressPayload = await request.json()
    await setSnapshot('progress', payload)
    return Response.json({ ok: true }, { status: 200, headers: CORS_HEADERS })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return Response.json({ error: message }, { status: 500, headers: CORS_HEADERS })
  }
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS })
}

// ── Local dev filesystem fallback ────────────────────────────────────────────

function loadFromFilesystem(): ProgressPayload | null {
  const base = join(homedir(), 'code', 'aiedge', 'self-eval')
  if (!existsSync(base)) return null

  const scoreboard = loadScoreboard(join(base, 'scoreboard.csv'))
  const lessons = loadLessons(join(base, 'lessons.md'))
  const figuresCompleted = countLines(join(base, 'done_figures.txt'))
  const figuresTotal = loadTotalFromCorpusStats(join(base, 'corpus_stats.json'))
  const nextQueue = loadQueue(join(base, 'queue.txt'))
  const categoryAccuracy = aggregateCategoryAccuracy(scoreboard)

  return {
    scoreboard,
    lessons,
    figuresCompleted,
    figuresTotal,
    nextQueue,
    categoryAccuracy,
    syncedAt: '',
  }
}

function loadScoreboard(path: string): ScoreboardEntry[] {
  if (!existsSync(path)) return []
  const text = readFileSync(path, 'utf-8')
  const lines = text.trim().split('\n')
  if (lines.length < 2) return []
  const entries: ScoreboardEntry[] = []
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(',')
    if (parts.length < 9) continue
    entries.push({
      date: parts[0],
      figureNumber: parts[1],
      book: parts[2],
      phase: parts[3] as CategoryScore,
      alwaysIn: parts[4] as CategoryScore,
      strength: parts[5] as CategoryScore,
      setup: parts[6] as CategoryScore,
      decision: parts[7] as CategoryScore,
      totalAgree: parseInt(parts[8], 10) || 0,
    })
  }
  return entries
}

function loadLessons(path: string): Lesson[] {
  if (!existsSync(path)) return []
  const text = readFileSync(path, 'utf-8')
  const lessons: Lesson[] = []
  // Split on lesson headings: ## L<n> — <title>
  const blocks = text.split(/\n(?=## L\d+)/m)
  for (const block of blocks) {
    const headerMatch = block.match(/^## (L\d+)\s*[—–-]\s*(.+?)\s*\n/m)
    if (!headerMatch) continue
    const id = headerMatch[1]
    const title = headerMatch[2].trim()

    const fromMatch = block.match(/\*\*From:\*\*\s*(.+?)(?:\n|$)/)
    const fromRaw = fromMatch ? fromMatch[1].trim() : ''
    const dateMatch = fromRaw.match(/(\d{4}-\d{2}-\d{2})/)
    const fromDate = dateMatch ? dateMatch[1] : ''
    const fromFigure = fromRaw.replace(/\s*—\s*\d{4}-\d{2}-\d{2}\s*$/, '').trim()

    const patternMatch = block.match(/\*\*Pattern I missed:\*\*\s*([\s\S]+?)(?:\n\*\*|$)/)
    const patternMissed = patternMatch ? patternMatch[1].trim() : ''

    const ruleMatch = block.match(/\*\*Future rule:\*\*\s*([\s\S]+?)(?:\n\n|\n##|$)/)
    const futureRule = ruleMatch ? ruleMatch[1].trim() : ''

    lessons.push({ id, title, fromFigure, fromDate, patternMissed, futureRule })
  }
  return lessons
}

function countLines(path: string): number {
  if (!existsSync(path)) return 0
  const text = readFileSync(path, 'utf-8').trim()
  if (!text) return 0
  return text.split('\n').filter((l) => l.trim().length > 0).length
}

function loadTotalFromCorpusStats(path: string): number {
  if (!existsSync(path)) return 687
  try {
    const data = JSON.parse(readFileSync(path, 'utf-8'))
    return typeof data.total_records === 'number' ? data.total_records : 687
  } catch {
    return 687
  }
}

function loadQueue(path: string): string[] {
  if (!existsSync(path)) return []
  const text = readFileSync(path, 'utf-8')
  return text
    .trim()
    .split('\n')
    .slice(0, 10)
    .map((line) => {
      // Queue lines are tab-separated: hash<TAB>figure_number<TAB>book<TAB>path
      const parts = line.split('\t')
      if (parts.length >= 3) {
        return `Fig ${parts[1]} — ${parts[2]}`
      }
      return line
    })
}

function aggregateCategoryAccuracy(entries: ScoreboardEntry[]): {
  phase: CategoryCount
  alwaysIn: CategoryCount
  strength: CategoryCount
  setup: CategoryCount
  decision: CategoryCount
} {
  const empty = (): CategoryCount => ({ agree: 0, partial: 0, miss: 0 })
  const acc = {
    phase: empty(),
    alwaysIn: empty(),
    strength: empty(),
    setup: empty(),
    decision: empty(),
  }
  const increment = (bucket: CategoryCount, score: CategoryScore) => {
    if (score === 'AGREE') bucket.agree += 1
    else if (score === 'PARTIAL') bucket.partial += 1
    else if (score === 'MISS') bucket.miss += 1
  }
  for (const e of entries) {
    increment(acc.phase, e.phase)
    increment(acc.alwaysIn, e.alwaysIn)
    increment(acc.strength, e.strength)
    increment(acc.setup, e.setup)
    increment(acc.decision, e.decision)
  }
  return acc
}
