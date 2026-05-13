---
name: aiedge-chart
description: Use when modifying anything under the AIedge `/chart` route or its supporting code — indicators, EMA / HTF overlays, the ƒx menu, the live status badge, mobile watchlist behavior, the Always-in toggle, the SR strip, or chart settings. Loads chart conventions, file map, and the required smoke-test workflow.
---

# AIedge chart work

The chart at `/chart` is the most-touched surface in this repo. Read this before editing anything under `src/app/chart/`, `src/components/charts/`, or the live-bars APIs.

## File map

- `src/app/chart/page.tsx` — route entry.
- `src/app/chart/ChartClient.tsx` — top-level client component, settings wiring, ƒx menu.
- `src/components/charts/TradingViewTerminal.tsx` — main terminal: indicators, overlays, watchlist, badges.
- `src/components/charts/LightweightChart.tsx` — wrapper around the chart library.
- `src/components/charts/BarsChart.tsx`, `BrooksBarStrip.tsx`, `EmaRelativeChart.tsx`, `MultiMatchConsensus.tsx`, `PostAnchorEvolution.tsx`, `SpatialOverlay.tsx` — supporting overlays.
- `src/app/api/bars/route.ts` — historical bars.
- `src/app/api/bars/live/route.ts`, `src/app/api/bars/live/subscribe/route.ts` — live data feed.
- `src/app/api/live-bars/diagnostics/route.ts` — operator diagnostic endpoint (added with the aggregator reconnect fix).
- `tests/chart-smoke.spec.ts` — Playwright smoke test.

## Conventions earned the hard way

These are settled rules from prior fixes — do not reopen them without a strong reason.

- **Symbol stickiness.** Live updates must not yank the user off their selected symbol. See the "keep user on their symbol" fix.
- **In-flight bar dedup.** Concurrent fetches for the same bar must coalesce. See "dedup in-flight bars + retry subscribe."
- **Mobile watchlist closed by default.** Don't auto-open it.
- **Indicators live in the ƒx menu.** Don't scatter toggles across the chart UI; centralize them.
- **Per-indicator settings** (e.g., per-HTF EMA periods). Indicator config belongs in the settings store, not hard-coded.
- **HTF context defaults to the bar window.** Don't override unless the user changed it.
- **First-fetch reveal.** Hide chart skeleton until first bars arrive; avoid hydration mismatch.
- **Always-in badge top-right; SR strip visible on mobile.**

## Required proof before declaring chart work done

Run all of these. Show the output. Stop on the first failure.

1. `git diff --check`
2. `npm run lint`
3. `npm run build`
4. `npm run test:chart` — Playwright smoke test against a local dev server.
5. If a dev server is already running, also `curl -I --max-time 10 http://127.0.0.1:3000/chart`.

A change that builds but fails the chart smoke is not done.

## Adding a new indicator

When the user asks for a new overlay, follow the existing pattern:

1. Add the rendering component under `src/components/charts/`.
2. Register it in the indicator list inside `TradingViewTerminal.tsx` and surface its toggle in the ƒx menu.
3. Add per-indicator settings (period, color, visible-at-timeframe) to the settings store rather than literals in the component.
4. Mirror an existing indicator's structure (HTF EMA20 split into 15m / 1h / D / W is a clean reference).
5. Extend `tests/chart-smoke.spec.ts` with a variant that toggles the new indicator on.

## Live-data interactions

If the change touches `api/bars/live/*` or the aggregator, also load the `aiedge-live-data` skill conventions — the reconnect-loop and operator-diagnostic invariants apply.

## Boundary

Chart work is allowed to surface symbols, indicators, and trade structure. It must not surface prop-firm / funded-account / payout-eval / firm-rotation / account-management content. The boundary hook will block a `git push` to main that violates this — see `.claude/hooks/check-boundary.sh`.
