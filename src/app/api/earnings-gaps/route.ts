import {
  fetchEarningsGapScreener,
  getDemoEarningsGapScreener,
  type EarningsGapDirection,
} from '@/lib/finviz'
import { fetchEarningsGapBook } from '@/lib/earnings-gap-book'

export const dynamic = 'force-dynamic'

const DIRECTIONS = new Set(['all', 'up', 'down'])

function parseDirection(value: string | null): 'all' | EarningsGapDirection {
  return value && DIRECTIONS.has(value) ? value as 'all' | EarningsGapDirection : 'all'
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const demo = searchParams.get('demo') === '1'
  const view = searchParams.get('view')
  const direction = parseDirection(searchParams.get('direction'))
  const includeWatchlist = searchParams.get('watchlist') !== '0'
  const minMovePctRaw = Number(searchParams.get('minMovePct') ?? 3)
  const minMovePct = Number.isFinite(minMovePctRaw) ? minMovePctRaw : 3
  const minGapPct = Number(searchParams.get('minGapPct') ?? 3)
  const lookbackRaw = Number(searchParams.get('lookback') ?? 35)
  const lookbackDays = Math.min(Math.max(Number.isFinite(lookbackRaw) ? Math.floor(lookbackRaw) : 35, 7), 90)
  const limitRaw = Number(searchParams.get('limit') ?? 100)
  const limit = Math.min(Math.max(Number.isFinite(limitRaw) ? Math.floor(limitRaw) : 100, 1), 250)

  try {
    if (view === 'book') {
      const book = await fetchEarningsGapBook({
        demo,
        lookbackDays,
        minGapPct: Number.isFinite(minGapPct) ? minGapPct : 3,
      })
      return Response.json(
        {
          ...book,
          request: {
            view,
            lookbackDays,
            minGapPct: book.minGapPct,
          },
        },
        {
          status: 200,
          headers: {
            'Cache-Control': demo
              ? 'no-store'
              : 'public, s-maxage=21600, stale-while-revalidate=43200',
          },
        },
      )
    }

    const payload = demo ? getDemoEarningsGapScreener() : await fetchEarningsGapScreener()
    const candidates = payload.candidates
      .filter((candidate) => direction === 'all' || candidate.direction === direction)
      .filter((candidate) => includeWatchlist || candidate.bucket === 'confirmed_mover')
      .filter((candidate) => {
        if (candidate.bucket === 'after_close_watch') return includeWatchlist
        return Math.abs(candidate.movePct ?? 0) >= minMovePct
      })
      .slice(0, limit)

    return Response.json(
      {
        ...payload,
        candidates,
        request: {
          direction,
          includeWatchlist,
          minMovePct,
          limit,
        },
      },
      {
        status: 200,
        headers: {
          'Cache-Control': demo
            ? 'no-store'
            : 'public, s-maxage=1800, stale-while-revalidate=3600',
        },
      },
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : 'earnings gap screener failed'
    const status = message.includes('FINVIZ_AUTH_TOKEN') ? 503 : 502
    return Response.json(
      { error: message },
      { status, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}
