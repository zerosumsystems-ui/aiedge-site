import { createClient } from '@/lib/supabase/server'
import { PasswordForm } from './PasswordForm'

export const dynamic = 'force-dynamic'

/**
 * Signed-in account settings. The proxy already gates this path, but we
 * re-fetch the user server-side to render their email and bail defensively
 * if a mid-request sign-out ever slipped through.
 */
export default async function AccountPage() {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()

  if (!data.user) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-10">
        <h1 className="text-xl font-bold tracking-tight mb-1">Account</h1>
        <p className="text-sm text-sub mb-8">
          No active session. The site is public, so sign-in is optional.
        </p>
      </div>
    )
  }

  const createdAt = data.user.created_at
    ? new Date(data.user.created_at).toLocaleDateString('en-US', {
        year: 'numeric', month: 'short', day: 'numeric',
      })
    : null

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      <h1 className="text-xl font-bold tracking-tight mb-1">Account</h1>
      <p className="text-sm text-sub mb-8">Signed in as <span className="text-text">{data.user.email}</span>{createdAt ? ` since ${createdAt}` : ''}.</p>

      <section className="bg-surface border border-border rounded-[var(--radius)] p-6">
        <h2 className="text-sm font-medium mb-1">Password</h2>
        <p className="text-xs text-sub mb-5">
          Set a password so you can sign in instantly without waiting for a magic link.
          Your browser will save it to Keychain / autofill after the first use.
        </p>
        <PasswordForm />
      </section>

      <section className="bg-surface border border-border rounded-[var(--radius)] p-6 mt-4">
        <h2 className="text-sm font-medium mb-1">Sign out</h2>
        <p className="text-xs text-sub mb-5">End the session on this device.</p>
        <form action="/auth/signout" method="post">
          <button
            type="submit"
            className="text-sm text-red border border-red/30 px-4 py-2 rounded-[var(--radius)] hover:bg-red/10"
          >
            Sign out
          </button>
        </form>
      </section>
    </div>
  )
}
