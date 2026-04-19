'use client'

import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { BacktestCorpus } from '@/lib/types'

function wrColor(pct: number): string {
  if (pct >= 55) return 'text-teal'
  if (pct >= 45) return 'text-yellow'
  return 'text-red'
}

function expColor(r: number): string {
  if (r > 0.3) return 'text-teal'
  if (r > 0) return 'text-yellow'
  return 'text-red'
}

function StatTile({
  label,
  value,
  sub,
  tone,
}: {
  label: string
  value: string
  sub?: string
  tone?: 'teal' | 'yellow' | 'red' | 'text'
}) {
  const valueClass =
    tone === 'teal'
      ? 'text-teal'
      : tone === 'yellow'
        ? 'text-yellow'
        : tone === 'red'
          ? 'text-red'
          : 'text-text'
  return (
    <div className="bg-bg border border-border/60 rounded-md px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-sub">{label}</div>
      <div className={`text-base font-semibold mt-0.5 ${valueClass}`}>{value}</div>
      {sub && <div className="text-[10px] text-sub mt-0.5">{sub}</div>}
    </div>
  )
}

export function BacktestCorpusPanel({ corpus }: { corpus: BacktestCorpus }) {
  const [showRollup, setShowRollup] = useState(false)
  const h = corpus.headline
  const edgePts = +(h.topTierWrPct - h.top10WrPct).toFixed(1)

  return (
    <section className="bg-surface border border-border rounded-lg p-4 space-y-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold text-text">
          Backtest Corpus
          <span className="text-sub font-normal ml-2 text-[11px]">
            urgency-gated · {corpus.period}
          </span>
        </h2>
        <span className="text-[10px] text-sub">computed {corpus.computed}</span>
      </div>

      {/* Headline tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <StatTile
          label="Top-tier WR"
          value={`${h.topTierWrPct}%`}
          sub={`${h.topTierW}W / ${h.topTierL}L / ${h.topTierI}I — N=${
            h.topTierW + h.topTierL
          } resolved`}
          tone={h.topTierWrPct >= 50 ? 'teal' : h.topTierWrPct >= 45 ? 'yellow' : 'red'}
        />
        <StatTile
          label="Expectancy"
          value={`${h.expectancyR >= 0 ? '+' : ''}${h.expectancyR.toFixed(2)}R`}
          sub={`95% CI [${h.expectancyCiLow >= 0 ? '+' : ''}${h.expectancyCiLow.toFixed(
            2
          )}, ${h.expectancyCiHigh >= 0 ? '+' : ''}${h.expectancyCiHigh.toFixed(2)}]`}
          tone={h.expectancyCiLow > 0 ? 'teal' : h.expectancyR > 0 ? 'yellow' : 'red'}
        />
        <StatTile
          label="Top-10 companion WR"
          value={`${h.top10WrPct}%`}
          sub={`${h.top10W}W / ${h.top10L}L / ${h.top10I}I`}
          tone="text"
        />
        <StatTile
          label="Gate edge vs top-10"
          value={`${edgePts >= 0 ? '+' : ''}${edgePts} pts`}
          sub={`${h.runIdCount} distinct run_ids`}
          tone={edgePts >= 5 ? 'teal' : edgePts > 0 ? 'yellow' : 'red'}
        />
      </div>

      {/* Per-setup table */}
      {corpus.perSetup.length > 0 && (
        <div>
          <div className="text-[11px] uppercase tracking-wide text-sub mb-2">
            Per-setup expectancy (2R cap, WIN=+2R / LOSS=-1R)
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[11px] border-collapse">
              <thead>
                <tr className="text-[10px] uppercase tracking-wide text-sub">
                  <th className="text-left px-2 py-1 border-b border-border">Setup</th>
                  <th className="text-right px-2 py-1 border-b border-border">N</th>
                  <th className="text-right px-2 py-1 border-b border-border">WR</th>
                  <th className="text-right px-2 py-1 border-b border-border">E[R]</th>
                  <th className="text-left px-2 py-1 border-b border-border">95% CI on E[R]</th>
                  <th className="text-left px-2 py-1 border-b border-border">Verdict</th>
                </tr>
              </thead>
              <tbody>
                {corpus.perSetup.map((r) => (
                  <tr key={r.setup} className="border-b border-border/50">
                    <td className="px-2 py-1 font-mono text-text">{r.setup}</td>
                    <td className="px-2 py-1 text-right text-text/85">{r.n}</td>
                    <td className={`px-2 py-1 text-right font-semibold ${wrColor(r.wrPct)}`}>
                      {r.wrPct}%
                    </td>
                    <td className={`px-2 py-1 text-right font-semibold ${expColor(r.expR)}`}>
                      {r.expR >= 0 ? '+' : ''}
                      {r.expR.toFixed(2)}R
                    </td>
                    <td className="px-2 py-1 text-sub">
                      {r.ciLow !== null && r.ciHigh !== null
                        ? `[${r.ciLow >= 0 ? '+' : ''}${r.ciLow.toFixed(
                            2
                          )}, ${r.ciHigh >= 0 ? '+' : ''}${r.ciHigh.toFixed(2)}]`
                        : '—'}
                    </td>
                    <td className="px-2 py-1 text-text/85">{r.verdict}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Month-over-month */}
      {corpus.perMonth.length > 0 && (
        <div>
          <div className="text-[11px] uppercase tracking-wide text-sub mb-2">
            Month-over-month (top-tier vs top-10)
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[11px] border-collapse">
              <thead>
                <tr className="text-[10px] uppercase tracking-wide text-sub">
                  <th className="text-left px-2 py-1 border-b border-border">Period</th>
                  <th className="text-left px-2 py-1 border-b border-border">Range</th>
                  <th className="text-right px-2 py-1 border-b border-border">W/L/I</th>
                  <th className="text-right px-2 py-1 border-b border-border">Top-tier WR</th>
                  <th className="text-right px-2 py-1 border-b border-border">Top-10 WR</th>
                  <th className="text-right px-2 py-1 border-b border-border">Δ pts</th>
                </tr>
              </thead>
              <tbody>
                {corpus.perMonth.map((r) => (
                  <tr key={r.label + r.range} className="border-b border-border/50">
                    <td className="px-2 py-1 text-text">{r.label}</td>
                    <td className="px-2 py-1 text-sub">{r.range || '—'}</td>
                    <td className="px-2 py-1 text-right text-text/85">
                      {r.w}/{r.l}/{r.i}
                    </td>
                    <td className={`px-2 py-1 text-right font-semibold ${wrColor(r.wrPct)}`}>
                      {r.wrPct}%
                    </td>
                    <td className="px-2 py-1 text-right text-text/85">
                      {r.top10WrPct !== null ? `${r.top10WrPct}%` : '—'}
                    </td>
                    <td
                      className={`px-2 py-1 text-right font-semibold ${
                        r.deltaPts === null
                          ? 'text-sub'
                          : r.deltaPts > 0
                            ? 'text-teal'
                            : r.deltaPts < 0
                              ? 'text-red'
                              : 'text-sub'
                      }`}
                    >
                      {r.deltaPts === null
                        ? '—'
                        : r.deltaPts === 0
                          ? '0'
                          : `${r.deltaPts > 0 ? '+' : ''}${r.deltaPts}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Daily log (recent 20 days) */}
      {corpus.dailyLog.length > 0 && (
        <div>
          <div className="text-[11px] uppercase tracking-wide text-sub mb-2">
            Daily log extension — newest first ({corpus.dailyLog.length} days)
          </div>
          <div className="overflow-x-auto max-h-[260px] overflow-y-auto">
            <table className="w-full text-[11px] border-collapse">
              <thead className="sticky top-0 bg-surface">
                <tr className="text-[10px] uppercase tracking-wide text-sub">
                  <th className="text-left px-2 py-1 border-b border-border">Date</th>
                  <th className="text-left px-2 py-1 border-b border-border">
                    Top-tier names
                  </th>
                  <th className="text-right px-2 py-1 border-b border-border">N</th>
                  <th className="text-left px-2 py-1 border-b border-border">W/L</th>
                  <th className="text-left px-2 py-1 border-b border-border">Notes</th>
                </tr>
              </thead>
              <tbody>
                {corpus.dailyLog.map((r) => (
                  <tr key={r.date} className="border-b border-border/50">
                    <td className="px-2 py-1 font-mono text-text">{r.date}</td>
                    <td className="px-2 py-1 text-text/85">{r.topTierNames}</td>
                    <td className="px-2 py-1 text-right text-text/85">{r.topTierN}</td>
                    <td className="px-2 py-1 text-text/85">{r.topTierWL}</td>
                    <td className="px-2 py-1 text-sub">{r.notes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Expandable full rollup markdown */}
      {corpus.rollupMarkdown && (
        <div className="border-t border-border pt-3">
          <button
            onClick={() => setShowRollup((s) => !s)}
            className="flex items-center justify-between w-full text-left"
          >
            <span className="text-xs font-semibold text-text">
              Full 6-month rollup notes
            </span>
            <span className="text-[10px] text-sub uppercase tracking-wider">
              {showRollup ? 'Hide' : 'Show'}
            </span>
          </button>
          {showRollup && (
            <div className="mt-3 max-h-[500px] overflow-y-auto prose-sm">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  h1: ({ children }) => (
                    <h1 className="text-base font-bold text-text mb-2">{children}</h1>
                  ),
                  h2: ({ children }) => (
                    <h2 className="text-sm font-semibold text-text mt-4 mb-2">
                      {children}
                    </h2>
                  ),
                  h3: ({ children }) => (
                    <h3 className="text-xs font-semibold text-text mt-3 mb-1 uppercase tracking-wide">
                      {children}
                    </h3>
                  ),
                  p: ({ children }) => (
                    <p className="text-xs text-text/85 leading-relaxed mb-2">{children}</p>
                  ),
                  strong: ({ children }) => (
                    <strong className="font-semibold text-text">{children}</strong>
                  ),
                  ul: ({ children }) => (
                    <ul className="list-disc pl-5 mb-2 space-y-1">{children}</ul>
                  ),
                  li: ({ children }) => (
                    <li className="text-xs text-text/85 leading-relaxed">{children}</li>
                  ),
                  code: ({ children }) => (
                    <code className="bg-bg rounded px-1 py-0.5 text-[11px] font-mono text-teal/80">
                      {children}
                    </code>
                  ),
                  table: ({ children }) => (
                    <div className="overflow-x-auto mb-3">
                      <table className="w-full text-[11px] border-collapse">
                        {children}
                      </table>
                    </div>
                  ),
                  th: ({ children }) => (
                    <th className="text-left px-2 py-1 text-[10px] uppercase tracking-wide text-sub border-b border-border">
                      {children}
                    </th>
                  ),
                  td: ({ children }) => (
                    <td className="px-2 py-1 text-[11px] text-text/85 border-b border-border/50">
                      {children}
                    </td>
                  ),
                }}
              >
                {corpus.rollupMarkdown}
              </ReactMarkdown>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
