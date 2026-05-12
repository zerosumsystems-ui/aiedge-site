<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Go Live Workflow

When Will says `go`, `/go`, `go live`, or asks to ship current work, use this contract:

1. Quality check the work.
2. Show Will concise proof of the checks.
3. Go live without waiting for another confirmation.
4. Verify the production URL after deployment.

Do not publish unverified work. Stop immediately on any failed check and show the failing command plus the relevant error.

For normal app code, run:

- `git diff --check`
- `npm run lint`
- `npm run build`

For chart work, also run the browser smoke test against a running local server:

- `npm run test:chart`

If a local server is already running, verify the affected route with `curl -I`, for example:

- `curl -I --max-time 10 http://127.0.0.1:3000/chart`

Before publishing, report:

- Files changed
- Checks run and passed
- Local route or browser smoke-test result
- Any skipped check and why

Then publish by fetching `origin main`, confirming the branch is not behind `origin/main`, committing only the current task files, and pushing the exact commit to production with:

- `git push origin HEAD:main`

After pushing, use Vercel to find the new Production deployment, poll until it is `Ready`, then verify the live route. For chart work, verify:

- `curl -I --max-time 20 https://www.aiedge.trade/chart`

Only say work is live after the Production deployment is Ready and the live route responds successfully.
