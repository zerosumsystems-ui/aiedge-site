'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { MobileNavDrawer } from './MobileNavDrawer'

const NAV_ITEMS = [
  { href: '/', label: 'Scanner' },
  { href: '/patterns', label: 'Patterns' },
  { href: '/history', label: 'History' },
  { href: '/trades', label: 'Trades' },
  { href: '/journal', label: 'Journal' },
  { href: '/review', label: 'Review' },
  { href: '/routines', label: 'Routines' },
  { href: '/brooks', label: 'Brooks' },
]

type Props = { userEmail: string | null }

export function SiteNav({ userEmail }: Props) {
  const pathname = usePathname()
  const [menuOpen, setMenuOpen] = useState(false)

  // Hide the nav on the login flow — those pages render standalone.
  if (pathname.startsWith('/login') || pathname.startsWith('/auth/')) {
    return null
  }

  // Active-route label for the mobile nav header ("Scanner", "Journal", …).
  const activeItem =
    NAV_ITEMS.find((item) =>
      item.href === '/' ? pathname === '/' : pathname.startsWith(item.href)
    ) ?? NAV_ITEMS[0]

  return (
    <>
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

        {/* Desktop: horizontal nav. Hidden below md so 9 items don't cram the iPhone bar. */}
        <div className="hidden md:flex gap-1 overflow-x-auto scrollbar-none flex-1">
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

        {/* Mobile: current page label + hamburger icon. Taps open the drawer. */}
        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          aria-label="Open navigation"
          className="md:hidden flex-1 flex items-center justify-between px-2 py-1.5 rounded text-xs font-medium text-text hover:bg-bg min-w-0"
        >
          <span className="truncate">{activeItem.label}</span>
          <svg
            width="18"
            height="18"
            viewBox="0 0 18 18"
            fill="none"
            aria-hidden="true"
            className="shrink-0 text-sub"
          >
            <path
              d="M3 5h12M3 9h12M3 13h12"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
            />
          </svg>
        </button>

        {/* Account / Sign out — only on desktop. Mobile puts them inside the drawer. */}
        {userEmail ? (
          <div className="hidden md:flex items-center gap-2 ml-3 shrink-0">
            <Link
              href="/account"
              className="text-xs text-sub hover:text-text max-w-[14ch] truncate px-2 py-1 rounded hover:bg-bg"
              title={`${userEmail} \u2014 account settings`}
            >
              {userEmail}
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
            className="hidden md:inline-block text-xs text-sub hover:text-text ml-3 shrink-0 px-2 py-1 rounded hover:bg-bg"
          >
            Sign in
          </Link>
        )}
      </nav>

      <MobileNavDrawer
        items={NAV_ITEMS}
        userEmail={userEmail}
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
      />
    </>
  )
}
