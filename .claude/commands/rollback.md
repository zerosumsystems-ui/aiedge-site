# /rollback - One-shot revert of the latest production deploy

The matching undo button for `/go`. Reverts the latest commit on `main` and pushes the revert to production.

## When to use

- A `/go` just shipped something broken and the fix-forward is not immediate.
- Will explicitly says `/rollback` or "roll back prod."

## Steps

1. Confirm the current state:
   - `git fetch origin main`
   - `git log -3 origin/main --oneline` — show Will the last three commits before acting.
2. State the commit you are about to revert. Pause for Will's explicit go-ahead — rollbacks are visible to users and worth confirming once.
3. Create a revert commit on a fresh branch:
   - `git checkout -b rollback/<short-slug> origin/main`
   - `git revert --no-edit <sha>`
4. Run the standard checks before pushing:
   - `git diff --check`
   - `npm run lint`
   - `npm run build`
   - `npm run test:chart` if the original commit touched chart paths
5. Push the revert straight to production:
   - `git push origin HEAD:main`
6. Verify the production deployment the same way `/go` does:
   - Find the new Production deployment on Vercel, poll until `Ready`.
   - `curl -I --max-time 20 https://www.aiedge.trade/chart` (or the relevant route).
7. Report: reverted SHA, new SHA on `main`, deployment URL, live HTTP result.

## Rules

- Never `--force` push during a rollback. If main has moved past the bad commit, revert by SHA, not by reset.
- Never roll back without showing the diff being reverted at least in summary.
- If the bad commit has dependent commits on top of it, revert each one explicitly rather than a force-push.
- The boundary hook still runs on the push — if the revert itself somehow trips it, stop and surface to Will.
