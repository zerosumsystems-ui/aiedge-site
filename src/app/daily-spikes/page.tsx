import Link from 'next/link'
import { fetchSpikeScreener, SPIKE_FILTERS, type ScreenerRow } from '@/lib/finviz'

export const metadata = {
  title: 'Daily Spikes — AI Edge',
  description:
    'Daily screen of strong-earnings stocks entering a spike — enormous relative volume and a breakout near the 52-week high.',
}

// Run fresh on every request; the underlying Finviz fetch is itself cached
// for 30 minutes, so a missing-token error recovers automatically once the
// env var is set without waiting on a stale static page.
export const dynamic = 'force-dynamic'

/** First non-empty value among the candidate header names, else an em dash. */
function pick(row: ScreenerRow, names: string[]): string {
  for (const name of names) {
    const v = row[name]
    if (v != null && v !== '') return v
  }
  return '—'
}

/** Finviz signs percentage/change strings with a leading '-' when negative. */
function changeClass(value: string): string {
  if (value === '—' || value === '') return 'text-sub'
  return value.trim().startsWith('-') ? 'text-red' : 'text-teal'
}

type DisplayColumn = {
  label: string
  aliases: string[]
  align?: 'right'
  className?: (value: string) => string
}

const DISPLAY_COLUMNS: DisplayColumn[] = [
  { label: 'Company', aliases: ['Company'] },
  { label: 'Sector', aliases: ['Sector'] },
  { label: 'Price', aliases: ['Price'], align: 'right' },
  {
    label: 'Change',
    aliases: ['Change'],
    align: 'right',
    className: changeClass,
  },
  { label: 'Volume', aliases: ['Volume'], align: 'right' },
  {
    label: 'Rel Volume',
    aliases: ['Relative Volume', 'Rel Volume'],
    align: 'right',
  },
  { label: 'Avg Volume', aliases: ['Average Volume', 'Avg Volume'], align: 'right' },
  {
    label: 'EPS Q/Q',
    aliases: ['EPS growth qtr over qtr', 'EPS Q/Q'],
    align: 'right',
  },
  {
    label: 'EPS this yr',
    aliases: ['EPS growth this year', 'EPS this year'],
    align: 'right',
  },
  { label: 'Market Cap', aliases: ['Market Cap'], align: 'right' },
  { label: 'Earnings', aliases: ['Earnings Date', 'Earnings'], align: 'right' },
]

export default async function DailySpikesPage() {
  let rows: ScreenerRow[] = []
  let fetchedAt: string | null = null
  let error: string | null = null

  try {
    const result = await fetchSpikeScreener()
    rows = result.rows
    fetchedAt = result.fetchedAt
  } catch (err) {
    error = err instanceof Error ? err.message : 'Failed to load screener'
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6">
      <header className="mb-4">
        <h1 className="text-lg font-bold text-text">Daily Spike Screener</h1>
        <p className="mt-1 text-xs text-sub">
          Strong-earnings stocks entering a spike — enormous relative volume
          and a breakout near the 52-week high. Sourced from Finviz Elite,
          sorted by relative volume.
        </p>
      </header>

      {/* Active filter criteria — kept visible so the screen is self-documenting. */}
      <div className="mb-5 flex flex-wrap gap-1.5">
        {SPIKE_FILTERS.map((f) => (
          <span
            key={f.code}
            className="rounded border border-border bg-surface px-2 py-1 text-[11px] text-sub"
          >
            {f.label}
          </span>
        ))}
      </div>

      {error ? (
        <div className="rounded border border-border bg-surface p-4 text-xs text-sub">
          <p className="font-medium text-orange">Screener unavailable</p>
          <p className="mt-1">{error}</p>
          {error.includes('FINVIZ_AUTH_TOKEN') && (
            <p className="mt-2">
              Set <code className="text-text">FINVIZ_AUTH_TOKEN</code> in the
              Vercel + Claude Code environment settings. The token is on your
              Finviz Elite account page under the API/export section.
            </p>
          )}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded border border-border bg-surface p-4 text-xs text-sub">
          No spike candidates match the screen right now.
        </div>
      ) : (
        <div className="overflow-x-auto rounded border border-border">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b border-border bg-surface text-sub">
                <th className="px-3 py-2 text-left font-medium">Ticker</th>
                {DISPLAY_COLUMNS.map((col) => (
                  <th
                    key={col.label}
                    className={`px-3 py-2 font-medium ${
                      col.align === 'right' ? 'text-right' : 'text-left'
                    }`}
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const ticker = pick(row, ['Ticker'])
                return (
                  <tr
                    key={`${ticker}-${i}`}
                    className="border-b border-border last:border-0 hover:bg-surface-hover"
                  >
                    <td className="px-3 py-2">
                      {ticker === '—' ? (
                        <span className="text-sub">—</span>
                      ) : (
                        <Link
                          href={`/chart?symbol=${encodeURIComponent(ticker)}`}
                          className="font-semibold text-teal hover:underline"
                        >
                          {ticker}
                        </Link>
                      )}
                    </td>
                    {DISPLAY_COLUMNS.map((col) => {
                      const value = pick(row, col.aliases)
                      return (
                        <td
                          key={col.label}
                          className={`px-3 py-2 ${
                            col.align === 'right' ? 'text-right' : 'text-left'
                          } ${col.className ? col.className(value) : 'text-text'}`}
                        >
                          {value}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {fetchedAt && (
        <p className="mt-3 text-[11px] text-sub">
          {rows.length} candidate{rows.length === 1 ? '' : 's'} · data from
          Finviz · refreshed {new Date(fetchedAt).toLocaleString()}
        </p>
      )}
    </div>
  )
}
