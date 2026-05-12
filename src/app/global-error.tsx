"use client"

/**
 * Top-level error boundary. Next.js renders this when an uncaught error
 * bubbles out of a route or component during render. Logs the error to
 * the console (which Vercel captures into runtime logs) and shows a
 * minimal recovery UI so the user isn't left staring at a blank page.
 *
 * Per Next.js convention this file replaces the whole document on
 * error, including <html> and <body>.
 */

import { useEffect } from "react"

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Tagged so Vercel's log search can find chart crashes specifically.
    console.error("[global-error]", {
      message: error.message,
      digest: error.digest,
      stack: error.stack,
    })
  }, [error])

  return (
    <html lang="en" className="dark">
      <body className="flex min-h-screen flex-col items-center justify-center bg-bg px-6 text-text">
        <div className="w-full max-w-md rounded-md border border-border bg-surface p-6 text-center">
          <h1 className="mb-3 font-mono text-base font-semibold text-red">Something broke</h1>
          <p className="mb-5 text-sm leading-relaxed text-sub">
            The page hit an unhandled error. The full trace is in the server logs.
            Try reloading; if it keeps happening please screenshot this and share.
          </p>
          {error.digest ? (
            <p className="mb-5 break-all font-mono text-[11px] text-sub/60">
              ref: {error.digest}
            </p>
          ) : null}
          <button
            type="button"
            onClick={reset}
            className="rounded-md border border-border bg-bg px-4 py-2 text-sm font-medium text-text hover:border-border-hover"
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  )
}
