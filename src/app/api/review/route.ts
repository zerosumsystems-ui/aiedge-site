import { readFileSync, readdirSync, existsSync, statSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import type {
  AuditPayload,
  AuditSummary,
  AuditSymbolRow,
  AuditHistoryEntry,
  AuditFailureMode,
  AuditDistribution,
  AuditTop5BrooksRow,
  AuditTop5ScannerRow,
  AgreementLevel,
  DivergenceClass,
  TradeDecision,
} from '@/lib/types'
import { requireSyncSecret } from '@/lib/auth/sync-secret'
import { requireSession } from '@/lib/auth/require-session'
import { getSnapshot, setSnapshot } from '@/lib/snapshots'

export const dynamic = 'force-dynamic'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

const EMPTY_PAYLOAD: AuditPayload = {
  latest: null,
  symbols: [],
  history: [],
  syncedAt: '',
}

export async function GET(request: Request) {
  const unauth = await requireSession(request)
  if (unauth) return unauth

  const payload = await getSnapshot<AuditPayload>('review', EMPTY_PAYLOAD)

  // Dev convenience: if nothing has been synced yet, scrape local audit dirs.
  if (
    process.env.NODE_ENV !== 'production' &&
    payload.syncedAt === '' &&
    payload.symbols.length === 0
  ) {
    const fromDisk = loadFromFilesystem()
    if (fromDisk) return Response.json(fromDisk, { headers: CORS_HEADERS })
  }

  return Response.json(payload, { headers: CORS_HEADERS })
}

export async function POST(request: Request) {
  const unauth = requireSyncSecret(request)
  if (unauth) return unauth
  try {
    const payload: AuditPayload = await request.json()
    await setSnapshot('review', payload)
    return Response.json({ ok: true }, { status: 200, headers: CORS_HEADERS })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return Response.json({ error: message }, { status: 500, headers: CORS_HEADERS })
  }
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS })
}

// ── Local dev filesystem fallback ────────────────────────────────────────────

function loadFromFilesystem(): AuditPayload | null {
  const base = join(homedir(), 'code', 'aiedge', 'audits')
  if (!existsSync(base)) return null

  const dirs = readdirSync(base)
    .filter((d) => {
      const full = join(base, d)
      return (
        statSync(full).isDirectory() &&
        existsSync(join(full, 'audit', 'ranking_comparison.csv'))
      )
    })
    .sort()
    .reverse() // latest first

  if (dirs.length === 0) return null

  const latestDir = dirs[0]
  const latestPath = join(base, latestDir)

  const summary = buildAuditSummary(latestPath, latestDir)
  const symbols = buildSymbols(latestPath)

  const history: AuditHistoryEntry[] = dirs.map((d) => {
    const { date, time } = parseDirName(d)
    const csvPath = join(base, d, 'audit', 'ranking_comparison.csv')
    let count = 0
    if (existsSync(csvPath)) {
      const text = readFileSync(csvPath, 'utf-8').trim()
      count = Math.max(0, text.split('\n').length - 1)
    }
    return { auditDir: d, auditDate: date, auditTime: time, symbolCount: count }
  })

  return {
    latest: summary,
    symbols,
    history,
    syncedAt: '',
  }
}

function parseDirName(name: string): { date: string; time: string } {
  const dateMatch = name.match(/^(\d{4}-\d{2}-\d{2})/)
  const date = dateMatch ? dateMatch[1] : ''
  const timeMatch = name.match(/_(\d{2})(\d{2})ET/)
  let time = ''
  if (timeMatch) {
    const h = parseInt(timeMatch[1], 10)
    const m = parseInt(timeMatch[2], 10)
    const ampm = h < 12 ? 'AM' : 'PM'
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
    time = `${h12}:${m.toString().padStart(2, '0')} ${ampm} ET`
  }
  return { date, time }
}

