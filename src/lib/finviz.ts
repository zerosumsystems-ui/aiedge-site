/**
 * Finviz Elite export client.
 *
 * Powers the daily spike screener: stocks with strong earnings growth that
 * are entering a price/volume "spike" — enormous relative volume plus a
 * breakout near their 52-week high.
 *
 * The Elite export endpoint returns CSV. Auth is a per-account token passed
 * as `auth=`; it lives in FINVIZ_AUTH_TOKEN (server-only, never shipped to
 * the client). See https://finviz.com/api_explanation.
 */

const EXPORT_ENDPOINT = 'https://elite.finviz.com/export.ashx'

// Cache the Finviz response for 30 minutes — the screen is a daily/intraday
// study, not a tick feed, and Elite export calls are rate-limited.
const REVALIDATE_SECONDS = 1800

/**
 * The "spike phase" screen. Each entry is a Finviz filter code; retune the
 * screen by editing this list. Labels are shown on the page so the criteria
 * stay visible next to the results.
 */
export const SPIKE_FILTERS: { code: string; label: string }[] = [
  { code: 'fa_epsyoy_o20', label: 'EPS growth this year > 20%' },
  { code: 'fa_epsqoq_o20', label: 'EPS growth qtr-over-qtr > 20%' },
  { code: 'sh_relvol_o3', label: 'Relative volume > 3x (enormous volume)' },
  { code: 'sh_avgvol_o500', label: 'Average volume > 500K (liquidity floor)' },
  { code: 'sh_price_o5', label: 'Price > $5 (skip penny noise)' },
  { code: 'ta_highlow52w_b0to10h', label: 'Within 10% of 52-week high (breakout)' },
  { code: 'ta_sma50_pa', label: 'Price above 50-day SMA (uptrend)' },
]

export type ScreenerRow = Record<string, string>

export type SpikeScreenerResult = {
  rows: ScreenerRow[]
  columns: string[]
  fetchedAt: string
  filters: { code: string; label: string }[]
}

/**
 * Parse RFC-4180-ish CSV: handles quoted fields, embedded commas/quotes,
 * doubled quotes, and CRLF. Finviz company names routinely contain commas,
 * so a naive split would corrupt rows.
 */
function parseCsv(text: string): { columns: string[]; rows: ScreenerRow[] } {
  const records: string[][] = []
  let field = ''
  let record: string[] = []
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      record.push(field)
      field = ''
    } else if (ch === '\n') {
      record.push(field)
      records.push(record)
      field = ''
      record = []
    } else if (ch !== '\r') {
      field += ch
    }
  }
  if (field.length > 0 || record.length > 0) {
    record.push(field)
    records.push(record)
  }

  if (records.length === 0) return { columns: [], rows: [] }

  const columns = records[0].map((c) => c.trim())
  const rows = records
    .slice(1)
    .filter((r) => r.some((v) => v.trim() !== ''))
    .map((r) => {
      const obj: ScreenerRow = {}
      columns.forEach((col, idx) => {
        obj[col] = (r[idx] ?? '').trim()
      })
      return obj
    })
  return { columns, rows }
}

/**
 * Fetch the spike screener from Finviz Elite. Throws when FINVIZ_AUTH_TOKEN
 * is missing or when Finviz rejects the request (an invalid token returns an
 * HTML login page rather than CSV).
 */
export async function fetchSpikeScreener(): Promise<SpikeScreenerResult> {
  const token = process.env.FINVIZ_AUTH_TOKEN
  if (!token) {
    throw new Error('FINVIZ_AUTH_TOKEN is not set')
  }

  // v=152 is the custom view; c= requests an explicit column set. We ask for
  // a wide range and key everything off the CSV header row, so the page is
  // resilient to Finviz renumbering columns.
  const columns = Array.from({ length: 69 }, (_, i) => i + 1).join(',')
  const filters = SPIKE_FILTERS.map((f) => f.code).join(',')
  const url =
    `${EXPORT_ENDPOINT}?v=152&c=${columns}&f=${filters}` +
    `&o=-relativevolume&auth=${encodeURIComponent(token)}`

  const res = await fetch(url, {
    next: { revalidate: REVALIDATE_SECONDS },
    headers: { 'User-Agent': 'aiedge-screener' },
  })
  if (!res.ok) {
    throw new Error(`Finviz export failed: HTTP ${res.status}`)
  }

  const text = await res.text()
  if (text.trimStart().startsWith('<')) {
    // Finviz serves an HTML login/error page instead of CSV on a bad token.
    throw new Error('Finviz returned HTML — check FINVIZ_AUTH_TOKEN')
  }

  const { columns: cols, rows } = parseCsv(text)
  return {
    rows,
    columns: cols,
    fetchedAt: new Date().toISOString(),
    filters: SPIKE_FILTERS,
  }
}
