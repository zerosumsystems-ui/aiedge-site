import { LoginForm } from './LoginForm'

type SearchParams = Promise<{ next?: string; error?: string }>

export default async function LoginPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const { next, error } = await searchParams

  const errorMessage =
    error === 'not_invited'
      ? 'That email isn\u2019t on the invite list.'
      : error === 'callback_failed'
      ? 'Sign-in link expired or already used. Try again.'
      : null

  return (
    <div className="min-h-[calc(100dvh-var(--nav-h))] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="text-teal font-bold tracking-tight text-lg mb-1">AI Edge</div>
          <div className="text-sub text-xs">Sign in to continue</div>
        </div>

        <div className="bg-surface border border-border rounded-[var(--radius)] p-6">
          <LoginForm next={next ?? '/'} initialError={errorMessage} />
        </div>

        <div className="mt-6 text-center text-xs text-sub">
          Invite-only. If you don&rsquo;t have access, ask Will.
        </div>
      </div>
    </div>
  )
}