function buildAuditSummary(dirPath: string, dirName: string): AuditSummary {
  const { date, time } = parseDirName(dirName)
  const summaryFile = join(dirPath, 'SUMMARY_REPORT.md')
  const critiqueFile = join(dirPath, 'audit', 'methodology_critique.md')
  const csvFile = join(dirPath, 'audit', 'ranking_comparison.csv')

  const summaryMarkdown = existsSync(summaryFile)
    ? readFileSync(summaryFile, 'utf-8')
    : ''
  const critiqueMarkdown = existsSync(critiqueFile)
    ? readFileSync(critiqueFile, 'utf-8')
    : ''

  const symbols = parseRankingCsv(csvFile)
  const symbolCount = symbols.length
  const agreementDistribution = computeAgreementDistribution(symbols)
  const divergenceDistribution = computeDivergenceDistribution(symbols)
  const brooksTop5 = computeBrooksTop5(symbols)
  const scannerTop5 = computeScannerTop5(symbols)
  const failureModes = extractFailureModes(critiqueMarkdown)

  return {
    auditDate: date,
    auditTime: time,
    auditDir: dirName,
    symbolCount,
    agreementDistribution,
    divergenceDistribution,
    brooksTop5,
    scannerTop5,
    failureModes,
    summaryMarkdown,
    methodologyCritiqueMarkdown: critiqueMarkdown,
  }
}

function buildSymbols(dirPath: string): AuditSymbolRow[] {
  const csvFile = join(dirPath, 'audit', 'ranking_comparison.csv')
  const rows = parseRankingCsv(csvFile)

  const readsDir = join(dirPath, 'audit', 'reads')
  const readFiles = existsSync(readsDir) ? readdirSync(readsDir) : []

  // Note: interactive chart bars come from `python3 scripts/sync_audit.py`
  // which fetches OHLC via Databento and POSTs the full payload. The dev
  // filesystem fallback only attaches the narrative markdown.
  return rows.map((row) => {
    const readFile = readFiles.find((f) => f.includes(`_${row.ticker}.md`))
    let readMarkdown: string | undefined
    if (readFile) {
      readMarkdown = readFileSync(join(readsDir, readFile), 'utf-8')
    }
    return { ...row, readMarkdown }
  })
}

function parseRankingCsv(path: string): AuditSymbolRow[] {
  if (!existsSync(path)) return []
  const text = readFileSync(path, 'utf-8').trim()
  const lines = text.split('\n')
  if (lines.length < 2) return []

  // Simple CSV parser with quoted-field handling
  const rows: AuditSymbolRow[] = []
  for (let i = 1; i < lines.length; i++) {
    const parts = parseCsvLine(lines[i])
    if (parts.length < 17) continue
    rows.push({
      rankScanner: parseInt(parts[0], 10) || 0,
      rankBrooks: parseInt(parts[1], 10) || 0,
      rankDelta: parseInt(parts[2], 10) || 0,
      ticker: parts[3],
      urgScanner: parseFloat(parts[4]) || 0,
      brooksQualityScore: parseFloat(parts[5]) || 0,
      signalScanner: parts[6],
      decisionBrooks: (parts[7] || 'WAIT') as TradeDecision,
      phaseScanner: parts[8],
      phaseBrooks: parts[9],
      alwaysInScanner: parts[10],
      alwaysInBrooks: parts[11],
      probabilityBrooks: parseFloat(parts[12]) || 0,
      rrBrooks: parseFloat(parts[13]) || 0,
      agreementVsScanner: (parts[14] || 'PARTIAL') as AgreementLevel,
      agreementReason: parts[15],
      divergenceClass: (parts[16] || 'MINOR') as DivergenceClass,
    })
  }
  return rows
}

function parseCsvLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  result.push(current)
  return result
}

function computeAgreementDistribution(
  rows: AuditSymbolRow[]
): AuditDistribution<AgreementLevel>[] {
  const total = rows.length || 1
  const counts: Record<AgreementLevel, number> = {
    AGREE: 0,
    PARTIAL: 0,
    MINOR: 0,
    MAJOR: 0,
    DISAGREE: 0,
    INVERTED: 0,
  }
  for (const r of rows) counts[r.agreementVsScanner] = (counts[r.agreementVsScanner] || 0) + 1
  const order: AgreementLevel[] = ['AGREE', 'PARTIAL', 'MINOR', 'MAJOR', 'DISAGREE', 'INVERTED']
  return order
    .filter((k) => counts[k] > 0)
    .map((k) => ({
      class: k,
      count: counts[k],
      pct: +((counts[k] / total) * 100).toFixed(1),
    }))
}

