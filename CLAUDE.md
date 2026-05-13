@AGENTS.md

# Claude Notes

Use the repo-wide `AGENTS.md` instructions as the source of truth.

## Recognizing Will's intent

Will usually talks or types fast — he will not remember to type slash commands. Treat the commands below as **intent triggers you watch for**, not as syntax he has to use. When his message matches one, invoke the corresponding slash command's playbook directly.

| Command | Recognize when Will says / writes something like... |
|---|---|
| `/go` | "go", "/go", "go live", "ship it", "push it", "send it", "deploy", "ok ship" |
| `/smoke` | "check it", "run the checks", "did it pass?", "is it clean?", "lint and build", "validate", "sanity check" |
| `/logs` | "check the logs", "what's broken on prod", "any errors", "anything weird in prod", "health check", "what happened after the deploy" |
| `/rollback` | "roll back", "undo prod", "revert the last push", "back it out", "prod is broken" + intent to revert (not fix-forward) |
| `/ideas` | A free-form dump of two or more things to build, fix, or research — pasted, dictated, or stream-of-consciousness. Trigger on the dump, not on the word "ideas." |

When in doubt about which one fits, ask in one sentence. Do not require Will to use the exact slash syntax.

## Standing skills (auto-load — no trigger needed)

- `aiedge-chart` — anything under `/chart`, indicators, ƒx menu, watchlist, overlays, chart settings.
- `aiedge-live-data` — `api/bars/*`, `api/live-bars/*`, the aggregator, the operator diagnostic endpoint.

## Guardrails

- The boundary hook (`.claude/hooks/check-boundary.sh`) blocks `git push` to `main` if the diff carries prop-firm / funded-account / firm-rotation / payout-eval / account-rotation content. If it fires, do not work around it — surface to Will and stop.
- Only say work is "live" after Vercel Production is `Ready` AND the live URL responds successfully. See the Go Live Workflow in `AGENTS.md`.
