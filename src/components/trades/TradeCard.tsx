'use client'

import type { TradeRead, TradeDecision, AgreementLevel } from '@/lib/types'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

const DECISION_STYLES: Record<TradeDecision, string> = {
  BUY: 'bg-teal/[.18] text-teal border-teal/35',
  SELL: 'bg-red/[.18] text-red border-red/35',
  WAIT: 'bg-yellow/[.15] text-yellow border-yellow/30',
  AVOID: 'bg-gray/25 text-sub border-gray/45',
}

const AGREEMENT_STYLES: Record<AgreementLevel, string> = {
  AGREE: 'bg-teal/[.18] text-teal border-teal/35',
  PARTIAL: 'bg-yellow/[.15] text-yellow border-yellow/30',
  MINOR: 'bg-orange/[.13] text-orange border-orange/[.28]',
  MAJOR: 'bg-red/[.15] text-red border-red/30',
  INVERTED: 'bg-red/[.25] text-red border-red/45',
}

const OUTCOME_STYLES: Record<string, string> = {
  win: 'text-teal',
  loss: 'text-red',
  scratch: 'text-yellow',
  pending: 'text-sub',
  no_trade: 'text-gray',
}

function formatPhase(phase: string): string {
  return phase.replace(/_/g, ' ')
}

function formatSetup(setup: string): string {
  if (setup === 'none') return 'No setup'
  return setup.toUpperCase()
}

export function TradeCard({ trade }: { trade: TradeRead }) {
  const {
    ticker, date, time, rankScanner, urgScanner, signalScanner,
    phaseBrooks, alwaysInBrooks, strengthNet, setupBrooks,
    stopPrice, targetPrice, decisionBrooks, probabilityBrooks,
    rrBrooks, qualityScore, agreementVsScanner, agreementReason,
    contextMarkdown, annotationNotes, outcome, chartBase64,
  } = trade

  return (
    <details className="bg-surface border border-border rounded-lg mb-2 overflow-hidden group">
      <summary className="list-none cursor-pointer p-3 flex items-center gap-3 select-none [&::-webkit-details-marker]:hidden">
        {/* Ticker + date */}
        <div className="min-w-[80px]">
          <div className="text-base font-bold tracking-tight">{ticker}</div>
          <div className="text-[11px] text-sub">{date}</div>
        </div>

        {/* Phase + setup */}
        <div className="flex-1 min-w-0">
          <div className="text-xs text-text truncate">{formatPhase(phaseBrooks)}</div>
          <div className="text-[11px] text-sub">{formatSetup(setupBrooks)}</div>
        </div>

        {/* Quality score */}
        <div className="text-center w-12">
          <div className="text-sm font-bold text-text">{qualityScore.toFixed(1)}</div>
          <div className="text-[9px] text-sub uppercase tracking-wide">QTY</div>
        </div>

        {/* Probability + R:R */}
        <div className="text-center w-16">
          <div className="text-xs text-text tabular-nums">{probabilityBrooks}%</div>
          <div className="text-[11px] text-sub tabular-nums">{rrBrooks.toFixed(1)} R:R</div>
        </div>

        {/* Decision badge */}
        <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold tracking-wide whitespace-nowrap border ${DECISION_STYLES[decisionBrooks]}`}>
          {decisionBrooks}
        </span>

        {/* Agreement badge */}
        <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold tracking-wide whitespace-nowrap border ${AGREEMENT_STYLES[agreementVsScanner]}`}>
          {agreementVsScanner}
        </span>

        {/* Outcome */}
        <span className={`text-[11px] font-medium w-14 text-center ${OUTCOME_STYLES[outcome] || 'text-sub'}`}>
          {outcome === 'no_trade' ? 'no trade' : outcome}
        </span>
      </summary>

      {/* Expanded content */}
      <div className="border-t border-border p-4 space-y-4">
        {/* Key metrics row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <MetricBox label="Always-in" value={alwaysInBrooks.replace(/_/g, ' ')} />
          <MetricBox label="Strength" value={strengthNet} />
          <MetricBox label="Stop" value={stopPrice ? `$${stopPrice.toFixed(2)}` : '—'} />
          <MetricBox label="Target" value={targetPrice ? `$${targetPrice.toFixed(2)}` : '—'} />
        </div>

        {/* Scanner comparison */}
        <div className="bg-bg rounded-lg p-3">
          <div className="text-[10px] uppercase tracking-wider text-sub mb-2 font-semibold">Scanner vs Brooks</div>
          <div className="flex items-center gap-4 text-xs mb-2">
            <span className="text-sub">Scanner: <span className="text-text font-medium">#{rankScanner}</span> rank, <span className="text-text font-medium">{urgScanner.toFixed(1)}</span> URG, <span className="text-text font-medium">{signalScanner}</span></span>
          </div>
          <p className="text-xs text-text/80 leading-relaxed">{agreementReason}</p>
        </div>

        {/* Brooks read */}
        <div>
          <div className="text-[10px] uppercase tracking-wider text-sub mb-2 font-semibold">Brooks Read</div>
          <div className="prose-sm">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                p: ({ children }) => <p className="text-sm text-text/90 leading-relaxed mb-3">{children}</p>,
                strong: ({ children }) => <strong className="font-semibold text-text">{children}</strong>,
                h1: ({ children }) => <h1 className="text-lg font-bold text-text mb-2">{children}</h1>,
                h2: ({ children }) => <h2 className="text-base font-semibold text-text mt-4 mb-2">{children}</h2>,
                h3: ({ children }) => <h3 className="text-sm font-semibold text-text mt-3 mb-1">{children}</h3>,
                ul: ({ children }) => <ul className="list-disc pl-5 mb-3 space-y-1">{children}</ul>,
                ol: ({ children }) => <ol className="list-decimal pl-5 mb-3 space-y-1">{children}</ol>,
                li: ({ children }) => <li className="text-sm text-text/90">{children}</li>,
                code: ({ children }) => <code className="bg-bg rounded px-1.5 py-0.5 text-xs font-mono text-teal/80">{children}</code>,
                blockquote: ({ children }) => <blockquote className="border-l-2 border-teal/40 pl-4 my-3 text-sub italic">{children}</blockquote>,
              }}
            >
              {contextMarkdown}
            </ReactMarkdown>
          </div>
        </div>

        {/* Annotation notes */}
        {annotationNotes && (
          <div className="bg-bg rounded-lg p-3">
            <div className="text-[10px] uppercase tracking-wider text-sub mb-1 font-semibold">Annotations</div>
            <p className="text-xs text-text/80 leading-relaxed">{annotationNotes}</p>
          </div>
        )}

        {/* Chart */}
        {chartBase64 && (
          <div>
            <div className="text-[10px] uppercase tracking-wider text-sub mb-2 font-semibold">Chart</div>
            <img
              src={chartBase64.startsWith('data:') ? chartBase64 : `data:image/png;base64,${chartBase64}`}
              alt={`${ticker} chart`}
              className="rounded-lg border border-border w-full"
            />
          </div>
        )}

        {/* Time */}
        <div className="text-[10px] text-gray text-right">Read at {time}</div>
      </div>
    </details>
  )
}

function MetricBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-bg rounded-lg p-2">
      <div className="text-[9px] uppercase tracking-wider text-sub mb-0.5">{label}</div>
      <div className="text-xs text-text font-medium truncate">{value}</div>
    </div>
  )
}
