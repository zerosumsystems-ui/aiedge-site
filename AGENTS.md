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

## Product Boundary

AIedge is for the public trading site and chart/research workflows only. Prop-firm portfolio content, funded-account strategy, firm rotation panels, payout/eval economics, or account-management tooling must never be added to this app or deployed to `aiedge.trade`.

If a branch, diff, generated page, API route, or deployment candidate contains prop-firm/account-rotation material, stop before publishing and report that it belongs outside AIedge.

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

## Cloud environment

Web sessions (claude.ai/code) read environment variables from the Claude Code
**Environment settings** UI, not from chat. Mirror the same values that live
in Vercel Production. The full list of vars the code reads is documented in
`.env.local.example` — that file is the single source of truth.

Conventions:

- Add new env vars to `.env.local.example` (with a comment explaining what
  reads them) before referencing `process.env.X` in code. Web sessions copy
  from that list into the cloud environment UI.
- Vercel and GitHub are handled via MCP servers attached to the session — do
  not store `VERCEL_TOKEN` or `GITHUB_TOKEN` in the environment.
- Linear is wired up via the hosted MCP server in `.mcp.json`
  (`https://mcp.linear.app/sse`). It uses OAuth on first use, so no token
  lives in the environment. In the Claude Code web UI, approve the server
  once under Connections; the desktop CLI picks it up automatically from
  `.mcp.json`.
- `SUPABASE_SERVICE_ROLE_KEY` is server-only. Never import it from a `"use
  client"` module.
- The Fly aggregator (`Dockerfile.live-bars`, `fly.live-bars.toml`) deploys
  via `.github/workflows/deploy-live-bars.yml` (on push to main when the
  aggregator files change, or via Actions → workflow_dispatch). The Mac
  mini path still works as a fallback. Web sessions can also run
  `fly status` / `fly logs` / `fly deploy` directly when `FLY_API_TOKEN`
  is set in the Claude Code Environment settings.

Repo-side configuration:

- `.claude/settings.json` allowlists the safe commands needed by the Go Live
  Workflow (`npm run lint/build/test:chart`, read-only git, `curl -I`) and
  registers a SessionStart hook.
- `.claude/hooks/session-start.sh` runs `npm ci` only when
  `package-lock.json` is newer than `node_modules`, so subsequent sessions
  start instantly.
