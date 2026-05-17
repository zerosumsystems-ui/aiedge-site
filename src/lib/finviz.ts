/**
 * Finviz Elite export client.
 *
 * Powers two scanner surfaces:
 * - daily spike screener: strong earnings growth plus price/volume spike
 * - earnings gap radar: earnings-before movers and earnings-after watchlist
 *
 * The Elite export endpoint returns CSV. Auth is a per-account token passed
 * as `auth=`; it lives in FINVIZ_AUTH_TOKEN (server-only, never shipped to
 * the client). See https://finviz.com/api_explanation.
 */

const EXPORT_ENDPOINT = 'https://elite.finviz.com/export.ashx'

// Cache the Finviz response for 30 minutes. These screens are daily/intraday
// studies, not tick feeds, and Elite export calls are rate-limited.
const REVALIDATE_SECONDS = 1800
const FINVIZ_COLUMNS = Array.from({ length: 69 }, (_, i) => i + 1).join(',')

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

export const EARNINGS_GAP_FILTERS: { code: string; label: string }[] = [
  { code: 'sh_price_o5', label: 'Price > $5' },
  { code: 'sh_avgvol_o500', label: 'Average volume > 500K' },
]

const EARNINGS_SIGNALS = [
  { code: 'n_earningsbefore', label: 'Earnings Before', timing: 'before_open' as const },
  { code: 'n_earningsafter', label: 'Earnings After', timing: 'after_close' as const },
]

export type ScreenerRow = Record<string, string>

export type SpikeScreenerResult = {
  rows: ScreenerRow[]
  columns: string[]
  fetchedAt: string
  filters: { code: string; label: string }[]
}

export type EarningsGapTiming = 'before_open' | 'after_close'
export type EarningsGapDirection = 'up' | 'down' | 'flat'
export type EarningsGapBucket = 'confirmed_mover' | 'after_close_watch'

export interface EarningsGapCandidate {
  ticker: string
  company: string
  sector: string
  industry: string
  timing: EarningsGapTiming
  signalLabel: string
  bucket: EarningsGapBucket
  direction: EarningsGapDirection
  gapPct: number | null
  changePct: number | null
  movePct: number | null
  moveSource: 'gap' | 'change' | 'none'
  changeFromOpenPct: number | null
  relativeVolume: number | null
  volume: number | null
  averageVolume: number | null
  price: number | null
  marketCap: string
  earningsDate: string
  score: number
  reasons: string[]
  chartHref: string
  source: 'finviz'
}

