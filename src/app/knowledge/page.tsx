'use client'

import Link from 'next/link'
import type { VaultNote } from '@/lib/types'
import { KnowledgeShell } from '@/components/knowledge/KnowledgeShell'

const FOLDER_DESCRIPTIONS: Record<string, string> = {
  'Brooks PA': 'Universal price action concepts from Al Brooks',
  'Scanner': 'How we implement Brooks concepts in the scanner engine',
  'Journal': 'Calibration log — reads, backtests, mistakes',
  'Market': 'Context that accumulates — day types, instrument quirks',
  'Self-Eval': 'Brooks calibration loop — blind reads vs narration',
  'Meta': 'Vault rules and governance',
}

function groupByTopFolder(notes: VaultNote[]): Record<string, VaultNote[]> {
  const groups: Record<string, VaultNote[]> = {}
  for (const note of notes) {
    const top = note.folder.split('/')[0] || 'Uncategorized'
    if (!groups[top]) groups[top] = []
    groups[top].push(note)
  }
  return groups
}

function KnowledgeLanding({ notes }: { notes: VaultNote[] }) {
  const groups = groupByTopFolder(notes)
  const totalLinks = notes.reduce((sum, n) => sum + n.wikiLinks.length, 0)

  return (
    <article className="flex-1 md:overflow-y-auto md:h-[calc(100dvh-var(--nav-h))] p-4 md:p-6">
      <div className="max-w-3xl">
        <h1 className="text-2xl font-bold text-text mb-1">Knowledge Base</h1>
        <p className="text-sm text-sub mb-6">
          {notes.length} notes &middot; {totalLinks} wiki-links
        </p>

        <div className="grid gap-4">
          {Object.entries(groups)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([folder, folderNotes]) => (
              <div key={folder} className="bg-surface rounded-lg border border-border p-4">
                <h2 className="text-base font-semibold text-text mb-1">{folder}</h2>
                {FOLDER_DESCRIPTIONS[folder] && (
                  <p className="text-xs text-sub mb-3">{FOLDER_DESCRIPTIONS[folder]}</p>
                )}
                <div className="flex flex-wrap gap-2">
                  {folderNotes
                    .sort((a, b) => a.title.localeCompare(b.title))
                    .map((note) => (
                      <Link
                        key={note.slug}
                        href={`/knowledge/${note.slug.split('/').map(encodeURIComponent).join('/')}`}
                        className="inline-flex items-center gap-1 px-2.5 py-1 bg-bg rounded text-xs text-text/80 hover:text-teal border border-border/50 hover:border-teal/30 transition-colors"
                      >
                        {note.title}
                        {note.wikiLinks.length > 0 && (
                          <span className="text-[10px] text-gray ml-0.5">
                            {note.wikiLinks.length}→
                          </span>
                        )}
                      </Link>
                    ))}
                </div>
              </div>
            ))}
        </div>
      </div>
    </article>
  )
}

export default function KnowledgePage() {
  return (
    <KnowledgeShell activeSlug="">
      {(notes) => <KnowledgeLanding notes={notes} />}
    </KnowledgeShell>
  )
}
