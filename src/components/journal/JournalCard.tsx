'use client'

import type { JournalEntry, JournalEntryType } from '@/lib/types'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import Link from 'next/link'

const TYPE_STYLES: Record<JournalEntryType, { bg: string; text: string; label: string }> = {
  daily_read: { bg: 'bg-teal/[.15]', text: 'text-teal', label: 'Daily Read' },
  mistake: { bg: 'bg-red/[.15]', text: 'text-red', label: 'Mistake' },
  lesson: { bg: 'bg-yellow/[.15]', text: 'text-yellow', label: 'Lesson' },
  audit_note: { bg: 'bg-orange/[.13]', text: 'text-orange', label: 'Audit Note' },
}

export function JournalCard({ entry }: { entry: JournalEntry }) {
  const { type, title, content, linkedTickers, linkedVaultNotes, source } = entry
  const style = TYPE_STYLES[type] || TYPE_STYLES.audit_note

  return (
    <details className="bg-surface border border-border rounded-lg mb-2 overflow-hidden hover:border-border-hover hover:bg-surface-hover">
      <summary className="list-none cursor-pointer p-3 flex items-center gap-3 select-none [&::-webkit-details-marker]:hidden">
        {/* Type badge */}
        <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold tracking-wide border border-current/20 whitespace-nowrap ${style.bg} ${style.text}`}>
          {style.label}
        </span>

        {/* Title */}
        <span className="text-sm text-text font-medium flex-1 truncate">{title}</span>

        {/* Linked tickers */}
        {linkedTickers.length > 0 && (
          <div className="flex gap-1">
            {linkedTickers.slice(0, 3).map((t) => (
              <Link
                key={t}
                href={`/symbol/${encodeURIComponent(t)}`}
                onClick={(e) => e.stopPropagation()}
                className="text-[10px] text-sub hover:text-teal bg-bg rounded px-1.5 py-0.5 transition-colors"
                title={`Open ${t} — scanner + trades + fills + journal`}
              >
                {t}
              </Link>
            ))}
            {linkedTickers.length > 3 && (
              <span className="text-[10px] text-gray">+{linkedTickers.length - 3}</span>
            )}
          </div>
        )}

        {/* Source */}
        <span className="text-[10px] text-gray">{source}</span>
      </summary>

      {/* Expanded content */}
      <div className="border-t border-border p-4 animate-[fadeIn_0.15s_ease]">
        <div className="prose-sm max-w-3xl">
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
            {content}
          </ReactMarkdown>
        </div>

        {/* Linked vault notes */}
        {linkedVaultNotes.length > 0 && (
          <div className="mt-3 pt-3 border-t border-border/50">
            <div className="text-[10px] uppercase tracking-wider text-sub mb-1.5 font-semibold">Related Notes</div>
            <div className="flex flex-wrap gap-1.5">
              {linkedVaultNotes.map((slug) => (
                <Link
                  key={slug}
                  href={`/knowledge/${slug}`}
                  className="text-[11px] text-teal hover:text-teal/80 bg-teal/[.08] rounded px-2 py-0.5 border border-teal/20"
                >
                  {slug.split('/').pop()}
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </details>
  )
}
