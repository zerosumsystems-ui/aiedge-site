'use client'

import Link from 'next/link'
import type { RecentResearchNote } from '@/lib/types'

function folderTone(folder: string): string {
  if (folder.startsWith('Scanner/methodology')) return 'text-teal'
  if (folder.startsWith('Scanner/backtests')) return 'text-yellow'
  if (folder.startsWith('Journal')) return 'text-orange'
  if (folder.startsWith('Market')) return 'text-red'
  return 'text-sub'
}

function folderLabel(folder: string): string {
  const parts = folder.split('/')
  return parts.slice(0, 2).join(' · ')
}

export function RecentResearchPanel({ notes }: { notes: RecentResearchNote[] }) {
  if (notes.length === 0) return null

  return (
    <section className="bg-surface border border-border rounded-lg p-4 space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold text-text">
          Recent Research
          <span className="text-sub font-normal ml-2 text-[11px]">
            output from scheduled routines · {notes.length} notes
          </span>
        </h2>
        <Link
          href="/knowledge"
          className="text-[11px] text-teal/80 hover:text-teal"
        >
          Knowledge base →
        </Link>
      </div>

      <ul className="divide-y divide-border/50">
        {notes.map((note) => (
          <li key={note.slug} className="py-2">
            <Link
              href={`/knowledge/${note.slug
                .split('/')
                .map(encodeURIComponent)
                .join('/')}`}
              className="group block"
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-xs font-semibold text-text group-hover:text-teal transition-colors">
                  {note.title}
                </span>
                <span className="text-[10px] font-mono text-sub shrink-0">
                  {note.date || '—'}
                </span>
              </div>
              <div className="mt-0.5 flex items-baseline gap-2">
                <span
                  className={`text-[10px] uppercase tracking-wide ${folderTone(
                    note.folder
                  )}`}
                >
                  {folderLabel(note.folder)}
                </span>
                <span className="text-[10px] font-mono text-sub/70">
                  {note.filename}
                </span>
              </div>
              {note.excerpt && (
                <p className="mt-1 text-[11px] text-text/75 leading-relaxed line-clamp-2">
                  {note.excerpt}
                </p>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
