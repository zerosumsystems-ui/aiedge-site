'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { VaultNote } from '@/lib/types'

interface FolderNode {
  name: string
  path: string
  children: FolderNode[]
  notes: VaultNote[]
}

function buildTree(notes: VaultNote[]): FolderNode {
  const root: FolderNode = { name: 'Vault', path: '', children: [], notes: [] }

  for (const note of notes) {
    const parts = note.folder.split('/')
    let current = root

    for (const part of parts) {
      if (!part) continue
      let child = current.children.find((c) => c.name === part)
      if (!child) {
        child = {
          name: part,
          path: current.path ? `${current.path}/${part}` : part,
          children: [],
          notes: [],
        }
        current.children.push(child)
      }
      current = child
    }

    current.notes.push(note)
  }

  return root
}

function FolderItem({
  node,
  activeSlug,
  depth,
}: {
  node: FolderNode
  activeSlug: string
  depth: number
}) {
  const [open, setOpen] = useState(true)
  const hasContent = node.notes.length > 0 || node.children.length > 0

  if (!hasContent) return null

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-1.5 px-2 py-2 md:py-1 text-left text-sub hover:text-text transition-colors"
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        <span className="text-[10px] opacity-60">{open ? '▾' : '▸'}</span>
        <span className="text-xs font-medium uppercase tracking-wide">{node.name}</span>
        <span className="ml-auto text-[10px] text-gray">{node.notes.length || ''}</span>
      </button>

      {open && (
        <div>
          {node.children
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((child) => (
              <FolderItem key={child.path} node={child} activeSlug={activeSlug} depth={depth + 1} />
            ))}
          {node.notes
            .sort((a, b) => a.title.localeCompare(b.title))
            .map((note) => (
              <Link
                key={note.slug}
                href={`/knowledge/${note.slug.split('/').map(encodeURIComponent).join('/')}`}
                className={`block truncate px-2 py-2 md:py-1 text-sm transition-colors ${
                  activeSlug === note.slug
                    ? 'bg-teal/10 text-teal border-l-2 border-teal'
                    : 'text-sub hover:text-text hover:bg-surface'
                }`}
                style={{ paddingLeft: `${(depth + 1) * 12 + 8}px` }}
              >
                {note.title}
              </Link>
            ))}
        </div>
      )}
    </div>
  )
}

export function VaultSidebar({
  notes,
  activeSlug,
}: {
  notes: VaultNote[]
  activeSlug: string
}) {
  const tree = buildTree(notes)
  // Mobile: collapsed by default; desktop ignores this and stays open.
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <>
      {/* Mobile toggle — shown below md only */}
      <button
        onClick={() => setMobileOpen((v) => !v)}
        className="md:hidden flex items-center justify-between w-full px-4 py-2 border-b border-border bg-surface text-left"
        aria-expanded={mobileOpen}
      >
        <span className="text-xs font-semibold uppercase tracking-widest text-sub">
          Knowledge Base
        </span>
        <span className="text-[11px] text-sub flex items-center gap-1.5">
          {notes.length} notes
          <span className="text-[10px] opacity-60">{mobileOpen ? '▾' : '▸'}</span>
        </span>
      </button>

      <nav
        className={`
          shrink-0 border-border overflow-y-auto
          md:block md:w-64 md:border-r md:h-[calc(100dvh-var(--nav-h))]
          ${mobileOpen ? 'block max-h-[50dvh] border-b' : 'hidden'}
        `}
      >
        {/* Desktop header — hidden on mobile since we have the toggle */}
        <div className="hidden md:block p-3 border-b border-border">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-sub">Knowledge Base</h2>
          <p className="text-[10px] text-gray mt-0.5">{notes.length} notes</p>
        </div>
        <div className="py-1">
          {tree.children
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((child) => (
              <FolderItem key={child.path} node={child} activeSlug={activeSlug} depth={0} />
            ))}
        </div>
      </nav>
    </>
  )
}
