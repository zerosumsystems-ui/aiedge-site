# Fly.io deployment — live-bar aggregator

Runs `scripts/live/live_bars_aggregator.py` 24/7 in the cloud as the sole
host of the chart's real-time feed. The aggregator
subscribes to Databento's live stream, buckets ticks into 1-minute OHLCV
bars per symbol, and writes each closed bar to Upstash Redis. The
Next.js `/api/bars/live` route reads from the same key.

## One-time setup

1. **Create a Fly account**: https://fly.io/app/sign-up (or `fly auth signup`).

2. **Install the CLI** (Mac/Linux):
   ```
   curl -L https://fly.io/install.sh | sh
   ```

3. **Log in**:
   ```
   fly auth login
   ```

## Create the app

From the repo root:

```
fly launch \
  --config fly.live-bars.toml \
  --dockerfile Dockerfile.live-bars \
  --no-deploy \
  --copy-config \
  --yes \
  --name aiedge-live-bars \
  --region iad
```

The `--no-deploy` flag lets us set secrets before the first boot, which
matters because the script `sys.exit(2)`s on missing required env vars.

## Set secrets

Rotate the Upstash token first (it was leaked in chat) and use the new
value here.

```
fly secrets set --config fly.live-bars.toml \
  DATABENTO_API_KEY=db-xxxxxxxxxxxxxxxxxxxxxxxxxxxx \
  LIVE_DATASET=EQUS.MINI \
  LIVE_SCHEMA=trades \
  LIVE_SYMBOLS=SPY,QQQ,NVDA,TSLA,META,GOOGL,AAPL,MSFT,AMZN \
  UPSTASH_REDIS_REST_URL=https://teaching-boa-121408.upstash.io \
  UPSTASH_REDIS_REST_TOKEN=<rotated value>
```

> Note: secrets are stored encrypted on Fly and injected into the
> process env at start time. They never appear in the image or in
> `fly status`.

## Deploy

```
fly deploy --config fly.live-bars.toml
```

First build takes ~1-2 minutes (pulls the python:3.12-slim base, pip
installs databento). Subsequent deploys are faster.

## Verify

1. **Fly side**:
   ```
   fly status --config fly.live-bars.toml
   fly logs --config fly.live-bars.toml
   ```
   Within a minute of market open you should see lines like:
   ```
   [INFO] Starting aggregator: dataset=EQUS.MINI schema=trades symbols=['SPY', ...]
   [INFO] [SPY] 1778597400  o=515.42 h=515.55 l=515.40 c=515.50 v=12345
   ```

2. **Upstash side** — once at least one bar has been written:
   ```
   curl -X POST https://teaching-boa-121408.upstash.io/keys/bars:1m:* \
     -H "Authorization: Bearer <new token>"
   ```
   Should return `{"result":["bars:1m:SPY","bars:1m:QQQ",...]}`.

3. **Site side**:
   ```
   curl -I https://www.aiedge.trade/api/bars/live?ticker=SPY
   ```
   The `x-live-status` header should flip from `empty-set` to `ok`.

## Operator diagnostics

Without the `fly` CLI, you can still see whether the aggregator is up
and writing bars from anywhere with curl:

```
curl -s https://www.aiedge.trade/api/live-bars/diagnostics | jq
```

The response covers both sides independently:

- `aggregator.reachable` / `aggregator.status` / `aggregator.body` — was
  the Fly `/health` endpoint reachable, and what did it say. A
  `reachable: false` with `error: "fetch failed"` is the same DNS /
  unreachable failure mode `/api/bars/live/subscribe` will hit; the Fly
  machine is down or has been moved.
- `upstash.subscribed_symbols` — the dynamic-subscribe set persisted in
  Redis. Even if Fly is down, Upstash will still serve the most-recent
  bars to the chart for up to ~6h (TTL on `bars:1m:*`).
- `upstash.sample_keys` — how many distinct `bars:1m:*` keys currently
  exist. A non-zero count means bars made it into Redis recently; zero
  with `aggregator.reachable: true` means the aggregator is up but
  Databento isn't producing.

The route returns HTTP 502 when the aggregator side is unhealthy so it
plugs cleanly into uptime monitors.

## Reconnect behavior

`main()` wraps the Databento live loop in a reconnect loop with
exponential backoff (2s → 60s cap). If the loop crashes 30 times in
a row, the process exits non-zero so Fly's restart policy fires —
clean exit 0 doesn't always respawn the machine. The HTTP server is
started once per `run()` and a second attempt on the same port is
caught and logged so reconnects don't spam errors.

## Troubleshooting

- **`fly status` shows no machine** — the deploy succeeded but the
  machine was destroyed because the process exited non-zero. Check
  `fly logs` for `Missing required env var: ...` (then fix `fly secrets`)
  or a Databento auth error (then rotate `DATABENTO_API_KEY`).

- **`x-live-status: empty-set` after deploy** — Fly is up but
  Databento isn't producing data. Possible causes:
  - Market is closed (live stream may only heartbeat off-hours).
  - `LIVE_DATASET` / `LIVE_SCHEMA` mismatch your Databento
    entitlements. Re-run `scripts/probe_databento_entitlements.py` on
    a workstation to confirm what your key is allowed to subscribe to.

## Cost

`shared-cpu-1x` with 256MB RAM is well inside Fly's free allowance for
hobby-tier accounts. Bandwidth for Databento WS + Upstash REST is
trivial (~MB/day).
