# Chart stress test — 2026-05-14

**Target:** `https://www.aiedge.trade/chart` (prod, signed-out)
**Method:** concurrent HTTP via Python + Playwright MCP driving a real Chrome session.

## API stress — `/api/bars`

36 requests fanned out at 20-way concurrency: 12 symbols × {1m, 5m} on 2026-05-13 RTH, plus 6 multi-day and 6 two-year-daily queries.

| Metric | Value |
|---|---|
| Total | 36 |
| Successful (200) | 36 |
| Failed | 0 |
| Wall time | 19.9s |
| p50 latency | 3.9s |
| p95 latency | 12.9s |
| p99 / max | 16.4s |

Zero failures under concurrent load. **Latency is the story** — p95 of 13s is rough. Most of that is Databento upstream (the route comment specifically calls out 20s+ for unsubscribed symbols like AVGO). The in-flight coalescing kicks in when multiple callers ask for the same key, so real users hitting a hot symbol share one upstream fetch. Cold-cache hits to thin tickers, though, are slow.

## UI stress — Playwright on prod

Sequence:
- Phase A: timeframe button spam (8 rounds × 6 buttons each, 50ms apart) — but button-finding glitched, only 5 clicks landed; sample size too small to draw conclusions.
- Phase B: ƒx menu click — 30 open/close cycles at 80ms intervals.
- Phase C: symbol input cycling — 8 symbols (NVDA → AAPL → TSLA → MSFT → AMD → META → GOOGL → SPY) at 400ms intervals.
- ~30s total wall time.

### Network — observed during stress

Counts and latency from the in-page `performance.getEntriesByType('resource')`:

| Endpoint | Count | p50 | p95 | max |
|---|---:|---:|---:|---:|
| `/api/bars` (historical) | 32 | 3.1s | 15.5s | 15.5s |
| `/api/bars/live` (tick) | 54 | 137ms | 182ms | 719ms |
| `/api/bars/live/quotes` | 14 | 183ms | 266ms | 266ms |
| `/api/bars/live/symbols` | 9 | 140ms | 247ms | 247ms |

### Health checks after stress

- **Console errors:** 0
- **Console warnings:** 0
- **JS heap:** 8.6 MB used / 10.1 MB total (limit 4 GB) — no leak suspicion in this window
- **Canvas count:** 7 (chart still rendering)
- **Final symbol header:** SPY (cycled back, correctly stuck)

## Findings

### ✅ Robust

- Chart did not crash or break under 30 ƒx-menu clicks + 8 symbol changes in ~30s.
- Zero console errors throughout the stress.
- Final state correct: header symbol matches last user action.
- JS heap stayed tiny.
- No retry storms on the success path (which is different from the no-API-key error path observed earlier — see `qa-report-2026-05-14.md` side note).

### 🟡 Worth noticing

1. **Live polling at ~1.8 Hz.** 54 hits to `/api/bars/live` in ~30s = roughly every 550ms. For a 1m-bar chart this is overkill — a 2–5s interval would feel just as live and cut server load by 4–10×. Likely a `setInterval` with too-aggressive cadence.

2. **`/api/bars` p95 of ~15s for historical queries.** Mostly Databento cost. Mitigations worth considering: prewarm the most-likely-asked tickers on deploy, longer edge cache for fully-past ranges (the route already does this — `s-maxage=86400` for past windows), or surface a "fetching from Databento" UX hint at >2s.

3. **Watchlist refresh appears in the dupe summary.** The multi-symbol `symbols=SPY%2CQQQ%2CNVDA%2C…&minutes=360` URL fired 10 times in 30s — same cadence concern as the live tick.

### 🐛 None new

No new bugs found beyond what's already in `qa-report-2026-05-14.md` and the retry-storm side note.

## Suggested follow-up

- Loosen the live-poll interval from ~550ms to 2–5s, or move to SSE/WebSocket (which `aiedge-live-data` skill suggests is already the aggregator's transport — could be a pure client-side change to subscribe instead of poll).
- Cap `/api/bars` end-user wait with a 5s timeout + show a fallback skeleton; let Databento finish in the background and update the chart when it lands.
