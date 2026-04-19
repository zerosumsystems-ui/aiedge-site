import type {
  BacktestCorpus,
  BacktestSetupRow,
  BacktestMonthRow,
  BacktestDailyRow,
  VaultNote,
  VaultPayload,
} from './types'
import { getSnapshot } from './snapshots'

/**
 * Derive the BacktestCorpus payload from the vault snapshot.
 *
 * Inputs (paths inside the vault snapshot):
 *   Scanner/backtests/ROLLUP_6MO_…           — full 6-month corpus headline
 *                                              + per-setup + per-month tables
 *   Scanner/backtests/README                  — daily-log extension table
 *
 * Returns null if either note is missing.
 */
export async function loadBacktestCorpus(): Promise<BacktestCorpus | null> {
  const vault = await getSnapshot<VaultPayload>('vault', {
    notes: [],
    syncedAt: '',
    noteCount: 0,
  })
  return parseFromVaultNotes(vault.notes)
}

export function parseFromVaultNotes(notes: VaultNote[]): BacktestCorpus | null {
  const rollup = notes.find(
    (n) =>
      n.slug.startsWith('Scanner/backtests/ROLLUP') ||
      n.filename.startsWith('ROLLUP_6MO')
  )
  const readme = notes.find(
    (n) =>
      n.slug === 'Scanner/backtests/README' ||
      n.filename === 'README.md' &&
        n.folder.replace(/\\/g, '/').endsWith('Scanner/backtests')
  )
  if (!rollup) return null

  const headline = parseHeadline(rollup.content)
  if (!headline) return null

  const meta = parseRollupMeta(rollup.content)
  const perSetup = parsePerSetup(rollup.content)
  const perMonth = parsePerMonth(rollup.content)
  const dailyLog = readme ? parseDailyLog(readme.content) : []

  return {
    period: meta.period,
    computed: meta.computed,
    headline,
    perSetup,
    perMonth,
    dailyLog,
    rollupMarkdown: rollup.content,
  }
}

// ─── Frontmatter ────────────────────────────────────────────────────────────

function parseRollupMeta(content: string): { period: string; computed: string } {
  const period = matchFm(content, 'period') || ''
  const computed = matchFm(content, 'computed') || ''
  return { period, computed }
}

function matchFm(content: string, key: string): string | null {
  const m = content.match(new RegExp(`^${key}:\\s*(.+?)$`, 'm'))
  return m ? m[1].trim() : null
}

// ─── Headline ──────────────────────────────────────────────────────────────

function parseHeadline(content: string): BacktestCorpus['headline'] | null {
  // "Top-tier (urgency ≥ 7.0): 67W / 75L / 10 incomplete = **47.2% WR at 2R cap** on N=142 resolved"
  const ttRe =
    /Top-tier[^\n]*?:\s*(\d+)W\s*\/\s*(\d+)L\s*\/\s*(\d+)\s*incomplete\s*=\s*\*\*([\d.]+)%/i
  const ttMatch = content.match(ttRe)
  if (!ttMatch) return null

  // "Expectancy: **+0.42R / trade**, 95% CI **[+0.17, +0.66]**"
  const expRe = /Expectancy[^\n]*?\*\*([+-]?[\d.]+)R[^\n]*?\[([+-]?[\d.]+),\s*([+-]?[\d.]+)\]/i
  const expMatch = content.match(expRe)

  // "Top-10 companion: 164W / 253L / 41I = **39.3% WR**"
  const t10Re = /Top-10[^\n]*?:\s*(\d+)W\s*\/\s*(\d+)L\s*\/\s*(\d+)I\s*=\s*\*\*([\d.]+)%/i
  const t10Match = content.match(t10Re)

  // "28 distinct top-tier run_ids in the DB"
  const runRe = /(\d+)\s+distinct\s+top-tier\s+run_ids/i
  const runMatch = content.match(runRe)

  return {
    topTierW: parseInt(ttMatch[1], 10),
    topTierL: parseInt(ttMatch[2], 10),
    topTierI: parseInt(ttMatch[3], 10),
    topTierWrPct: parseFloat(ttMatch[4]),
    expectancyR: expMatch ? parseFloat(expMatch[1]) : 0,
    expectancyCiLow: expMatch ? parseFloat(expMatch[2]) : 0,
    expectancyCiHigh: expMatch ? parseFloat(expMatch[3]) : 0,
    top10W: t10Match ? parseInt(t10Match[1], 10) : 0,
    top10L: t10Match ? parseInt(t10Match[2], 10) : 0,
    top10I: t10Match ? parseInt(t10Match[3], 10) : 0,
    top10WrPct: t10Match ? parseFloat(t10Match[4]) : 0,
    runIdCount: runMatch ? parseInt(runMatch[1], 10) : 0,
  }
}

// ─── Per-setup table ───────────────────────────────────────────────────────

function parsePerSetup(content: string): BacktestSetupRow[] {
  const sectionStart = content.indexOf('## Per-setup expectancy')
  if (sectionStart < 0) return []
  const sectionEnd = content.indexOf('\n## ', sectionStart + 1)
  const section = content.slice(
    sectionStart,
    sectionEnd > 0 ? sectionEnd : content.length
  )

  const rows: BacktestSetupRow[] = []
  // Markdown table rows: | **L1** | 28 | 54% | **+0.61R** | **[+0.05, +1.16]** | Only … |
  const lines = section.split('\n')
  for (const line of lines) {
    if (!line.trim().startsWith('|')) continue
    const cells = splitMdRow(line)
    if (cells.length < 6) continue
    const setup = stripMd(cells[0])
    if (!setup || /^Setup$/i.test(setup) || /^-+$/.test(setup)) continue
    const n = parseInt(stripMd(cells[1]), 10)
    if (Number.isNaN(n)) continue
    const wrPct = parsePct(cells[2])
    const expR = parseR(cells[3])
    const { ciLow, ciHigh } = parseCi(cells[4])
    const verdict = stripMd(cells[5])
    rows.push({ setup, n, wrPct, expR, ciLow, ciHigh, verdict })
  }
  return rows
}

