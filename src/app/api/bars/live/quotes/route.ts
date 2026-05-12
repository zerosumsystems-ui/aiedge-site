import type { Bar } from "@/lib/types"
import { isUpstashConfigured, zrangebyscore } from "@/lib/upstash"

export const dynamic = "force-dynamic"

interface LiveQuote {
  symbol: string
  last: number | null
  changePct: number | null
  volume: number
  stale: boolean
}

const MAX_SYMBOLS = 50

function parseSymbols(raw: string | null): string[] {
  const symbols = (raw ?? "")
    .split(",")
    .map((symbol) => symbol.trim().toUpperCase())
    .filter(Boolean)
  return Array.from(new Set(symbols)).slice(0, MAX_SYMBOLS)
}

function parseBar(member: string): Bar | null {
  try {
    const parsed = JSON.parse(member) as Partial<Bar>
    if (
      typeof parsed.t !== "number" ||
      typeof parsed.o !== "number" ||
      typeof parsed.h !== "number" ||
      typeof parsed.l !== "number" ||
      typeof parsed.c !== "number"
    ) {
      return null
    }
    return {
      t: parsed.t,
      o: parsed.o,
      h: parsed.h,
      l: parsed.l,
      c: parsed.c,
      v: typeof parsed.v === "number" ? parsed.v : undefined,
    }
  } catch {
    return null
  }
}

function quoteFromBars(symbol: string, bars: Bar[], now: number): LiveQuote {
  const first = bars[0]
  const latest = bars.at(-1)
  const volume = bars.reduce((sum, bar) => sum + (bar.v ?? 0), 0)
  return {
    symbol,
    last: latest?.c ?? null,
    changePct: first && latest && first.o !== 0 ? ((latest.c - first.o) / first.o) * 100 : null,
    volume,
    stale: latest ? now - latest.t > 15 * 60 : true,
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const symbols = parseSymbols(searchParams.get("symbols"))
  const minutes = Math.min(Math.max(Number(searchParams.get("minutes") ?? 360) || 360, 1), 360)

  if (symbols.length === 0) {
    return Response.json(
      { error: "symbols is required" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    )
  }

  const now = Math.floor(Date.now() / 1000)
  const from = now - minutes * 60

  if (!isUpstashConfigured()) {
    return Response.json(
      {
        quotes: symbols.map((symbol) => ({
          symbol,
          last: null,
          changePct: null,
          volume: 0,
          stale: true,
        })),
        from: new Date(from * 1000).toISOString(),
        to: new Date(now * 1000).toISOString(),
        source: "databento-live",
      },
      { headers: { "Cache-Control": "no-store" } },
    )
  }

  const quotes = await Promise.all(
    symbols.map(async (symbol) => {
      const members = await zrangebyscore(`bars:1m:${symbol}`, from, now)
      const bars = members
        .map(parseBar)
        .filter((bar): bar is Bar => bar !== null)
        .sort((a, b) => a.t - b.t)
      return quoteFromBars(symbol, bars, now)
    }),
  )

  return Response.json(
    {
      quotes,
      from: new Date(from * 1000).toISOString(),
      to: new Date(now * 1000).toISOString(),
      source: "databento-live",
    },
    { headers: { "Cache-Control": "no-store" } },
  )
}
