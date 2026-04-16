'use client'

import { useEffect, useState } from 'react'
import type { AuditPayload } from '@/lib/types'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { AgreementBar } from '@/components/review/AgreementBar'
import { BrooksTop5, ScannerTop5 } from '@/components/review/Top5Panel'
import { FailureModeCard } from '@/components/review/FailureModeCard'
import { SymbolTable } from '@/components/review/SymbolTable'
import { AuditHistoryDrawer } from '@/components/review/AuditHistoryDrawer'

export default function ReviewPage() {
  const [data, setData] = useState<AuditPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showCritique, setShowCritique] = useState(false)

  useEffect(() => {
    fetch('/api/review')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then(setData)
      .catch((e) => setError(e.message))
  }, [])

  if (error) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8">
        <h1 className="text-lg font-bold text-text mb-2">Self-Review</h1>
        <p className="text-red text-sm">Failed to load: {error}</p>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="max-w-5xl mx-auto p-6">
        <div className="skeleton h-8 w-48 mb-2" />
        <div className="skeleton h-4 w-72 mb-6" />
        <div className="skeleton h-20 mb-4" />
        <div className="skeleton h-40 mb-4" />
        <div className="skeleton h-60" />
      </div>
    )
  }

  if (!data.latest) {
    return (
      <div className="flex items-center justify-center h-[calc(100dvh-var(--nav-h))]">
        <div className="text-center max-w-md">
          <div className="text-2xl mb-3 text-sub">No audit data yet</div>
          <p className="text-sm text-sub">
            Run a Brooks audit into{' '}
            <code className="text-teal/80 font-mono text-xs">~/code/aiedge/audits/</code>{' '}
            or sync via{' '}
            <code className="text-teal/80 font-mono text-xs">
              python3 scripts/sync_audit.py
            </code>
            .
          </p>
        </div>
      </div>
    )
  }

  const { latest, symbols, history } = data

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-lg font-bold text-text">Self-Review</h1>
        <p className="text-xs text-sub mt-0.5">
          Brooks audit · {latest.auditDate}
          {latest.auditTime && <> · {latest.auditTime}</>} ·{' '}
          {latest.symbolCount} symbols audited
        </p>
      </div>

      {/* History drawer */}
      <AuditHistoryDrawer history={history} activeDir={latest.auditDir} />

      {/* TL;DR */}
      {latest.summaryMarkdown && (
        <section className="bg-surface border border-border rounded-lg p-4">
          <h2 className="text-sm font-semibold text-text mb-3">Findings</h2>
          <div className="prose-sm max-h-[360px] overflow-y-auto">
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
                  <p className="text-xs text-text/85 leading-relaxed mb-3">{children}</p>
                ),
                strong: ({ children }) => (
                  <strong className="font-semibold text-text">{children}</strong>
                ),
                ul: ({ children }) => (
                  <ul className="list-disc pl-5 mb-3 space-y-1">{children}</ul>
                ),
                ol: ({ children }) => (
                  <ol className="list-decimal pl-5 mb-3 space-y-1">{children}</ol>
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
                a: ({ children }) => (
                  <span className="text-teal/80">{children}</span>
                ),
              }}
            >
              {latest.summaryMarkdown}
            </ReactMarkdown>
          </div>
        </section>
      )}

      {/* Distributions */}
      <section className="bg-surface border border-border rounded-lg p-4 space-y-4">
        <h2 className="text-sm font-semibold text-text">Agreement & Divergence</h2>
        <AgreementBar
          entries={latest.agreementDistribution}
          label="Scanner signal vs Brooks decision"
        />
        <AgreementBar
          entries={latest.divergenceDistribution}
          label="URG rank vs Brooks quality rank"
        />
      </section>

      {/* Top 5 side by side */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-surface border border-border rounded-lg p-4">
          <h2 className="text-sm font-semibold text-text mb-3">
            Brooks&apos; Top 5
            <span className="text-sub font-normal ml-2 text-[11px]">
              by quality score
            </span>
          </h2>
          <BrooksTop5 rows={latest.brooksTop5} />
        </div>
        <div className="bg-surface border border-border rounded-lg p-4">
          <h2 className="text-sm font-semibold text-text mb-3">
            Scanner&apos;s Top 5
            <span className="text-sub font-normal ml-2 text-[11px]">by URG rank</span>
          </h2>
          <ScannerTop5 rows={latest.scannerTop5} />
        </div>
      </section>

      {/* Failure modes */}
      {latest.failureModes.length > 0 && (
        <section className="bg-surface border border-border rounded-lg p-4">
          <h2 className="text-sm font-semibold text-text mb-3">
            Failure Modes
            <span className="text-sub font-normal ml-2 text-[11px]">
              {latest.failureModes.length} identified
            </span>
          </h2>
          <div className="space-y-2">
            {latest.failureModes.map((m) => (
              <FailureModeCard key={m.id} mode={m} />
            ))}
          </div>
        </section>
      )}

      {/* Full symbol table */}
      {symbols.length > 0 && (
        <section className="bg-surface border border-border rounded-lg p-4">
          <h2 className="text-sm font-semibold text-text mb-3">
            All Symbols
            <span className="text-sub font-normal ml-2 text-[11px]">
              {symbols.length} audited — click row for detail
            </span>
          </h2>
          <SymbolTable rows={symbols} />
        </section>
      )}

      {/* Methodology critique (collapsible) */}
      {latest.methodologyCritiqueMarkdown && (
        <section className="bg-surface border border-border rounded-lg overflow-hidden">
          <button
            onClick={() => setShowCritique((s) => !s)}
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-surface-hover transition-colors"
          >
            <h2 className="text-sm font-semibold text-text">
              Full Methodology Critique
            </h2>
            <span className="text-[10px] text-sub uppercase tracking-wider">
              {showCritique ? 'Hide' : 'Show'}
            </span>
          </button>
          {showCritique && (
            <div className="border-t border-border p-4 max-h-[600px] overflow-y-auto animate-[fadeIn_0.15s_ease]">
              <div className="prose-sm">
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
                      <p className="text-xs text-text/85 leading-relaxed mb-3">
                        {children}
                      </p>
                    ),
                    strong: ({ children }) => (
                      <strong className="font-semibold text-text">{children}</strong>
                    ),
                    ul: ({ children }) => (
                      <ul className="list-disc pl-5 mb-3 space-y-1">{children}</ul>
                    ),
                    li: ({ children }) => (
                      <li className="text-xs text-text/85 leading-relaxed">
                        {children}
                      </li>
                    ),
                    code: ({ children }) => (
                      <code className="bg-bg rounded px-1 py-0.5 text-[11px] font-mono text-teal/80">
                        {children}
                      </code>
                    ),
                    a: ({ children }) => (
                      <span className="text-teal/80">{children}</span>
                    ),
                  }}
                >
                  {latest.methodologyCritiqueMarkdown}
                </ReactMarkdown>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  )
}
