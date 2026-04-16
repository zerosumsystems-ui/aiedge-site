'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV_ITEMS = [
  { href: '/', label: 'Scanner' },
  { href: '/patterns', label: 'Patterns' },
  { href: '/history', label: 'History' },
  { href: '/trades', label: 'Trades' },
  { href: '/journal', label: 'Journal' },
  { href: '/review', label: 'Review' },
  { href: '/progress', label: 'Progress' },
  { href: '/knowledge', label: 'Knowledge' },
]

type Props = { userEmail: string | null }

export function SiteNav({ userEmail }: Props) {
  const pathname = usePathname()

  // Hide the nav on the login flow — those pages render standalone.
  if (pathname.startsWith('/login') || pathname.startsWith('/auth/')) {
    return null
  }

  return (
    <nav
      className="flex items-center px-4 border-b border-border bg-surface/80 backdrop-blur-sm shrink-0 sticky top-0 z-40"
      style={{
        height: 'var(--nav-h)',
        paddingTop: 'env(safe-area-inset-top)',
      }}
    >
      <Link href="/" className="text-sm font-bold text-teal tracking-tight mr-4 shrink-0">
        AI Edge
      </Link>
      <div className="flex gap-1 overflow-x-auto scrollbar-none flex-1">
        {NAV_ITEMS.map((item) => {
          const active =
            item.href === '/'
              ? pathname === '/'
              : pathname.startsWith(item.href)

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`px-3 py-2 sm:py-1.5 rounded text-xs font-medium transition-colors ${
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

      {userEmail ? (
        <div className="flex items-center gap-2 ml-3 shrink-0">
          <Link
            href="/account"
            className="text-xs text-sub hover:text-text max-w-[14ch] truncate px-2 py-1 rounded hover:bg-bg"
            title={`${userEmail} \u2014 account settings`}
          >
            <span className="hidden sm:inline">{userEmail}</span>
            <span className="sm:hidden">Account</span>
          </Link>
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className="text-xs text-sub hover:text-text px-2 py-1 rounded hover:bg-bg"
            >
              Sign out
            </button>
          </form>
        </div>
      ) : (
        <Link
          href="/login"
          className="text-xs text-sub hover:text-text ml-3 shrink-0 px-2 py-1 rounded hover:bg-bg"
        >
          Sign in
        </Link>
      )}
    </nav>
  )
}
