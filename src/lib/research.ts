import type { RecentResearchNote, VaultNote, VaultPayload } from './types'
import { getSnapshot } from './snapshots'

const RESEARCH_FOLDERS = [
  'Scanner/methodology',
  'Scanner/backtests',
  'Journal',
  'Market/day-types',
]

const DEFAULT_LIMIT = 14
const EXCERPT_LEN = 260
const MAX_PER_STEM = 3

/**
 * Derive a list of recent research notes from the vault snapshot.
 *
 * Filters the vault for notes inside research/backtest folders, then sorts
 * them newest-first by whatever date we can extract. Used by the /review tab
 * to surface the research output from scheduled routines (rd,
 * small-pullback-trend-research, backtest, daily-rs-rankings, etc.).
 */
export async function loadRecentResearch(
  limit = DEFAULT_LIMIT
): Promise<RecentResearchNote[]> {
  const vault = await getSnapshot<VaultPayload>('vault', {
    notes: [],
    syncedAt: '',
    noteCount: 0,
  })
  return deriveRecentResearch(vault.notes, limit)
}

export function deriveRecentResearch(
  notes: VaultNote[],
  limit = DEFAULT_LIMIT
): RecentResearchNote[] {
  const filtered = notes.filter((n) => {
    const folder = n.folder.replace(/\\/g, '/')
    if (!RESEARCH_FOLDERS.some((p) => folder.startsWith(p))) return false
    if (n.filename === 'README.md') return false
    if (n.filename === 'INDEX.md') return false
    if (/ROLLUP_6MO/i.test(n.filename)) return false // already rendered by BacktestCorpusPanel
    return true
  })

  const enriched = filtered.map((n) => ({ note: n, date: extractDate(n) }))

  enriched.sort((a, b) => {
    if (a.date && b.date) return b.date.localeCompare(a.date)
    if (a.date) return -1
    if (b.date) return 1
    return a.note.filename.localeCompare(b.note.filename)
  })

  const perStemCount = new Map<string, number>()
  const selected: typeof enriched = []
  for (const e of enriched) {
    const stemKey = `${e.note.folder}::${seriesStem(e.note.filename)}`
    const count = perStemCount.get(stemKey) ?? 0
    if (count >= MAX_PER_STEM) continue
    perStemCount.set(stemKey, count + 1)
    selected.push(e)
    if (selected.length >= limit) break
  }

  return selected.map((e) => ({
    slug: e.note.slug,
    title: e.note.title || prettifyFilename(e.note.filename),
    folder: e.note.folder,
    filename: e.note.filename,
    date: e.date,
    excerpt: extractExcerpt(e.note.content),
  }))
}

// Collapse filenames with dated / incremented suffixes down to a shared stem
// so same-series files share a dedupe key. Examples:
//   2026-03-06.md                              → daily-log
//   trend-contributor-findings-2026-04-19-incrX → trend-contributor-findings
function seriesStem(filename: string): string {
  const base = filename.replace(/\.md$/, '')
  if (/^\d{4}-\d{2}-\d{2}$/.test(base)) return 'daily-log'
  return base.replace(/(-\d{4}-\d{2}-\d{2}|-incr\d+).*$/, '')
}

function extractDate(note: VaultNote): string {
  const fnMatch = note.filename.match(/(\d{4}-\d{2}-\d{2})/)
  if (fnMatch) return fnMatch[1]
  const fmMatch = note.content.match(/^(?:date|created):\s*(\d{4}-\d{2}-\d{2})/im)
  if (fmMatch) return fmMatch[1]
  const bodyMatch = note.content.match(/\b(\d{4}-\d{2}-\d{2})\b/)
  return bodyMatch ? bodyMatch[1] : ''
}

function extractExcerpt(content: string): string {
  const withoutFm = content.replace(/^---[\s\S]*?---\s*/m, '')
  const paragraphs = withoutFm.split(/\n\n+/)
  for (const para of paragraphs) {
    const cleaned = para
      .replace(/^#{1,6}\s+/, '')
      .replace(/^\*\*[^*]+\*\*\s*:?/, '')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\[\[([^\]]+)\]\]/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .trim()
    if (cleaned.length < 40) continue
    if (cleaned.startsWith('|') || cleaned.startsWith('```')) continue
    return cleaned.length > EXCERPT_LEN
      ? cleaned.slice(0, EXCERPT_LEN).trimEnd() + '…'
      : cleaned
  }
  return ''
}

function prettifyFilename(filename: string): string {
  return filename
    .replace(/\.md$/, '')
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}
