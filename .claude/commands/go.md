# /go - Quality Check, Prove, Go Live

Use this closer when Will says `go`, `/go`, `go live`, or asks to ship the current work.

The contract is:
1. Quality check the work.
2. Show Will the proof of the checks.
3. Go live without waiting for another confirmation.
4. Verify the live production URL after deployment.

## Rules

- Do not publish unverified work.
- Do not ask for permission after checks pass. The proof is the handoff point; then ship.
- Stop immediately on any failed check. Show the failing command and the relevant error.
- Commit only the files needed for the current task. Leave unrelated user changes alone.
- Prefer the repo's existing live path. For this site, production is `origin/main` -> Vercel -> `https://www.aiedge.trade`.
- Announce each phase with `[go] <phase>: <action>`.

## Quality Check

Run checks that match the change. For normal app code in this Next.js repo, use:

- `git diff --check`
- `npm run lint`
- `npm run build`

For chart work, also run the browser smoke test against a running local server:

- `npm run test:chart`

When a local dev server is already running, verify the affected route with `curl -I`, for example:

- `curl -I --max-time 10 http://127.0.0.1:3000/chart`

For docs-only command changes, `git diff --check` is enough unless the docs affect generated output or app behavior.

## Proof To Send Before Publishing

Before pushing, send a concise proof block:

- Files changed
- Checks run and passed
- Local route, browser smoke-test result, or other runtime verification, when applicable
- Any checks intentionally skipped and why

Do not end the turn after this proof. Continue directly to publishing.

## Publish

1. Fetch `origin main`.
2. Confirm the branch is not behind `origin/main`.
3. Commit with a short imperative message.
4. Push the exact commit to production:
   - `git push origin HEAD:main`

If the push is rejected because production moved, fetch, reconcile carefully, rerun checks, then push.

## Live Verification

After pushing:

1. Use `vercel ls` or `vercel inspect <deployment-url>` to find the new Production deployment.
2. Poll until the deployment is `Ready`.
3. Verify the production route with `curl -I`, usually:
   - `curl -I --max-time 20 https://www.aiedge.trade/chart`
4. Report the commit, deployment URL, and live HTTP result.

Only say the work is live after the Production deployment is Ready and the live route responds successfully.
