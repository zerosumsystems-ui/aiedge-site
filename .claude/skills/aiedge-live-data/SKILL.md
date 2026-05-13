---
name: aiedge-live-data
description: Use when modifying the live-bars feed, the aggregator, the bars API routes, the operator diagnostic endpoint, or any live-data subscription / reconnect logic. Loads the pipeline shape and the invariants earned from past reconnect-loop and dedup fixes.
---

# AIedge live data pipeline

Touched by every "live bars" / "aggregator" / "subscribe" commit. Read before editing anything under `src/app/api/bars/` or `src/app/api/live-bars/`.

## File map

- `src/app/api/bars/route.ts` — historical bars endpoint.
- `src/app/api/bars/live/route.ts` — live bars stream.
- `src/app/api/bars/live/subscribe/route.ts` — subscription handshake.
- `src/app/api/live-bars/diagnostics/route.ts` — operator diagnostic endpoint. Used to inspect aggregator state without restarting.
- `src/lib/upstash.ts` — Redis-backed shared state.
- `src/components/charts/TradingViewTerminal.tsx` — client-side consumer; coalescing and retry logic lives here.

## Invariants earned from past fixes

- **No reconnect loops.** A failing aggregator subscription must back off and surface in the diagnostic endpoint, not retry tightly. See "aggregator reconnect loop + operator diagnostic endpoint."
- **Coalesce in-flight requests.** A second request for a bar already in flight must reuse the in-flight promise — no duplicate fan-out. See "request coalescing" and "dedup in-flight bars."
- **Retry subscribe on transient drop**, but cap it. See "retry subscribe."
- **Live status badge reflects reality.** The badge state must come from the actual subscription health, not optimistic flags.

## Operator diagnostic endpoint

Treat it as the source of truth for "is the feed healthy right now." When investigating a live-data bug:

1. Hit `/api/live-bars/diagnostics` locally and in prod.
2. Compare aggregator state, last-bar-at, subscriber count.
3. Only then change code.

Do not remove fields from the diagnostic response — operators may be reading them.

## Required proof for live-data changes

1. `git diff --check`
2. `npm run lint`
3. `npm run build`
4. `npm run test:chart` — the chart smoke depends on a working live feed.
5. With a local dev server running, hit:
   - `curl -s --max-time 10 http://127.0.0.1:3000/api/live-bars/diagnostics`
   - `curl -I --max-time 10 http://127.0.0.1:3000/chart`
6. Watch the dev-server logs for unbounded reconnect attempts during the smoke test.

## Boundary

Live-data work must not start surfacing prop-firm / funded-account / firm-rotation telemetry. The pipeline is for the public AIedge chart only.
