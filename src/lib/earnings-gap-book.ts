const NASDAQ_EARNINGS_ENDPOINT = 'https://api.nasdaq.com/api/calendar/earnings'
const YAHOO_CHART_ENDPOINT = 'https://query1.finance.yahoo.com/v8/finance/chart'

const ET_TIME_ZONE = 'America/New_York'
const DEFAULT_LOOKBACK_DAYS = 35
const DEFAULT_MIN_GAP_PCT = 3
const DEFAULT_HISTORY_SYMBOL_CAP = 120
const DEFAULT_UPCOMING_PER_DAY = 8
const MIN_HISTORY_MARKET_CAP = 1_000_000_000

const NASDAQ_HEADERS = {
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  Origin: 'https://www.nasdaq.com',
  Referer: 'https://www.nasdaq.com/',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36',
}

const YAHOO_HEADERS = {
  Accept: 'application/json, text/plain, */*',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36',
}

export type EarningsReportTime =
  | 'before_open'
  | 'after_close'
  | 'during_market'
  | 'not_supplied'

export type HistoricalEarningsGapDirection = 'up' | 'down'

export interface EarningsCalendarEvent {
  date: string
  symbol: string
  company: string
  reportTime: EarningsReportTime
  reportTimeLabel: string
  eps: string
  surprise: string
  marketCap: string
  marketCapValue: number | null
  fiscalQuarterEnding: string
  epsForecast: string
  noOfEsts: string
  source: 'nasdaq' | 'sample'
}

export interface HistoricalEarningsGapEvent {
  ticker: string
  company: string
  reportDate: string
  reactionDate: string
  reportTime: EarningsReportTime
  reportTimeLabel: string
  direction: HistoricalEarningsGapDirection
  gapPct: number
  closeFromPriorPct: number
  changeFromOpenPct: number
  priorClose: number
  open: number
  close: number
  volume: number | null
  marketCap: string
  eps: string
  surprise: string
  epsForecast: string
  fiscalQuarterEnding: string
  chartHref: string
  source: 'nasdaq+yahoo' | 'sample'
}

export interface MonthlyEarningsGapGroup {
  monthKey: string
  monthLabel: string
  events: HistoricalEarningsGapEvent[]
}

export interface UpcomingEarningsCalendarCell {
  date: string
  dayOfMonth: number
  inMonth: boolean
  isWeekend: boolean
  events: EarningsCalendarEvent[]
}

export interface UpcomingEarningsMonth {
  monthKey: string
  monthLabel: string
  eventCount: number
  cells: UpcomingEarningsCalendarCell[]
}

export interface EarningsGapBookResult {
  fetchedAt: string
  asOfDate: string
  lookbackDays: number
  minGapPct: number
  historyGroups: MonthlyEarningsGapGroup[]
  upcomingMonth: UpcomingEarningsMonth
  sourceStatus: 'live' | 'partial' | 'demo'
  historySource: 'nasdaq+yahoo' | 'sample'
  calendarSource: 'nasdaq' | 'sample'
  errors: string[]
}

interface NasdaqApiRow {
  time?: string
  symbol?: string
  name?: string
  eps?: string
  surprise?: string
  marketCap?: string
  fiscalQuarterEnding?: string
  epsForecast?: string
  noOfEsts?: string
}

interface YahooChartResponse {
  chart?: {
    result?: Array<{
      timestamp?: number[]
      indicators?: {
        quote?: Array<{
          open?: Array<number | null>
          high?: Array<number | null>
          low?: Array<number | null>
          close?: Array<number | null>
          volume?: Array<number | null>
        }>
      }
    }>
    error?: { description?: string }
  }
}

interface DailyPriceBar {
  date: string
  open: number
  high: number
  low: number
  close: number
  volume: number | null
}

interface FetchBookOptions {
  demo?: boolean
  lookbackDays?: number
  minGapPct?: number
  maxHistorySymbols?: number
  upcomingPerDay?: number
  asOfDate?: string
}