// ─── Per-month table ───────────────────────────────────────────────────────

function parsePerMonth(content: string): BacktestMonthRow[] {
  const sectionStart = content.indexOf('## Month-over-month')
  if (sectionStart < 0) return []
  const sectionEnd = content.indexOf('\n## ', sectionStart + 1)
  const section = content.slice(
    sectionStart,
    sectionEnd > 0 ? sectionEnd : content.length
  )

  const rows: BacktestMonthRow[] = []
  const lines = section.split('\n')
  for (const line of lines) {
    if (!line.trim().startsWith('|')) continue
    const cells = splitMdRow(line)
    if (cells.length < 8) continue
    const labelRaw = stripMd(cells[0])
    if (!labelRaw || /^Month$/i.test(labelRaw) || /^-+$/.test(labelRaw)) continue

    // Label may include the range in parens (e.g. "Prior daily log (2026-02-09 → 2026-03-06)")
    let label = labelRaw
    let range = stripMd(cells[1])
    const m = labelRaw.match(/^(.+?)\s*\(([^)]+)\)\s*$/)
    if (m && !range) {
      label = m[1].trim()
      range = m[2].trim()
    } else if (m) {
      label = m[1].trim()
    }

    const w = parseInt(stripMd(cells[2]), 10)
    const l = parseInt(stripMd(cells[3]), 10)
    const i = parseInt(stripMd(cells[4]), 10)
    if (Number.isNaN(w) || Number.isNaN(l)) continue
    const wrPct = parsePct(cells[5])
    const top10WrPct = parsePctOrNull(cells[6])
    const deltaPts = parseDelta(cells[7])
    rows.push({
      label,
      range,
      w,
      l,
      i: Number.isNaN(i) ? 0 : i,
      wrPct,
      top10WrPct,
      deltaPts,
    })
  }
  return rows
}

// ─── Daily log table (from README) ─────────────────────────────────────────

function parseDailyLog(content: string): BacktestDailyRow[] {
  const sectionStart = content.indexOf('## Days documented')
  if (sectionStart < 0) return []
  const sectionEnd = content.indexOf('\n### ', sectionStart + 1)
  const section = content.slice(
    sectionStart,
    sectionEnd > 0 ? sectionEnd : content.length
  )

  const rows: BacktestDailyRow[] = []
  const lines = section.split('\n')
  for (const line of lines) {
    if (!line.trim().startsWith('|')) continue
    const cells = splitMdRow(line)
    if (cells.length < 5) continue
    const dateCell = stripMd(cells[0])
    if (!dateCell || /^Date$/i.test(dateCell) || /^-+$/.test(dateCell)) continue

    // Date cell is "[2026-03-06](2026-03-06.md)" → extract the YYYY-MM-DD
    const dateMatch = dateCell.match(/(\d{4}-\d{2}-\d{2})/)
    if (!dateMatch) continue
    const date = dateMatch[1]
    const topTierNames = stripMd(cells[1])
    const topTierN = parseInt(stripMd(cells[2]), 10) || 0
    const topTierWL = stripMd(cells[3]) || '—'
    const notes = stripMd(cells[4])
    rows.push({ date, topTierNames, topTierN, topTierWL, notes })
  }
  return rows
}

// ─── Cell helpers ──────────────────────────────────────────────────────────

function splitMdRow(line: string): string[] {
  const trimmed = line.trim()
  // Strip leading + trailing pipe, then split. Cells with embedded escaped
  // pipes are uncommon in our tables; ignore that complexity.
  const inner = trimmed.replace(/^\|/, '').replace(/\|$/, '')
  return inner.split('|').map((c) => c.trim())
}

function stripMd(cell: string): string {
  return cell
    .replace(/^\*\*(.+)\*\*$/, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .trim()
}

function parsePct(cell: string): number {
  const m = stripMd(cell).match(/([\d.]+)\s*%/)
  return m ? parseFloat(m[1]) : 0
}

function parsePctOrNull(cell: string): number | null {
  const s = stripMd(cell)
  if (s === '—' || s === '-' || !s) return null
  const m = s.match(/([\d.]+)\s*%/)
  return m ? parseFloat(m[1]) : null
}

function parseR(cell: string): number {
  const m = stripMd(cell).match(/([+-]?[\d.]+)R?/)
  return m ? parseFloat(m[1]) : 0
}

function parseCi(cell: string): { ciLow: number | null; ciHigh: number | null } {
  const s = stripMd(cell)
  if (s === '—' || s === '-' || !s) return { ciLow: null, ciHigh: null }
  const m = s.match(/\[\s*([+-]?[\d.]+)\s*,\s*([+-]?[\d.]+)\s*\]/)
  if (!m) return { ciLow: null, ciHigh: null }
  return { ciLow: parseFloat(m[1]), ciHigh: parseFloat(m[2]) }
}

function parseDelta(cell: string): number | null {
  const s = stripMd(cell)
  if (s === '—' || s === '-' || !s) return null
  if (s === '0') return 0
  const m = s.match(/([+-]?\d+)/)
  return m ? parseInt(m[1], 10) : null
}
