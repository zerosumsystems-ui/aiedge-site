import { NextResponse } from "next/server"

// Read-only aggregation endpoint for /status.html. Fans out to a handful
// of public health probes server-side so the static dashboard can render
// with one fetch and no client-side CORS pain.
//
// Cached for 30s at the edge — keeps GitHub's unauthenticated rate limit
// comfortable (60 req/hr per IP) and avoids hammering downstream services.

export const dynamic = "force-dynamic"
export const revalidate = 30

type Probe = {
  ok: boolean
  status?: number
  latencyMs?: number
  error?: string
}

async function probe(
  url: string,
  init?: RequestInit & { timeoutMs?: number }
): Promise<Probe> {
  const t0 = Date.now()
  const timeoutMs = init?.timeoutMs ?? 8000
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      ...init,
      signal: controller.signal,
      cache: "no-store",
    })
    return { ok: res.ok, status: res.status, latencyMs: Date.now() - t0 }
  } catch (err) {
    return {
      ok: false,
      latencyMs: Date.now() - t0,
      error: err instanceof Error ? err.message : String(err),
    }
  } finally {
    clearTimeout(timer)
  }
}

type GhPr = {
  number: number
  title: string
  draft: boolean
  updated_at: string
  html_url: string
}

async function fetchOpenPrs(): Promise<{
  count: number
  items: GhPr[]
  error?: string
}> {
  try {
    const res = await fetch(
      "https://api.github.com/repos/zerosumsystems-ui/aiedge-site/pulls?state=open&sort=updated&direction=desc&per_page=5",
      { headers: { Accept: "application/vnd.github+json" }, cache: "no-store" }
    )
    if (!res.ok) return { count: 0, items: [], error: `HTTP ${res.status}` }
    const all = (await res.json()) as GhPr[]
    return {
      count: all.length,
      items: all.map((p) => ({
        number: p.number,
        title: p.title,
        draft: p.draft,
        updated_at: p.updated_at,
        html_url: p.html_url,
      })),
    }
  } catch (err) {
    return {
      count: 0,
      items: [],
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

export async function GET() {
  const [site, chart, diagnostics, flyHealth, prs] = await Promise.all([
    probe("https://www.aiedge.trade/", { method: "HEAD" }),
    probe("https://www.aiedge.trade/chart", { method: "HEAD" }),
    fetch("https://www.aiedge.trade/api/live-bars/diagnostics", {
      cache: "no-store",
    })
      .then((r) => r.json())
      .catch((err) => ({ error: String(err) })),
    probe("https://aiedge-live-bars.fly.dev/health"),
    fetchOpenPrs(),
  ])

  return NextResponse.json(
    {
      fetchedAt: new Date().toISOString(),
      site: { root: site, chart },
      flyHealth,
      diagnostics,
      github: prs,
    },
    {
      headers: {
        "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120",
      },
    }
  )
}