function computeDivergenceDistribution(
  rows: AuditSymbolRow[]
): AuditDistribution<DivergenceClass>[] {
  const total = rows.length || 1
  const counts: Record<DivergenceClass, number> = {
    AGREE: 0,
    MINOR: 0,
    MAJOR: 0,
    INVERTED: 0,
  }
  for (const r of rows) counts[r.divergenceClass] = (counts[r.divergenceClass] || 0) + 1
  const order: DivergenceClass[] = ['AGREE', 'MINOR', 'MAJOR', 'INVERTED']
  return order
    .filter((k) => counts[k] > 0)
    .map((k) => ({
      class: k,
      count: counts[k],
      pct: +((counts[k] / total) * 100).toFixed(1),
    }))
}

function computeBrooksTop5(rows: AuditSymbolRow[]): AuditTop5BrooksRow[] {
  return [...rows]
    .sort((a, b) => {
      if (b.brooksQualityScore !== a.brooksQualityScore)
        return b.brooksQualityScore - a.brooksQualityScore
      const eqA = a.probabilityBrooks * a.rrBrooks
      const eqB = b.probabilityBrooks * b.rrBrooks
      return eqB - eqA
    })
    .slice(0, 5)
    .map((r) => ({
      ticker: r.ticker,
      rankScanner: r.rankScanner,
      signalScanner: r.signalScanner,
      decisionBrooks: r.decisionBrooks,
      probability: r.probabilityBrooks,
      rr: r.rrBrooks,
    }))
}

function computeScannerTop5(rows: AuditSymbolRow[]): AuditTop5ScannerRow[] {
  return [...rows]
    .sort((a, b) => a.rankScanner - b.rankScanner)
    .slice(0, 5)
    .map((r) => ({
      ticker: r.ticker,
      urgScanner: r.urgScanner,
      signalScanner: r.signalScanner,
      decisionBrooks: r.decisionBrooks,
      brooksQualityScore: r.brooksQualityScore,
      agreement: r.agreementVsScanner,
    }))
}

function extractFailureModes(critiqueMarkdown: string): AuditFailureMode[] {
  if (!critiqueMarkdown) return []
  const modes: AuditFailureMode[] = []

  // Split on level-3 headings under "Part B"
  const partBIdx = critiqueMarkdown.indexOf('## Part B')
  const partCIdx = critiqueMarkdown.indexOf('## Part C')
  const endIdx = partCIdx > 0 ? partCIdx : critiqueMarkdown.length
  if (partBIdx < 0) return []

  const partB = critiqueMarkdown.slice(partBIdx, endIdx)
  const sections = partB.split(/\n(?=### [A-Z]\d)/).slice(1)

  for (const section of sections) {
    const headerMatch = section.match(/^### ([A-Z]\d+)\.\s*(.+?)\n/)
    if (!headerMatch) continue
    const code = headerMatch[1]
    const title = headerMatch[2].trim()
    const body = section.slice(headerMatch[0].length).trim()

    // Extract affected tickers — uppercase 2-6 letter tokens (rough heuristic)
    const tickerSet = new Set<string>()
    const tickerRegex = /\[\d+\s+([A-Z]{1,6})\]/g
    let m
    while ((m = tickerRegex.exec(body)) !== null) {
      tickerSet.add(m[1])
    }
    // Also match `**TSLA**`, `**META**` style
    const boldRegex = /\*\*([A-Z]{2,6})\*\*/g
    while ((m = boldRegex.exec(body)) !== null) {
      tickerSet.add(m[1])
    }

    // Extract first file:line citation
    const fileMatch = body.match(/([a-z_]+\.py:\d+(?:-\d+)?)/)
    const fileCitation = fileMatch ? fileMatch[1] : ''

    // Short description: first paragraph up to ~400 chars
    const firstPara = body.split(/\n\n/)[0].trim()
    const description = firstPara.length > 500 ? firstPara.slice(0, 500) + '…' : firstPara

    modes.push({
      id: code.toLowerCase(),
      title: `${code}. ${title}`,
      affectedTickers: Array.from(tickerSet).slice(0, 20),
      fileCitation,
      description,
    })
  }

  return modes
}
