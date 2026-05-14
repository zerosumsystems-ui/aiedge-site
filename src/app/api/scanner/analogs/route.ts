import { promises as fs } from 'node:fs'
import path from 'node:path'

export const dynamic = 'force-dynamic'

/**
 * GET /api/scanner/analogs?date=YYYY-MM-DD&ticker=AAPL[&limit=5]
 *
 * Reads the pre-computed DTW chart-shape matches from
 * public/analogs/matches.json and returns the nearest neighbors for
 * `${date}_${ticker}` (the same slug convention the History → Analogs
 * tab uses).
 *
 * Returns `{ slug, matches: [{rank, slug, date, ticker, dtw, flipped}, ...] }`.
 * If the slug isn't in the corpus, `matches: []` and `inCorpus: false` —
 * fresh candidates from /scanner that the corpus hasn't ingested yet hit
 * this case.
 */

type Match = {
  rank: number
  slug: string
  date: string
  ticker: string
  dtw: number
  flipped: boolean
}

type MatchesFile = {
  k: number
  n_entries: number
  matches: Record<string, Match[]>
}

// Cache the parsed JSON in module scope so we don't re-read + parse 5MB
// on every request within the same Vercel function instance.
let cached: MatchesFile | null = null
let cachedAt = 0
const CACHE_TTL_MS = 10 * 60_000

async function loadMatches(): Promise<MatchesFile | null> {
  const now = Date.now()
  if (cached && now - cachedAt < CACHE_TTL_MS) return cached
  try {
    const p = path.join(process.cwd(), 'public', 'analogs', 'matches.json')
    const buf = await fs.readFile(p, 'utf-8')
    cached = JSON.parse(buf) as MatchesFile
    cachedAt = now
    return cached
  } catch (err) {
    console.error('[analogs] failed to load matches.json:', err)
    return null
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const date = searchParams.get('date')
  const ticker = (searchParams.get('ticker') ?? '').toUpperCase()
  const limit = Math.min(Math.max(Number(searchParams.get('limit') ?? 5) || 5, 1), 10)

  if (!date || !ticker) {
    return Response.json(
      { error: 'date and ticker are required' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    )
  }

  const file = await loadMatches()
  if (!file) {
    return Response.json(
      { error: 'analogs corpus unavailable' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    )
  }

  const slug = `${date}_${ticker}`
  const found = file.matches[slug]
  const matches = (found ?? []).slice(0, limit)
  return Response.json(
    { slug, inCorpus: !!found, matches },
    {
      status: 200,
      headers: {
        // Corpus updates daily after EOD; an hour of edge cache is generous.
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
      },
    },
  )
}
