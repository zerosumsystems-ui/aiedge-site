# /ideas - Brain-dump triage and autonomous execution

Will pastes a free-form list of ideas; you turn it into a worked backlog and execute the safe, independent ones in parallel without further confirmation. `/ideas` never publishes to production — it produces ready-to-ship branches that Will runs `/go` on.

## Input

Whatever Will writes after `/ideas` — lists, paragraphs, voice transcripts. Accept all of it. If the body is empty, ask once for the dump, then stop.

## Phase 1 — Triage

Read every idea. Produce one backlog row per idea:

- **id** — short slug (`chart-zoom-pinch`, `watchlist-pin`)
- **summary** — one sentence, plain English
- **kind** — `feature` | `fix` | `refactor` | `chore` | `research`
- **risk** —
  - `safe` — local, reversible, no auth/payments/infra/deps changes
  - `review` — touches auth, payments, prod data shape, CI, dependencies, env vars, public routes, anything irreversible
  - `boundary` — smells like prop-firm / funded-account / firm-rotation / payout-eval / account-management per `AGENTS.md`
- **deps** — ids of other rows that must land first, or `none`
- **effort** — `S` (<30m), `M` (<2h), `L` (>2h or uncertain)

Print the table. Mark `boundary` rows with a STOP note — they are surfaced and dropped, never built.

## Phase 2 — Pick wave 1

Wave 1 = every row that is `safe`, has `deps: none`, and is `S` or `M`.

`review` rows wait for Will. `L` rows get a one-line "needs scoping" note and wait. Rows with deps wait for their parents.

Print the wave-1 list and a one-line in/out reason per row. This is information, not a gate — do not ask permission.

## Phase 3 — Execute in parallel

Spawn one subagent per wave-1 item, each with `isolation: "worktree"`. Send all spawn calls in a single message so they run concurrently.

Before spawning, do a quick search yourself for the files each item will touch — pass concrete paths into the prompt so the agent doesn't reinvent orientation.

Each agent prompt must include:

- The goal, in one paragraph.
- Concrete file paths to start from.
- The project's conventions: point at `AGENTS.md`, especially the "This is NOT the Next.js you know" note and the product boundary.
- Required proof before declaring done:
  - `git diff --check`
  - `npm run lint`
  - `npm run build`
  - For chart work: `npm run test:chart`
- A reminder: do not push to `main`, do not run `/go`, leave the branch in the worktree for Will.

If two wave-1 items touch the same files, serialize them — don't fight in worktrees.

## Phase 4 — Report

When all wave-1 agents return, produce one report:

- Per item: worktree path, branch, files changed, checks passed, anything skipped and why.
- Anything that failed mid-flight, with the exact failing command and error.
- Updated backlog: wave-1 items moved to `done` or `blocked`.
- Next wave: items now unblocked, plus `review` items waiting on Will.

## Rules

- Never build a `boundary` item. Surface it and stop.
- Never touch `review` items without Will's go-ahead.
- If a subagent discovers mid-task that the work is actually `review` or `boundary`, it stops, reports, and does not push.
- Keep each subagent's scope tight: one item, one branch. No drive-by refactors or cleanup.
- Trust but verify — read the actual diff each agent produced before reporting it as done.
