export const dynamic = "force-dynamic"

const FALLBACK_SYMBOLS = ["SPY", "QQQ", "NVDA", "TSLA", "META", "GOOGL", "AAPL", "MSFT", "AMZN"]

function parseSymbols(raw: string | undefined): string[] {
  const symbols = (raw ?? "")
    .split(",")
    .map((symbol) => symbol.trim().toUpperCase())
    .filter(Boolean)
  return symbols.length > 0 ? Array.from(new Set(symbols)) : FALLBACK_SYMBOLS
}

async function readDynamicSymbols(): Promise<string[]> {
  const base = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!base || !token) return []
  try {
    const resp = await fetch(`${base.replace(/\/$/, "")}/smembers/${encodeURIComponent("live:subscribed")}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    })
    if (!resp.ok) return []
    const payload = (await resp.json()) as { result?: unknown }
    if (!Array.isArray(payload.result)) return []
    return payload.result
      .map((member) => String(member).toUpperCase())
      .filter((member) => /^[A-Z][A-Z0-9.\-]{0,9}$/.test(member))
  } catch {
    return []
  }
}

export async function GET() {
  const baseSymbols = parseSymbols(process.env.LIVE_SYMBOLS)
  const dynamicSymbols = await readDynamicSymbols()
  const symbols = Array.from(new Set([...baseSymbols, ...dynamicSymbols]))
  return Response.json(
    {
      symbols,
      dataset: process.env.LIVE_DATASET ?? null,
      schema: process.env.LIVE_SCHEMA ?? null,
      source: "databento-live",
    },
    { headers: { "Cache-Control": "no-store" } },
  )
}
