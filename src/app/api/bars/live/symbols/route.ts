export const dynamic = "force-dynamic"

const FALLBACK_SYMBOLS = ["SPY", "QQQ", "NVDA", "TSLA", "META", "GOOGL", "AAPL", "MSFT", "AMZN"]

function parseSymbols(raw: string | undefined): string[] {
  const symbols = (raw ?? "")
    .split(",")
    .map((symbol) => symbol.trim().toUpperCase())
    .filter(Boolean)
  return symbols.length > 0 ? Array.from(new Set(symbols)) : FALLBACK_SYMBOLS
}

export async function GET() {
  return Response.json(
    {
      symbols: parseSymbols(process.env.LIVE_SYMBOLS),
      dataset: process.env.LIVE_DATASET ?? null,
      schema: process.env.LIVE_SCHEMA ?? null,
      source: "databento-live",
    },
    { headers: { "Cache-Control": "no-store" } },
  )
}
