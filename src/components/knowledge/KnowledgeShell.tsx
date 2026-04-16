'use client'

import { useEffect, useState } from 'react'
import type { VaultNote, VaultPayload } from '@/lib/types'
import { VaultSidebar } from './VaultSidebar'

export function KnowledgeShell({
  activeSlug,
  children,
}: {
  activeSlug: string
  children: (notes: VaultNote[]) => React.ReactNode
}) {
  const [notes, setNotes] = useState<VaultNote[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/vault')
      .then((r) => r.json())
      .then((data: VaultPayload) => {
        setNotes(data.notes || [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100dvh-var(--nav-h))]">
        <div className="text-sub text-sm">Loading vault...</div>
      </div>
    )
  }

  if (notes.length === 0) {
    return (
      <div className="flex items-center justify-center h-[calc(100dvh-var(--nav-h))]">
        <div className="text-center max-w-md">
          <div className="text-2xl mb-3 text-sub">No notes synced</div>
          <p className="text-sm text-sub mb-4">
            Run the vault sync script to push your Claude Vault content here.
          </p>
          <pre className="bg-surface rounded p-3 text-xs font-mono text-teal text-left">
            python3 ~/code/aiedge/site/scripts/sync_vault.py https://www.aiedge.trade
          </pre>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col md:flex-row md:h-[calc(100dvh-var(--nav-h))]">
      <VaultSidebar notes={notes} activeSlug={activeSlug} />
      {children(notes)}
    </div>
  )
}
