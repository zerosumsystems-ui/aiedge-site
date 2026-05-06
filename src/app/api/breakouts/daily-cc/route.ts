import { getDailyCcSnapshot } from '@/lib/weekly-breakouts'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const payload = await getDailyCcSnapshot(searchParams.get('date'))
  return Response.json(payload, { headers: { 'Cache-Control': 'no-store' } })
}
