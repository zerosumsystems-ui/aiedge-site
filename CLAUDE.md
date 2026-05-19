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

## Standing workflow — auto-review, then go live

Will never manually reviews or merges, and does not want to type `go` every
time. After completing any change he asked for, do not wait for a `go` trigger
and do not ask for permission to ship or to merge:

1. Self-review the diff (reuse, correctness, regressions).
2. If the review looks good, run the Go Live Workflow in `AGENTS.md` (quality
   checks → show proof → ship → verify) — all the way to production.
3. Report what shipped and the verified live URL.

This applies to PR work too: never leave a finished change sitting as a draft
PR waiting on Will, and never ask "merge or not" — review it and ship it.

Stop and surface to Will instead of shipping ONLY when: a check fails, the
boundary hook fires, the change is risky or ambiguous, or he is still
mid-conversation about what he wants. When unsure whether a change is "done"
enough to ship, ask in one sentence rather than sitting on it.

## Standing skills (auto-load — no trigger needed)

- `aiedge-chart` — anything under `/chart`, indicators, ƒx menu, watchlist, overlays, chart settings.
- `aiedge-live-data` — `api/bars/*`, `api/live-bars/*`, the aggregator, the operator diagnostic endpoint.

## Bias checks — mandatory for every backtest, study, or quantitative claim

Before presenting any backtest result, expectancy / edge number, win rate, or
"this works" conclusion, check for bias and state it up front — unprompted,
not only when asked. Walk through, at minimum:

- Selection / curation — is the sample random, or hand-picked / balanced /
  filtered? A curated gallery cannot estimate a population.
- Sample size — is n big enough? Report bootstrap confidence intervals and
  flag when one or two trades drive the result.
- Multiple comparisons — if several variants / parameters were tried, the
  best one is upward-biased. Prefer a single choice fixed before seeing results.
- In-sample vs out-of-sample — was there a walk-forward / holdout split?
  In-sample numbers are not evidence.
- Survivorship — does the corpus drop delisted / failed / renamed names?
- Look-ahead & fill realism — detection uses only past bars; model slippage
  and commission; score straddles conservatively.

If a result is not bias-checked, lead with that ("illustrative study, not a
verdict") — not the headline number.

## Guardrails

- The boundary hook (`.claude/hooks/check-boundary.sh`) blocks `git push` to `main` if the diff carries prop-firm / funded-account / firm-rotation / payout-eval / account-rotation content. If it fires, do not work around it — surface to Will and stop.
- Only say work is "live" after Vercel Production is `Ready` AND the live URL responds successfully. See the Go Live Workflow in `AGENTS.md`.