export interface EarningsGapScreenerResult {
  candidates: EarningsGapCandidate[]
  fetchedAt: string
  filters: { code: string; label: string }[]
  signals: { code: string; label: string; timing: EarningsGapTiming }[]
  source: 'finviz'
  sourceStatus: 'live' | 'demo'
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

async function fetchFinvizExport({
  filters = [],
  signal,
  order,
}: {
  filters?: string[]
  signal?: string
  order?: string
}): Promise<{ columns: string[]; rows: ScreenerRow[] }> {
  const token = process.env.FINVIZ_AUTH_TOKEN
  if (!token) {
    throw new Error('FINVIZ_AUTH_TOKEN is not set')
  }

  const params = new URLSearchParams({
    v: '152',
    c: FINVIZ_COLUMNS,
    auth: token,
  })
  if (filters.length > 0) params.set('f', filters.join(','))
  if (signal) params.set('s', signal)
  if (order) params.set('o', order)

  const res = await fetch(`${EXPORT_ENDPOINT}?${params}`, {
    next: { revalidate: REVALIDATE_SECONDS },
    headers: { 'User-Agent': 'aiedge-screener' },
  })
  if (!res.ok) {
    throw new Error(`Finviz export failed: HTTP ${res.status}`)
  }

  const text = await res.text()
  if (text.trimStart().startsWith('<')) {
    // Finviz serves an HTML login/error page instead of CSV on a bad token.
    throw new Error('Finviz returned HTML - check FINVIZ_AUTH_TOKEN')
  }

  return parseCsv(text)
}

function pick(row: ScreenerRow, names: string[]): string {
  for (const name of names) {
    const value = row[name]
    if (value != null && value.trim() !== '') return value.trim()
  }
  return ''
}

function parsePercent(value: string): number | null {
  const cleaned = value.replace('%', '').replace(',', '').trim()
  if (!cleaned || cleaned === '-') return null
  const parsed = Number(cleaned)
  return Number.isFinite(parsed) ? parsed : null
}

function parseNumber(value: string): number | null {
  const cleaned = value.replace(/[$,%]/g, '').replace(/,/g, '').trim()
  if (!cleaned || cleaned === '-') return null
  const suffix = cleaned.at(-1)?.toUpperCase()
  const multiplier =
    suffix === 'K' ? 1_000 :
    suffix === 'M' ? 1_000_000 :
    suffix === 'B' ? 1_000_000_000 :
    1
  const numberText = multiplier === 1 ? cleaned : cleaned.slice(0, -1)
  const parsed = Number(numberText)
  return Number.isFinite(parsed) ? parsed * multiplier : null
}

function formatPct(value: number): string {
  const sign = value > 0 ? '+' : ''
  return `${sign}${value.toFixed(1)}%`
}

function formatRelVol(value: number): string {
  return `${value.toFixed(value >= 10 ? 0 : 1)}x rel vol`
}

function chooseMove(gapPct: number | null, changePct: number | null): {
  movePct: number | null
  moveSource: EarningsGapCandidate['moveSource']
} {
  if (gapPct != null && Math.abs(gapPct) >= 0.1) {
    return { movePct: gapPct, moveSource: 'gap' }
  }
  if (changePct != null && Math.abs(changePct) >= 0.1) {
    return { movePct: changePct, moveSource: 'change' }
  }
  return { movePct: null, moveSource: 'none' }
}

function scoreEarningsGapCandidate({
  timing,
  movePct,
  relativeVolume,
  volume,
}: {
  timing: EarningsGapTiming
  movePct: number | null
  relativeVolume: number | null
  volume: number | null
}): number {
  const moveScore = Math.min(Math.abs(movePct ?? 0) * 4, 52)
  const relVolScore = Math.min((relativeVolume ?? 0) * 8, 28)
  const volumeScore = volume ? Math.min(Math.max(Math.log10(volume) - 5, 0) * 5, 12) : 0
  const timingScore = timing === 'before_open' ? 8 : 2
  return Math.round((moveScore + relVolScore + volumeScore + timingScore) * 10) / 10
}

function buildEarningsGapCandidate(
  row: ScreenerRow,
  signal: (typeof EARNINGS_SIGNALS)[number],
): EarningsGapCandidate | null {
  const ticker = pick(row, ['Ticker'])
  if (!ticker) return null

  const gapPct = parsePercent(pick(row, ['Gap']))
  const changePct = parsePercent(pick(row, ['Change']))
  const changeFromOpenPct = parsePercent(pick(row, ['Change from Open', 'Change From Open']))
  const relativeVolume = parseNumber(pick(row, ['Relative Volume', 'Rel Volume']))
  const volume = parseNumber(pick(row, ['Volume']))
  const averageVolume = parseNumber(pick(row, ['Average Volume', 'Avg Volume']))
  const price = parseNumber(pick(row, ['Price']))
  const { movePct, moveSource } = chooseMove(gapPct, changePct)
  const direction: EarningsGapDirection =
    movePct == null ? 'flat' : movePct > 0 ? 'up' : 'down'
  const bucket: EarningsGapBucket =
    signal.timing === 'after_close' ? 'after_close_watch' : 'confirmed_mover'
  const score = scoreEarningsGapCandidate({
    timing: signal.timing,
    movePct,
    relativeVolume,
    volume,
  })

  const reasons: string[] = [signal.label]
  if (movePct != null) reasons.push(`${formatPct(movePct)} ${moveSource}`)
  if (relativeVolume != null) reasons.push(formatRelVol(relativeVolume))
  if (volume != null && volume >= 1_000_000) reasons.push('1M+ volume')
  if (price != null && price >= 5) reasons.push('liquid price band')

  return {
    ticker: ticker.toUpperCase(),
    company: pick(row, ['Company']),
    sector: pick(row, ['Sector']),
    industry: pick(row, ['Industry']),
    timing: signal.timing,
    signalLabel: signal.label,
    bucket,
    direction,
    gapPct,
    changePct,
    movePct,
    moveSource,
    changeFromOpenPct,
    relativeVolume,
    volume,
    averageVolume,
    price,
    marketCap: pick(row, ['Market Cap']),
    earningsDate: pick(row, ['Earnings Date', 'Earnings']),
    score,
    reasons,
    chartHref: `/chart?symbol=${encodeURIComponent(ticker.toUpperCase())}`,
    source: 'finviz',
  }
}

function sortEarningsGapCandidates(
  a: EarningsGapCandidate,
  b: EarningsGapCandidate,
): number {
  if (a.bucket !== b.bucket) {
    return a.bucket === 'confirmed_mover' ? -1 : 1
  }
  return b.score - a.score
}

/**
 * Fetch the spike screener from Finviz Elite. Throws when FINVIZ_AUTH_TOKEN
 * is missing or when Finviz rejects the request.
 */
export async function fetchSpikeScreener(): Promise<SpikeScreenerResult> {
  const { columns: cols, rows } = await fetchFinvizExport({
    filters: SPIKE_FILTERS.map((f) => f.code),
    order: '-relativevolume',
  })
  return {
    rows,
    columns: cols,
    fetchedAt: new Date().toISOString(),
    filters: SPIKE_FILTERS,
  }
}

export async function fetchEarningsGapScreener(): Promise<EarningsGapScreenerResult> {
  const filters = EARNINGS_GAP_FILTERS.map((f) => f.code)
  const results = await Promise.all(
    EARNINGS_SIGNALS.map(async (signal) => {
      const { rows } = await fetchFinvizExport({
        signal: signal.code,
        filters,
        order: signal.timing === 'before_open' ? '-change' : '-marketcap',
      })
      return rows
        .map((row) => buildEarningsGapCandidate(row, signal))
        .filter((candidate): candidate is EarningsGapCandidate => candidate != null)
    }),
  )

  return {
    candidates: results.flat().sort(sortEarningsGapCandidates),
    fetchedAt: new Date().toISOString(),
    filters: EARNINGS_GAP_FILTERS,
    signals: EARNINGS_SIGNALS,
    source: 'finviz',
    sourceStatus: 'live',
  }
}

export function getDemoEarningsGapScreener(): EarningsGapScreenerResult {
  const candidates: EarningsGapCandidate[] = [
    {
      ticker: 'CRM',
      company: 'Salesforce, Inc.',
      sector: 'Technology',
      industry: 'Software - Application',
      timing: 'before_open',
      signalLabel: 'Earnings Before',
      bucket: 'confirmed_mover',
      direction: 'up',
      gapPct: 8.4,
      changePct: 9.1,
      movePct: 8.4,
      moveSource: 'gap',
      changeFromOpenPct: 0.6,
      relativeVolume: 3.8,
      volume: 18_400_000,
      averageVolume: 4_900_000,
      price: 312.42,
      marketCap: '302.1B',
      earningsDate: 'May 17/b',
      score: 86.1,
      reasons: ['Earnings Before', '+8.4% gap', '3.8x rel vol', '1M+ volume', 'liquid price band'],
      chartHref: '/chart?symbol=CRM',
      source: 'finviz',
    },
    {
      ticker: 'SNOW',
      company: 'Snowflake Inc.',
      sector: 'Technology',
      industry: 'Software - Application',
      timing: 'before_open',
      signalLabel: 'Earnings Before',
      bucket: 'confirmed_mover',
      direction: 'down',
      gapPct: -12.7,
      changePct: -11.9,
      movePct: -12.7,
      moveSource: 'gap',
      changeFromOpenPct: 0.9,
      relativeVolume: 5.4,
      volume: 26_100_000,
      averageVolume: 6_200_000,
      price: 171.88,
      marketCap: '57.6B',
      earningsDate: 'May 17/b',
      score: 100,
      reasons: ['Earnings Before', '-12.7% gap', '5.4x rel vol', '1M+ volume', 'liquid price band'],
      chartHref: '/chart?symbol=SNOW',
      source: 'finviz',
    },
    {
      ticker: 'ROKU',
      company: 'Roku, Inc.',
      sector: 'Communication Services',
      industry: 'Entertainment',
      timing: 'before_open',
      signalLabel: 'Earnings Before',
      bucket: 'confirmed_mover',
      direction: 'up',
      gapPct: 5.6,
      changePct: 6.3,
      movePct: 5.6,
      moveSource: 'gap',
      changeFromOpenPct: 0.7,
      relativeVolume: 2.6,
      volume: 7_800_000,
      averageVolume: 3_400_000,
      price: 74.26,
      marketCap: '10.8B',
      earningsDate: 'May 17/b',
      score: 64.8,
      reasons: ['Earnings Before', '+5.6% gap', '2.6x rel vol', '1M+ volume', 'liquid price band'],
      chartHref: '/chart?symbol=ROKU',
      source: 'finviz',
    },
    {
      ticker: 'ADBE',
      company: 'Adobe Inc.',
      sector: 'Technology',
      industry: 'Software - Infrastructure',
      timing: 'after_close',
      signalLabel: 'Earnings After',
      bucket: 'after_close_watch',
      direction: 'flat',
      gapPct: null,
      changePct: 0.4,
      movePct: 0.4,
      moveSource: 'change',
      changeFromOpenPct: -0.2,
      relativeVolume: 1.1,
      volume: 2_900_000,
      averageVolume: 3_100_000,
      price: 492.14,
      marketCap: '216.3B',
      earningsDate: 'May 17/a',
      score: 23.9,
      reasons: ['Earnings After', '+0.4% change', '1.1x rel vol', '1M+ volume', 'liquid price band'],
      chartHref: '/chart?symbol=ADBE',
      source: 'finviz',
    },
  ]

  return {
    fetchedAt: new Date().toISOString(),
    filters: EARNINGS_GAP_FILTERS,
    signals: EARNINGS_SIGNALS,
    source: 'finviz',
    sourceStatus: 'demo',
    candidates: candidates.sort(sortEarningsGapCandidates),
  }
}
