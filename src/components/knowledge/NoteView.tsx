'use client'

import Link from 'next/link'
import type { VaultNote } from '@/lib/types'
import { MarkdownRenderer } from './MarkdownRenderer'

function resolveWikiLink(target: string, allNotes: VaultNote[]): VaultNote | null {
  return (
    allNotes.find((n) => n.slug === target) ||
    allNotes.find((n) => n.filename.replace('.md', '').toLowerCase() === target.toLowerCase()) ||
    allNotes.find((n) => n.title.toLowerCase() === target.toLowerCase()) ||
    null
  )
}

export function NoteView({
  note,
  allNotes,
}: {
  note: VaultNote
  allNotes: VaultNote[]
}) {
  const resolvedLinks = note.wikiLinks
    .map((target) => ({ target, note: resolveWikiLink(target, allNotes) }))
    .filter((l) => l.note !== null)

  return (
    <article className="flex-1 md:overflow-y-auto md:h-[calc(100dvh-var(--nav-h))]">
      <div className="p-4 pb-2 md:p-6 md:pb-2">
        {/* Breadcrumb */}
        <div className="flex items-center gap-1.5 text-[11px] text-sub mb-4">
          <Link href="/knowledge" className="hover:text-text transition-colors">Knowledge</Link>
          {note.folder.split('/').map((part, i, arr) => (
            <span key={i} className="flex items-center gap-1.5">
              <span className="text-gray">/</span>
              <span className={i === arr.length - 1 ? 'text-text/70' : ''}>{part}</span>
            </span>
          ))}
        </div>

        {/* Content */}
        <MarkdownRenderer note={note} allNotes={allNotes} />
      </div>

      {/* Wiki-link references panel */}
      {resolvedLinks.length > 0 && (
        <div className="mx-4 md:mx-6 mt-6 mb-8 p-4 bg-surface rounded-lg border border-border">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-sub mb-3">
            Linked Notes ({resolvedLinks.length})
          </h3>
          <div className="flex flex-wrap gap-2">
            {resolvedLinks.map(({ target, note: linked }) => (
              <Link
                key={target}
                href={`/knowledge/${linked!.slug.split('/').map(encodeURIComponent).join('/')}`}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-bg rounded text-xs text-teal hover:text-teal/80 border border-border hover:border-teal/30 transition-colors"
              >
                <span className="text-[10px] text-gray">→</span>
                {linked!.title}
              </Link>
            ))}
          </div>
        </div>
      )}
    </article>
  )
}