function round(value: number, digits = 1): number {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function stripHtml(value: string | undefined): string {
  return (value ?? '')
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .trim()
}

function normalizeSymbol(symbol: string | undefined): string {
  return stripHtml(symbol).toUpperCase().trim()
}

function isSupportedSymbol(symbol: string): boolean {
  return /^[A-Z][A-Z0-9.\-]{0,7}$/.test(symbol)
}

function parseMarketCap(value: string | undefined): number | null {
  const cleaned = stripHtml(value).replace(/[$,\s]/g, '')
  if (!cleaned || cleaned === 'N/A' || cleaned === '-') return null
  const parsed = Number(cleaned.replace(/[()]/g, ''))
  return Number.isFinite(parsed) ? parsed : null
}

function reportTimeFromNasdaq(value: string | undefined): EarningsReportTime {
  const text = (value ?? '').toLowerCase()
  if (text.includes('pre') || text.includes('before')) return 'before_open'
  if (text.includes('after')) return 'after_close'
  if (text.includes('during')) return 'during_market'
  return 'not_supplied'
}

export function reportTimeLabel(time: EarningsReportTime): string {
  switch (time) {
    case 'before_open':
      return 'Before open'
    case 'after_close':
      return 'After close'
    case 'during_market':
      return 'During market'
    case 'not_supplied':
      return 'Time n/a'
  }
}

function parseYmd(date: string): Date {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0))
}

function formatYmd(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function addDays(date: string, days: number): string {
  const d = parseYmd(date)
  d.setUTCDate(d.getUTCDate() + days)
  return formatYmd(d)
}

function daysBetween(start: string, end: string): number {
  return Math.round((parseYmd(end).getTime() - parseYmd(start).getTime()) / 86_400_000)
}

function isWeekend(date: string): boolean {
  const day = parseYmd(date).getUTCDay()
  return day === 0 || day === 6
}

function nextWeekday(date: string): string {
  let d = addDays(date, 1)
  while (isWeekend(d)) d = addDays(d, 1)
  return d
}

function previousWeekday(date: string): string {
  let d = addDays(date, -1)
  while (isWeekend(d)) d = addDays(d, -1)
  return d
}

function reactionDateForReport(date: string, reportTime: EarningsReportTime): string {
  if (reportTime === 'after_close') return nextWeekday(date)
  if (isWeekend(date)) return nextWeekday(date)
  return date
}

function todayEt(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: ET_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

function monthKey(date: string): string {
  return date.slice(0, 7)
}

function monthLabel(key: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(parseYmd(`${key}-01`))
}

function firstOfNextMonth(date: string): string {
  const d = parseYmd(date)
  return formatYmd(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1, 12)))
}

function lastDayOfMonth(key: string): string {
  const first = parseYmd(`${key}-01`)
  return formatYmd(new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0, 12)))
}

function enumerateDates(start: string, end: string): string[] {
  const dates: string[] = []
  let cursor = start
  while (cursor <= end) {
    dates.push(cursor)
    cursor = addDays(cursor, 1)
  }
  return dates
}

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let nextIndex = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex
      nextIndex += 1
      results[index] = await mapper(items[index], index)
    }
  })
  await Promise.all(workers)
  return results
}

async function fetchNasdaqEarningsDate(date: string): Promise<EarningsCalendarEvent[]> {
  const url = new URL(NASDAQ_EARNINGS_ENDPOINT)
  url.searchParams.set('date', date)

  const res = await fetch(url, {
    headers: NASDAQ_HEADERS,
    next: { revalidate: 6 * 3600 },
  })
  if (!res.ok) {
    throw new Error(`Nasdaq earnings calendar failed for ${date}: HTTP ${res.status}`)
  }

  const json = await res.json() as { data?: { rows?: NasdaqApiRow[] | null } }
  const rows = Array.isArray(json.data?.rows) ? json.data.rows : []
  return rows
    .map((row): EarningsCalendarEvent | null => {
      const symbol = normalizeSymbol(row.symbol)
      if (!isSupportedSymbol(symbol)) return null
      const reportTime = reportTimeFromNasdaq(row.time)
      return {
        date,
        symbol,
        company: stripHtml(row.name),
        reportTime,
        reportTimeLabel: reportTimeLabel(reportTime),
        eps: stripHtml(row.eps),
        surprise: stripHtml(row.surprise),
        marketCap: stripHtml(row.marketCap),
        marketCapValue: parseMarketCap(row.marketCap),
        fiscalQuarterEnding: stripHtml(row.fiscalQuarterEnding),
        epsForecast: stripHtml(row.epsForecast),
        noOfEsts: stripHtml(row.noOfEsts),
        source: 'nasdaq',
      }
    })
    .filter((event): event is EarningsCalendarEvent => event != null)
}

