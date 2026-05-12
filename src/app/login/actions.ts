'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { isAllowed } from '@/lib/auth/allowlist'

export type LoginState = {
  error?: string
  sent?: boolean
  email?: string
  mode?: 'magic' | 'password'
  intent?: 'signin' | 'setup'
}

function safeNextPath(value: string): string {
  return value.startsWith('/') && !value.startsWith('//') ? value : '/'
}

/**
 * Send a magic-link email. Allowlist is checked up-front so we don't leak
 * confirmation emails to uninvited addresses. The email template uses
 * {{ .TokenHash }} pointing at /auth/confirm, which avoids the PKCE
 * code-verifier cookie (broken in iOS Mail / Gmail in-app browsers).
 */
export async function sendMagicLink(
  _prev: LoginState,
  formData: FormData
): Promise<LoginState> {
  const rawEmail = String(formData.get('email') ?? '').trim()
  // Two submit buttons share this action: the primary "Send magic link"
  // uses the requested `next` (defaults /), while the "Set a password"
  // button sets intent=setup to land the user on /account after sign-in.
  const intent = String(formData.get('intent') ?? 'signin')
  const requestedNext = String(formData.get('next') ?? '/') || '/'
  const next = intent === 'setup' ? '/account' : safeNextPath(requestedNext)

  if (!rawEmail) return { error: 'Enter an email address.', mode: 'magic' }
  if (!isAllowed(rawEmail)) {
    return {
      error: 'This email isn\u2019t on the invite list.',
      email: rawEmail,
      mode: 'magic',
    }
  }

  const origin = await getOrigin()
  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithOtp({
    email: rawEmail,
    options: {
      shouldCreateUser: true,
      emailRedirectTo: `${origin}/auth/confirm?next=${encodeURIComponent(next)}`,
    },
  })

  if (error) return { error: error.message, email: rawEmail, mode: 'magic' }
  return {
    sent: true,
    email: rawEmail,
    mode: 'magic',
    intent: intent === 'setup' ? 'setup' : 'signin',
  }
}

/**
 * Password login. Allowlist check first, then Supabase verifies. On success
 * the session cookie is set by @supabase/ssr's server client and we redirect
 * to `next`. If the user hasn't set a password yet (magic-link-only account),
 * the error from Supabase is "Invalid login credentials" — we surface that
 * with a hint to set a password via /account.
 */
export async function signInWithPassword(
  _prev: LoginState,
  formData: FormData
): Promise<LoginState> {
  const rawEmail = String(formData.get('email') ?? '').trim()
  const password = String(formData.get('password') ?? '')
  const next = safeNextPath(String(formData.get('next') ?? '/') || '/')

  if (!rawEmail || !password) {
    return {
      error: 'Enter your email and password.',
      email: rawEmail,
      mode: 'password',
    }
  }

  if (!isAllowed(rawEmail)) {
    return {
      error: 'This email isn\u2019t on the invite list.',
      email: rawEmail,
      mode: 'password',
    }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({
    email: rawEmail,
    password,
  })

  if (error) {
    // Generic message — don't leak whether the account exists or not.
    return {
      error: 'Wrong email or password. If you haven\u2019t set a password yet, use the magic link instead.',
      email: rawEmail,
      mode: 'password',
    }
  }

  redirect(next)
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}

async function getOrigin(): Promise<string> {
  const hdrs = await headers()
  const proto = hdrs.get('x-forwarded-proto') ?? 'http'
  const host = hdrs.get('x-forwarded-host') ?? hdrs.get('host')
  return `${proto}://${host}`
}
