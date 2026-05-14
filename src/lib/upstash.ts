/**
 * Tiny Upstash Redis REST client. No SDK dependency — just `fetch`.
 * Used by /api/bars/live to read the live bar cache that the
 * scripts/live_bars_aggregator.py process writes to.
 *
 * Requires UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN to be
 * set in the runtime env (Vercel project settings + .env.local).
 */

interface UpstashResult<T> {
  result: T
  error?: string
}

function env(name: string): string | null {
  const v = process.env[name]
  return v && v.length > 0 ? v : null
}

export function isUpstashConfigured(): boolean {
  return env("UPSTASH_REDIS_REST_URL") !== null
    && env("UPSTASH_REDIS_REST_TOKEN") !== null
}

async function call<T>(...segments: string[]): Promise<T | null> {
  const base = env("UPSTASH_REDIS_REST_URL")
  const token = env("UPSTASH_REDIS_REST_TOKEN")
  if (!base || !token) return null
  const url = base.replace(/\/$/, "") + "/" + segments.map(encodeURIComponent).join("/")
  const resp = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  })
  if (!resp.ok) {
    console.error(`[upstash] ${segments[0]} -> HTTP ${resp.status}`)
    return null
  }
  const data = (await resp.json()) as UpstashResult<T>
  if (data.error) {
    console.error(`[upstash] ${segments[0]} -> error: ${data.error}`)
    return null
  }
  return data.result
}

/**
 * ZRANGEBYSCORE — fetch members in [min, max] inclusive. Returns the
 * raw string members (we serialize bars as JSON on the write side).
 */
export async function zrangebyscore(key: string, min: number, max: number): Promise<string[]> {
  const result = await call<string[]>("zrangebyscore", key, String(min), String(max))
  return result ?? []
}

/**
 * GET — fetch the value for `key`, or null if it doesn't exist.
 */
export async function get(key: string): Promise<string | null> {
  const result = await call<string | null>("get", key)
  return typeof result === "string" ? result : null
}

/**
 * SETEX — set `key` to `value` with a TTL in seconds. Used by /api/bars
 * to back-cache historical responses so subsequent edge-cache misses
 * don't re-hit Databento (which can be 3-15s for cold tickers).
 */
export async function setEx(key: string, value: string, ttlSeconds: number): Promise<void> {
  await call<string>("setex", key, String(Math.max(1, Math.floor(ttlSeconds))), value)
}