async function fetchNasdaqEarningsRange(start: string, end: string): Promise<EarningsCalendarEvent[]> {
  const dates = enumerateDates(start, end)
  const results = await mapLimit(dates, 6, (date) => fetchNasdaqEarningsDate(date))
  const seen = new Set<string>()
  return results.flat().filter((event) => {
    const key = `${event.date}:${event.symbol}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function yahooSymbol(symbol: string): string {
  return symbol.replace(/\./g, '-')
}

function epochSeconds(date: string): string {
  return Math.floor(Date.UTC(
    Number(date.slice(0, 4)),
    Number(date.slice(5, 7)) - 1,
    Number(date.slice(8, 10)),
    0,
    0,
    0,
  ) / 1000).toString()
}

async function fetchYahooDailyBars(
  symbol: string,
  start: string,
  end: string,
): Promise<DailyPriceBar[]> {
  const url = new URL(`${YAHOO_CHART_ENDPOINT}/${encodeURIComponent(yahooSymbol(symbol))}`)
  url.searchParams.set('period1', epochSeconds(start))
  url.searchParams.set('period2', epochSeconds(addDays(end, 1)))
  url.searchParams.set('interval', '1d')
  url.searchParams.set('events', 'history')
  url.searchParams.set('includeAdjustedClose', 'true')

  const res = await fetch(url, {
    headers: YAHOO_HEADERS,
    next: { revalidate: 12 * 3600 },
  })
  if (!res.ok) {
    throw new Error(`Yahoo chart failed for ${symbol}: HTTP ${res.status}`)
  }

  const json = await res.json() as YahooChartResponse
  const result = json.chart?.result?.[0]
  if (!result) return []
  const timestamps = result.timestamp ?? []
  const quote = result.indicators?.quote?.[0]
  if (!quote) return []

  const bars: DailyPriceBar[] = []
  timestamps.forEach((timestamp, index) => {
    const open = quote.open?.[index]
    const high = quote.high?.[index]
    const low = quote.low?.[index]
    const close = quote.close?.[index]
    if (
      open == null ||
      high == null ||
      low == null ||
      close == null ||
      !Number.isFinite(open) ||
      !Number.isFinite(high) ||
      !Number.isFinite(low) ||
      !Number.isFinite(close)
    ) {
      return
    }
    bars.push({
      date: formatYmd(new Date(timestamp * 1000)),
      open,
      high,
      low,
      close,
      volume: quote.volume?.[index] ?? null,
    })
  })
  return bars.sort((a, b) => a.date.localeCompare(b.date))
}

function buildHistoricalGapFromEvent(
  event: EarningsCalendarEvent,
  bars: DailyPriceBar[],
): HistoricalEarningsGapEvent | null {
  const expectedReactionDate = reactionDateForReport(event.date, event.reportTime)
  const reactionIndex = bars.findIndex((bar) => {
    if (bar.date < expectedReactionDate) return false
    return daysBetween(expectedReactionDate, bar.date) <= 6
  })
  if (reactionIndex <= 0) return null

  const reactionBar = bars[reactionIndex]
  const priorBar = bars[reactionIndex - 1]
  if (priorBar.close <= 0 || reactionBar.open <= 0) return null

  const gapPct = ((reactionBar.open - priorBar.close) / priorBar.close) * 100
  if (!Number.isFinite(gapPct)) return null

  return {
    ticker: event.symbol,
    company: event.company,
    reportDate: event.date,
    reactionDate: reactionBar.date,
    reportTime: event.reportTime,
    reportTimeLabel: event.reportTimeLabel,
    direction: gapPct > 0 ? 'up' : 'down',
    gapPct: round(gapPct),
    closeFromPriorPct: round(((reactionBar.close - priorBar.close) / priorBar.close) * 100),
    changeFromOpenPct: round(((reactionBar.close - reactionBar.open) / reactionBar.open) * 100),
    priorClose: round(priorBar.close, 2),
    open: round(reactionBar.open, 2),
    close: round(reactionBar.close, 2),
    volume: reactionBar.volume,
    marketCap: event.marketCap,
    eps: event.eps,
    surprise: event.surprise,
    epsForecast: event.epsForecast,
    fiscalQuarterEnding: event.fiscalQuarterEnding,
    chartHref: `/chart?symbol=${encodeURIComponent(event.symbol)}`,
    source: 'nasdaq+yahoo',
  }
}

function groupHistoricalEvents(events: HistoricalEarningsGapEvent[]): MonthlyEarningsGapGroup[] {
  const groups = new Map<string, HistoricalEarningsGapEvent[]>()
  for (const event of events) {
    const key = monthKey(event.reactionDate)
    groups.set(key, [...(groups.get(key) ?? []), event])
  }
  return [...groups.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([key, groupEvents]) => ({
      monthKey: key,
      monthLabel: monthLabel(key),
      events: groupEvents.sort((a, b) => {
        const dateOrder = b.reactionDate.localeCompare(a.reactionDate)
        if (dateOrder !== 0) return dateOrder
        return Math.abs(b.gapPct) - Math.abs(a.gapPct)
      }),
    }))
}

function selectHistoryEvents(
  events: EarningsCalendarEvent[],
  historyEnd: string,
  maxHistorySymbols: number,
): EarningsCalendarEvent[] {
  return events
    .filter((event) => reactionDateForReport(event.date, event.reportTime) <= historyEnd)
    .filter((event) => event.marketCapValue == null || event.marketCapValue >= MIN_HISTORY_MARKET_CAP)
    .sort((a, b) => (b.marketCapValue ?? 0) - (a.marketCapValue ?? 0))
    .slice(0, maxHistorySymbols)
}

function selectUpcomingEvents(
  events: EarningsCalendarEvent[],
  perDay: number,
): EarningsCalendarEvent[] {
  const byDate = new Map<string, EarningsCalendarEvent[]>()
  for (const event of events) {
    if (event.marketCapValue != null && event.marketCapValue < MIN_HISTORY_MARKET_CAP) continue
    byDate.set(event.date, [...(byDate.get(event.date) ?? []), event])
  }
  return [...byDate.values()]
    .flatMap((dateEvents) =>
      dateEvents
        .sort((a, b) => (b.marketCapValue ?? 0) - (a.marketCapValue ?? 0))
        .slice(0, perDay),
    )
    .sort((a, b) => a.date.localeCompare(b.date) || (b.marketCapValue ?? 0) - (a.marketCapValue ?? 0))
}

function buildUpcomingMonth(events: EarningsCalendarEvent[], key: string): UpcomingEarningsMonth {
  const monthStart = `${key}-01`
  const monthEnd = lastDayOfMonth(key)
  const startDay = parseYmd(monthStart).getUTCDay()
  const endDay = parseYmd(monthEnd).getUTCDay()
  const gridStart = addDays(monthStart, -startDay)
  const gridEnd = addDays(monthEnd, 6 - endDay)
  const byDate = new Map<string, EarningsCalendarEvent[]>()

  for (const event of events) {
    byDate.set(event.date, [...(byDate.get(event.date) ?? []), event])
  }

  const cells = enumerateDates(gridStart, gridEnd).map((date) => ({
    date,
    dayOfMonth: Number(date.slice(8, 10)),
    inMonth: monthKey(date) === key,
    isWeekend: isWeekend(date),
    events: byDate.get(date) ?? [],
  }))

  return {
    monthKey: key,
    monthLabel: monthLabel(key),
    eventCount: events.length,
    cells,
  }
}

export async function fetchEarningsGapBook(
  options: FetchBookOptions = {},
): Promise<EarningsGapBookResult> {
  if (options.demo) return getDemoEarningsGapBook()

  const asOfDate = options.asOfDate ?? todayEt()
  const lookbackDays = Math.min(Math.max(options.lookbackDays ?? DEFAULT_LOOKBACK_DAYS, 7), 90)
  const minGapPct = Math.min(Math.max(options.minGapPct ?? DEFAULT_MIN_GAP_PCT, 1), 25)
  const maxHistorySymbols = Math.min(Math.max(options.maxHistorySymbols ?? DEFAULT_HISTORY_SYMBOL_CAP, 20), 250)
  const upcomingPerDay = Math.min(Math.max(options.upcomingPerDay ?? DEFAULT_UPCOMING_PER_DAY, 3), 20)
  const historyStart = addDays(asOfDate, -lookbackDays)
  const historyEnd = previousWeekday(asOfDate)
  const nextMonthStart = firstOfNextMonth(asOfDate)
  const upcomingMonthKey = monthKey(nextMonthStart)
  const upcomingMonthEnd = lastDayOfMonth(upcomingMonthKey)
  const errors: string[] = []

  let historyCalendarEvents: EarningsCalendarEvent[] = []
  let upcomingEvents: EarningsCalendarEvent[] = []

  try {
    historyCalendarEvents = await fetchNasdaqEarningsRange(historyStart, historyEnd)
  } catch (err) {
    errors.push(err instanceof Error ? err.message : 'Historical earnings calendar failed')
  }

  try {
    upcomingEvents = await fetchNasdaqEarningsRange(nextMonthStart, upcomingMonthEnd)
  } catch (err) {
    errors.push(err instanceof Error ? err.message : 'Upcoming earnings calendar failed')
  }

  const pricedEvents = selectHistoryEvents(historyCalendarEvents, historyEnd, maxHistorySymbols)
  const gapResults = await mapLimit(pricedEvents, 8, async (event) => {
    const reactionDate = reactionDateForReport(event.date, event.reportTime)
    try {
      const bars = await fetchYahooDailyBars(event.symbol, addDays(event.date, -8), addDays(reactionDate, 4))
      return buildHistoricalGapFromEvent(event, bars)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      errors.push(`${event.symbol}: ${message}`)
      return null
    }
  })

  const historicalEvents = gapResults
    .filter((event): event is HistoricalEarningsGapEvent => event != null)
    .filter((event) => Math.abs(event.gapPct) >= minGapPct)
    .sort((a, b) => {
      const dateOrder = b.reactionDate.localeCompare(a.reactionDate)
      if (dateOrder !== 0) return dateOrder
      return Math.abs(b.gapPct) - Math.abs(a.gapPct)
    })

  const selectedUpcomingEvents = selectUpcomingEvents(upcomingEvents, upcomingPerDay)
  return {
    fetchedAt: new Date().toISOString(),
    asOfDate,
    lookbackDays,
    minGapPct,
    historyGroups: groupHistoricalEvents(historicalEvents),
    upcomingMonth: buildUpcomingMonth(selectedUpcomingEvents, upcomingMonthKey),
    sourceStatus: errors.length === 0 ? 'live' : 'partial',
    historySource: 'nasdaq+yahoo',
    calendarSource: 'nasdaq',
    errors: errors.slice(0, 8),
  }
}

function sampleEvent(event: Omit<HistoricalEarningsGapEvent, 'chartHref' | 'source'>): HistoricalEarningsGapEvent {
  return {
    ...event,
    chartHref: `/chart?symbol=${encodeURIComponent(event.ticker)}`,
    source: 'sample',
  }
}

function sampleCalendarEvent(event: Omit<EarningsCalendarEvent, 'source'>): EarningsCalendarEvent {
  return { ...event, source: 'sample' }
}

export function getDemoEarningsGapBook(): EarningsGapBookResult {
  const history = [
    sampleEvent({
      ticker: 'HIMS',
      company: 'Hims & Hers Health, Inc.',
      reportDate: '2026-05-11',
      reactionDate: '2026-05-12',
      reportTime: 'after_close',
      reportTimeLabel: 'After close',
      direction: 'down',
      gapPct: -13.0,
      closeFromPriorPct: -14.1,
      changeFromOpenPct: -1.3,
      priorClose: 29.14,
      open: 25.35,
      close: 25.03,
      volume: 967_177,
      marketCap: '$5.7B',
      eps: '',
      surprise: '',
      epsForecast: '',
      fiscalQuarterEnding: 'Mar/2026',
    }),
    sampleEvent({
      ticker: 'DDOG',
      company: 'Datadog, Inc.',
      reportDate: '2026-05-07',
      reactionDate: '2026-05-07',
      reportTime: 'before_open',
      reportTimeLabel: 'Before open',
      direction: 'up',
      gapPct: 30.9,
      closeFromPriorPct: 31.6,
      changeFromOpenPct: 0.5,
      priorClose: 143.46,
      open: 187.75,
      close: 188.75,
      volume: 1_080_481,
      marketCap: '$65.0B',
      eps: '',
      surprise: '',
      epsForecast: '',
      fiscalQuarterEnding: 'Mar/2026',
    }),
    sampleEvent({
      ticker: 'SMCI',
      company: 'Super Micro Computer, Inc.',
      reportDate: '2026-05-05',
      reactionDate: '2026-05-06',
      reportTime: 'after_close',
      reportTimeLabel: 'After close',
      direction: 'up',
      gapPct: 13.1,
      closeFromPriorPct: 24.5,
      changeFromOpenPct: 10.1,
      priorClose: 27.84,
      open: 31.49,
      close: 34.65,
      volume: 3_505_363,
      marketCap: '$20.0B',
      eps: '',
      surprise: '',
      epsForecast: '',
      fiscalQuarterEnding: 'Mar/2026',
    }),
    sampleEvent({
      ticker: 'SHOP',
      company: 'Shopify Inc.',
      reportDate: '2026-05-05',
      reactionDate: '2026-05-05',
      reportTime: 'before_open',
      reportTimeLabel: 'Before open',
      direction: 'down',
      gapPct: -9.1,
      closeFromPriorPct: -15.5,
      changeFromOpenPct: -7.1,
      priorClose: 127.49,
      open: 115.94,
      close: 107.68,
      volume: 1_632_159,
      marketCap: '$150.0B',
      eps: '',
      surprise: '',
      epsForecast: '',
      fiscalQuarterEnding: 'Mar/2026',
    }),
    sampleEvent({
      ticker: 'RDDT',
      company: 'Reddit, Inc.',
      reportDate: '2026-04-30',
      reactionDate: '2026-05-01',
      reportTime: 'after_close',
      reportTimeLabel: 'After close',
      direction: 'up',
      gapPct: 12.9,
      closeFromPriorPct: 13.3,
      changeFromOpenPct: 0.4,
      priorClose: 146.91,
      open: 165.85,
      close: 166.44,
      volume: 423_048,
      marketCap: '$30.0B',
      eps: '',
      surprise: '',
      epsForecast: '',
      fiscalQuarterEnding: 'Mar/2026',
    }),
    sampleEvent({
      ticker: 'META',
      company: 'Meta Platforms, Inc.',
      reportDate: '2026-04-29',
      reactionDate: '2026-04-30',
      reportTime: 'after_close',
      reportTimeLabel: 'After close',
      direction: 'down',
      gapPct: -7.5,
      closeFromPriorPct: -8.6,
      changeFromOpenPct: -1.1,
      priorClose: 669.47,
      open: 619.09,
      close: 612.16,
      volume: 1_731_495,
      marketCap: '$1.5T',
      eps: '',
      surprise: '',
      epsForecast: '',
      fiscalQuarterEnding: 'Mar/2026',
    }),
    sampleEvent({
      ticker: 'GOOGL',
      company: 'Alphabet Inc.',
      reportDate: '2026-04-29',
      reactionDate: '2026-04-30',
      reportTime: 'after_close',
      reportTimeLabel: 'After close',
      direction: 'up',
      gapPct: 6.8,
      closeFromPriorPct: 9.9,
      changeFromOpenPct: 2.9,
      priorClose: 350.27,
      open: 374.17,
      close: 384.99,
      volume: 2_175_993,
      marketCap: '$4.5T',
      eps: '',
      surprise: '',
      epsForecast: '',
      fiscalQuarterEnding: 'Mar/2026',
    }),
  ]

  const upcomingEvents = [
    sampleCalendarEvent({
      date: '2026-06-01',
      symbol: 'HPE',
      company: 'Hewlett Packard Enterprise Company',
      reportTime: 'after_close',
      reportTimeLabel: 'After close',
      eps: '',
      surprise: '',
      marketCap: '$45.3B',
      marketCapValue: 45_300_000_000,
      fiscalQuarterEnding: 'Apr/2026',
      epsForecast: '$0.44',
      noOfEsts: '12',
    }),
    sampleCalendarEvent({
      date: '2026-06-01',
      symbol: 'CRDO',
      company: 'Credo Technology Group Holding Ltd',
      reportTime: 'after_close',
      reportTimeLabel: 'After close',
      eps: '',
      surprise: '',
      marketCap: '$34.0B',
      marketCapValue: 34_000_000_000,
      fiscalQuarterEnding: 'Apr/2026',
      epsForecast: '$0.77',
      noOfEsts: '7',
    }),
    sampleCalendarEvent({
      date: '2026-06-02',
      symbol: 'CRWD',
      company: 'CrowdStrike Holdings, Inc.',
      reportTime: 'after_close',
      reportTimeLabel: 'After close',
      eps: '',
      surprise: '',
      marketCap: '$105.0B',
      marketCapValue: 105_000_000_000,
      fiscalQuarterEnding: 'Apr/2026',
      epsForecast: '$0.94',
      noOfEsts: '20',
    }),
    sampleCalendarEvent({
      date: '2026-06-04',
      symbol: 'LULU',
      company: 'lululemon athletica inc.',
      reportTime: 'after_close',
      reportTimeLabel: 'After close',
      eps: '',
      surprise: '',
      marketCap: '$45.0B',
      marketCapValue: 45_000_000_000,
      fiscalQuarterEnding: 'Apr/2026',
      epsForecast: '$2.59',
      noOfEsts: '18',
    }),
    sampleCalendarEvent({
      date: '2026-06-10',
      symbol: 'ORCL',
      company: 'Oracle Corporation',
      reportTime: 'after_close',
      reportTimeLabel: 'After close',
      eps: '',
      surprise: '',
      marketCap: '$610.0B',
      marketCapValue: 610_000_000_000,
      fiscalQuarterEnding: 'May/2026',
      epsForecast: '$1.60',
      noOfEsts: '25',
    }),
    sampleCalendarEvent({
      date: '2026-06-18',
      symbol: 'ADBE',
      company: 'Adobe Inc.',
      reportTime: 'after_close',
      reportTimeLabel: 'After close',
      eps: '',
      surprise: '',
      marketCap: '$155.0B',
      marketCapValue: 155_000_000_000,
      fiscalQuarterEnding: 'May/2026',
      epsForecast: '$5.05',
      noOfEsts: '24',
    }),
    sampleCalendarEvent({
      date: '2026-06-25',
      symbol: 'NKE',
      company: 'NIKE, Inc.',
      reportTime: 'after_close',
      reportTimeLabel: 'After close',
      eps: '',
      surprise: '',
      marketCap: '$92.0B',
      marketCapValue: 92_000_000_000,
      fiscalQuarterEnding: 'May/2026',
      epsForecast: '$0.18',
      noOfEsts: '22',
    }),
  ]

  return {
    fetchedAt: new Date().toISOString(),
    asOfDate: '2026-05-17',
    lookbackDays: DEFAULT_LOOKBACK_DAYS,
    minGapPct: DEFAULT_MIN_GAP_PCT,
    historyGroups: groupHistoricalEvents(history),
    upcomingMonth: buildUpcomingMonth(upcomingEvents, '2026-06'),
    sourceStatus: 'demo',
    historySource: 'sample',
    calendarSource: 'sample',
    errors: [],
  }
}
