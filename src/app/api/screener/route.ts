import { fetchSpikeScreener } from '@/lib/finviz'

export const dynamic = 'force-dynamic'

/**
 * GET /api/screener
 *
 * Returns the daily spike screener — strong-earnings stocks entering a
 * volume/price breakout — sourced from the Finviz Elite export API.
 *
 * The upstream Finviz fetch is cached for 30 minutes (see src/lib/finviz.ts),
 * so this route is cheap to hit repeatedly.
 */
export async function GET() {
  try {
    const result = await fetchSpikeScreener()
    return Response.json(result, {
      status: 200,
      headers: {
        'Cache-Control': 'public, s-maxage=1800, stale-while-revalidate=3600',
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'screener failed'
    // A missing token is a config problem (503); anything else is an
    // upstream failure (502).
    const status = message.includes('FINVIZ_AUTH_TOKEN') ? 503 : 502
    return Response.json(
      { error: message },
      { status, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}
