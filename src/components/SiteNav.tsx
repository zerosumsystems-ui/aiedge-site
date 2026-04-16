'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV_ITEMS = [
  { href: '/', label: 'Scanner' },
  { href: '/patterns', label: 'Patterns' },
  { href: '/history', label: 'History' },
  { href: '/trades', label: 'Trades' },
  { href: '/journal', label: 'Journal' },
  { href: '/knowledge', label: 'Knowledge' },
]

export function SiteNav() {
  const pathname = usePathname()

  return (
    <nav className="h-12 flex items-center px-4 border-b border-border bg-surface shrink-0">
      <Link href="/" className="text-sm font-bold text-teal tracking-tight mr-6">
        AI Edge
      </Link>
      <div className="flex gap-1">
        {NAV_ITEMS.map((item) => {
          const active =
            item.href === '/'
              ? pathname === '/'
              : pathname.startsWith(item.href)

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                active
                  ? 'bg-teal/10 text-teal'
                  : 'text-sub hover:text-text hover:bg-bg'
              }`}
            >
              {item.label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
