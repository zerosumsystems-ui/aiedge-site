# /smoke - Pre-flight checks without shipping

The middle gear between editing and `/go`. Runs every quality check `/go` would run, prints the proof, then stops. Use this to sanity-check work mid-flight or before handing a branch back to Will.

## Contract

1. Run the right checks for the change.
2. Print a concise proof block.
3. Stop. Do not commit, do not push.

## Checks

For any change in normal app code:

- `git diff --check`
- `npm run lint`
- `npm run build`

If the diff touches anything under chart code paths (chart routes, indicator registry, ƒx menu, live-bars, aggregator), also run:

- `npm run test:chart`

If a dev server is already running on port 3000, also hit the affected route with `curl -I --max-time 10`. Skip if no server is up — do not start one just for this.

## Proof block

Print:

- Files changed (one per line, from `git diff --name-only`)
- Each check run, with pass/fail
- Local route HTTP status if a curl ran, or "skipped (no dev server)"
- Any check intentionally skipped and why

## Rules

- Do not stage, commit, or push.
- Stop on the first failed check, show the failing command and the relevant error.
- Do not start the dev server unless Will asks.
- Do not run `/go` after — `/smoke` is a pure check, not a launcher.
