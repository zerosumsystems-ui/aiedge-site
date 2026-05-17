"""Phase 1 of issue #26 — live bar aggregator.

Subscribes to Databento live data, writes 1-minute OHLCV bars to Upstash Redis
(sorted set, keyed by ticker, scored by bar timestamp). The Next.js
/api/bars/live route reads from the same key.

Runs as a long-lived process on Fly (Dockerfile.live-bars +
fly.live-bars.toml).

Required env vars (set as Fly secrets in production, or in the repo
.env.local for local runs):

    DATABENTO_API_KEY       — your live API key
    LIVE_DATASET            — e.g. "DBEQ.BASIC" or "EQUS.MINI" (depends
                              on what the entitlements probe shows)
    LIVE_SCHEMA             — "trades" to aggregate ticks locally, or
                              "ohlcv-1m" to write Databento native bars
                              directly. Defaults to "trades".
    LIVE_SYMBOLS            — comma-separated tickers, e.g. "SPY,QQQ,NVDA"
    UPSTASH_REDIS_REST_URL  — e.g. https://us1-xxxx.upstash.io
    UPSTASH_REDIS_REST_TOKEN— Bearer token for the same database

Usage:
    python3 scripts/live_bars_aggregator.py

Dependencies are installed by Dockerfile.live-bars; for a local run:
    pip install databento sentry-sdk

The Databento Python SDK handles the WebSocket reconnection logic and
gives us decoded record objects. With LIVE_SCHEMA=trades we bucket trade
ticks locally; with LIVE_SCHEMA=ohlcv-1m we persist Databento's native bar
records directly.
"""

from __future__ import annotations

import base64
import json
import logging
import os
import signal
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Callable

log = logging.getLogger("live_bars")
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)


# ---------- error reporting ------------------------------------------------

# Set to the sentry_sdk module once init succeeds; stays None otherwise so
# every capture site is a guarded no-op. Mirrors the Next.js side
# (instrumentation.ts): no DSN -> Sentry is completely silent.
_sentry: Any = None


def init_sentry() -> None:
    """Wire Sentry crash reporting for the aggregator.

    No-op when SENTRY_DSN_AGGREGATOR is unset, so local runs stay silent.
    Call after load_env() so the DSN can come from .env.local as well as
    the process environment (Fly secrets)."""
    global _sentry
    dsn = os.environ.get("SENTRY_DSN_AGGREGATOR")
    if not dsn:
        return
    try:
        import sentry_sdk  # type: ignore[import-not-found]
    except ImportError:
        log.warning("SENTRY_DSN_AGGREGATOR is set but sentry-sdk is not installed; error reporting disabled")
        return
    sentry_sdk.init(
        dsn=dsn,
        environment=os.environ.get("SENTRY_ENVIRONMENT", "production"),
        traces_sample_rate=0.0,
    )
    _sentry = sentry_sdk
    log.info("Sentry error reporting enabled")


# ---------- env loading (mirrors probe_databento_entitlements.py) ----------

def _load_env_file(path: Path) -> None:
    if not path.exists():
        return
    for raw in path.read_text().splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


def load_env() -> None:
    repo_root = Path(__file__).resolve().parent.parent.parent
    _load_env_file(repo_root / ".env.local")
    _load_env_file(repo_root / ".env")
    extra = os.environ.get("EXTRA_ENV_FILE")
    if extra:
        _load_env_file(Path(extra))


def require_env(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        log.error("Missing required env var: %s", name)
        sys.exit(2)
    return value


def optional_env(name: str, default: str) -> str:
    value = os.environ.get(name)
    return value.strip() if value else default


# ---------- bar aggregation -------------------------------------------------

@dataclass
class Bar:
    t: int   # unix seconds, start of the minute
    o: float
    h: float
    l: float
    c: float
    v: int

    def to_json(self) -> str:
        return json.dumps({"t": self.t, "o": self.o, "h": self.h, "l": self.l, "c": self.c, "v": self.v})


class Aggregator:
    """One Aggregator per symbol; tracks the in-progress 1m bar."""

    def __init__(
        self,
        symbol: str,
        on_close: Callable[[str, "Bar"], None],
        on_partial: Callable[[str, "Bar"], None] | None = None,
        partial_min_interval_s: float = 0.5,
    ):
        self.symbol = symbol
        self.on_close = on_close
        self.on_partial = on_partial
        self.partial_min_interval_s = partial_min_interval_s
        self._last_partial_at = 0.0
        self.current: Bar | None = None

    def add_trade(self, ts_seconds: float, price: float, size: int) -> None:
        bucket = int(ts_seconds // 60) * 60
        if self.current is None:
            self.current = Bar(t=bucket, o=price, h=price, l=price, c=price, v=size)
            self._emit_partial()
            return
        if bucket > self.current.t:
            # Bar rolled. Flush the closed one, start a fresh one.
            closed = self.current
            self.current = Bar(t=bucket, o=price, h=price, l=price, c=price, v=size)
            self.on_close(self.symbol, closed)
            self._emit_partial()
            return
        # Same bucket — update OHLC.
        b = self.current
        b.h = max(b.h, price)
        b.l = min(b.l, price)
        b.c = price
        b.v += size
        self._emit_partial()

    def _emit_partial(self) -> None:
        if self.on_partial is None or self.current is None:
            return
        now = time.monotonic()
        if now - self._last_partial_at < self.partial_min_interval_s:
            return
        self._last_partial_at = now
        self.on_partial(self.symbol, self.current)

    def force_close(self) -> None:
        if self.current is not None:
            self.on_close(self.symbol, self.current)
            self.current = None


# ---------- upstash redis (REST) -------------------------------------------

class Upstash:
    """Tiny REST client. ZADD a bar, EXPIRE the key. Stdlib only."""

    def __init__(self, base_url: str, token: str, ttl_seconds: int = 6 * 3600):
        self.base = base_url.rstrip("/")
        self.token = token
        self.ttl = ttl_seconds

    def _post(self, path_segments: list[str]) -> Any:
        path = "/".join(urllib.parse.quote(seg, safe="") for seg in path_segments)
        url = f"{self.base}/{path}"
        req = urllib.request.Request(url, method="POST", headers={
            "Authorization": f"Bearer {self.token}",
        })
        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                return json.loads(resp.read().decode())
        except urllib.error.HTTPError as exc:
            body = exc.read().decode()
            log.warning("Upstash %s -> HTTP %d: %s", path, exc.code, body[:200])
            return None
        except urllib.error.URLError as exc:
            log.warning("Upstash %s -> URLError: %s", path, exc)
            return None

    def write_bar(self, symbol: str, bar: Bar) -> None:
        key = f"bars:1m:{symbol.upper()}"
        # ZADD with score=timestamp, member=bar JSON. If a bar at the same
        # score already exists the member is replaced (we serialize JSON
        # consistently so updates idempotently overwrite).
        self._post(["zadd", key, str(bar.t), bar.to_json()])
        self._post(["expire", key, str(self.ttl)])

    def write_partial(self, symbol: str, bar: Bar) -> None:
        # In-progress bar — overwritten as new ticks roll in. Short TTL so
        # stale partials disappear if the aggregator dies. /api/bars/live
        # reads this key and appends it to the response so the chart shows
        # the current candle growing in near-real-time.
        key = f"bar_latest:1m:{symbol.upper()}"
        self._post(["set", key, bar.to_json(), "EX", "120"])


def _load_persisted_dynamic_symbols(cache: "Upstash") -> list[str]:
    """Read the live:subscribed Redis set so dynamic symbols survive restarts.

    Best-effort: any failure returns an empty list and we just start with
    the configured static set.
    """
    try:
        path = "/smembers/" + urllib.parse.quote("live:subscribed", safe="")
        req = urllib.request.Request(
            cache.base + path,
            method="POST",
            headers={"Authorization": f"Bearer {cache.token}"},
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            payload = json.loads(resp.read().decode())
        members = payload.get("result") or []
        return [str(m).upper() for m in members if m]
    except Exception as exc:
        log.warning("Failed to load persisted dynamic symbols: %s", exc)
        return []


# ---------- historical backfill ---------------------------------------------

# Databento's EQUS.MINI historical feed publishes with a ~30 min lag, so
# the "end" of any historical query has to be clamped past that or we get
# 422 "data_end_after_available_end". The site's /api/bars route uses the
# same 35-min cushion; we mirror it here.
DATABENTO_HISTORICAL_LAG_S = 35 * 60


def backfill_recent_bars(
    *,
    api_key: str,
    dataset: str,
    symbols: list[str],
    cache: "Upstash",
    hours: float,
    db_module: Any,
) -> None:
    """One-shot seed of recent OHLCV-1m bars into Upstash.

    Bridges the gap between the historical publish frontier and the
    aggregator's first live bar after restart. Uses ohlcv-1m (not
    trades) to keep the historical pull cheap — ~60 records per symbol
    per hour. Best-effort: any failure is logged and ignored, since
    the live subscription will still work without backfill.
    """
    import datetime

    try:
        hist_client = db_module.Historical(key=api_key)
    except Exception as exc:
        log.warning("Backfill skipped: failed to construct Historical client: %s", exc)
        return

    now_dt = datetime.datetime.now(tz=datetime.timezone.utc)
    end_dt = now_dt - datetime.timedelta(seconds=DATABENTO_HISTORICAL_LAG_S)
    start_dt = end_dt - datetime.timedelta(hours=hours)

    log.info(
        "Backfilling ohlcv-1m for %d symbols: %s → %s",
        len(symbols),
        start_dt.isoformat(timespec="seconds"),
        end_dt.isoformat(timespec="seconds"),
    )

    try:
        data = hist_client.timeseries.get_range(
            dataset=dataset,
            schema="ohlcv-1m",
            symbols=symbols,
            start=start_dt,
            end=end_dt,
            stype_in="raw_symbol",
        )
    except Exception as exc:
        log.warning("Backfill skipped: get_range failed: %s", exc)
        return

    # Convert to a pandas DataFrame so the SDK resolves instrument_id ↔
    # raw_symbol for us via the response's metadata. pandas is already a
    # transitive dep of the databento package. Iterating raw records and
    # trying to use DBNStore.symbology_map directly returned an empty map
    # under SDK 0.77 — to_df handles the resolution correctly.
    try:
        df = data.to_df(pretty_ts=False, map_symbols=True)
    except Exception as exc:
        log.warning("Backfill skipped: to_df failed: %s", exc)
        return

    if df is None or len(df) == 0:
        log.info("Backfilled 0 bars from historical (empty response)")
        return

    written = 0
    skipped = 0
    for index, row in df.iterrows():
        try:
            sym_raw = row.get("symbol")
            if not sym_raw:
                skipped += 1
                continue
            sym = str(sym_raw).upper()

            # ts_event arrives either as a pandas Timestamp (pretty_ts=True
            # default) or as int64 nanoseconds. With pretty_ts=False the
            # column should be ns int, but iterrows can vary by SDK
            # version, so handle both. Falls back to the index, which is
            # the ts_event in some configurations.
            ts_val = row.get("ts_event")
            if ts_val is None:
                ts_val = index
            if hasattr(ts_val, "timestamp"):
                t = int(ts_val.timestamp())
            elif hasattr(ts_val, "value"):
                t = int(ts_val.value) // 1_000_000_000
            else:
                t = int(ts_val) // 1_000_000_000

            cache.write_bar(
                sym,
                Bar(
                    t=t,
                    o=float(row["open"]),
                    h=float(row["high"]),
                    l=float(row["low"]),
                    c=float(row["close"]),
                    v=int(row.get("volume", 0) or 0),
                ),
            )
            written += 1
        except Exception as exc:
            skipped += 1
            log.debug("Backfill row failed: %s", exc)

    log.info(
        "Backfilled %d bars from historical (rows=%d skipped=%d)",
        written,
        len(df),
        skipped,
    )


# ---------- health endpoint ------------------------------------------------

# Shared state for the health server. Updated from the live loop.
_health_state: dict[str, Any] = {
    "started_at": time.time(),
    "last_record_at": 0.0,
    "last_bar_at": 0.0,
    "records_total": 0,
    "bars_total": 0,
    "live_connected": False,
}
_health_lock = threading.Lock()

# Shared state for the subscribe endpoint. Populated by run() before the
# health server starts handling requests.
_subscribe_lock = threading.Lock()
_subscribed_symbols: set[str] = set()
_client_ref: Any = None
_aggs_ref: dict[str, "Aggregator"] = {}
_cache_ref: "Upstash | None" = None
_api_key_ref: str = ""
_dataset_ref: str = ""
_live_schema_ref: str = ""
_partial_interval_ref: float = 0.5
_on_close_ref: Callable[[str, "Bar"], None] | None = None
_on_partial_ref: Callable[[str, "Bar"], None] | None = None
_db_module_ref: Any = None
# Optional shared bearer token. When set, /subscribe requires the token.
_subscribe_token: str = ""


def add_symbol(ticker: str) -> dict[str, Any]:
    """Subscribe the aggregator to a new ticker mid-stream.

    Idempotent — returns existing=True if the symbol was already
    subscribed. Mutating `_aggs_ref` from another thread is safe because
    the main loop only reads it; the dict itself doesn't get iterated.
    """
    clean = (ticker or "").strip().upper()
    if not clean:
        return {"ok": False, "error": "empty ticker"}
    if _client_ref is None or _cache_ref is None:
        return {"ok": False, "error": "aggregator not ready"}

    with _subscribe_lock:
        already = clean in _subscribed_symbols
        if not already:
            _subscribed_symbols.add(clean)
            if _live_schema_ref == "trades" and _on_close_ref is not None:
                _aggs_ref[clean] = Aggregator(
                    clean,
                    _on_close_ref,
                    on_partial=_on_partial_ref,
                    partial_min_interval_s=_partial_interval_ref,
                )

    if already:
        return {"ok": True, "existing": True, "ticker": clean}

    try:
        _client_ref.subscribe(
            dataset=_dataset_ref,
            schema=_live_schema_ref,
            symbols=[clean],
            stype_in="raw_symbol",
        )
    except Exception as exc:
        log.warning("Subscribe(%s) failed: %s", clean, exc)
        with _subscribe_lock:
            _subscribed_symbols.discard(clean)
            _aggs_ref.pop(clean, None)
        return {"ok": False, "error": f"subscribe failed: {exc}"}

    # Persist the dynamic subscription so /api/bars/live/symbols can
    # surface it to the chart, and so we can re-subscribe on aggregator
    # restart without losing the user's custom symbols.
    try:
        _cache_ref._post(["sadd", "live:subscribed", clean])
        _cache_ref._post(["expire", "live:subscribed", "604800"])
    except Exception as exc:
        log.warning("Failed to mirror subscribed symbol to Redis: %s", exc)

    # Backfill in a background thread so the HTTP handler returns fast.
    if _db_module_ref is not None:
        threading.Thread(
            target=backfill_recent_bars,
            kwargs={
                "api_key": _api_key_ref,
                "dataset": _dataset_ref,
                "symbols": [clean],
                "cache": _cache_ref,
                "hours": 2.0,
                "db_module": _db_module_ref,
            },
            daemon=True,
            name=f"backfill-{clean}",
        ).start()

    log.info("Dynamically subscribed: %s", clean)
    return {"ok": True, "ticker": clean}


def _health_mark(field: str, value: Any) -> None:
    with _health_lock:
        _health_state[field] = value


def _health_bump(field: str) -> None:
    with _health_lock:
        _health_state[field] = _health_state.get(field, 0) + 1


def _health_snapshot() -> dict[str, Any]:
    with _health_lock:
        snap = dict(_health_state)
    now = time.time()
    snap["uptime_s"] = round(now - snap["started_at"], 1)
    snap["seconds_since_last_record"] = (
        round(now - snap["last_record_at"], 1) if snap["last_record_at"] else None
    )
    snap["seconds_since_last_bar"] = (
        round(now - snap["last_bar_at"], 1) if snap["last_bar_at"] else None
    )
    return snap


class _HealthHandler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:  # noqa: N802 — stdlib API
        if self.path not in ("/", "/health"):
            self.send_response(404)
            self.end_headers()
            return
        snap = _health_snapshot()
        # Healthy = aggregator has logged a tick in the last 5 minutes
        # OR has been running less than 60 seconds (still booting). After
        # boot, going silent on a live RTH day is what Fly should alert on.
        recent_record = snap["seconds_since_last_record"] is not None and snap["seconds_since_last_record"] < 300
        booting = snap["uptime_s"] < 60
        healthy = recent_record or booting
        body = json.dumps({"healthy": healthy, **snap}).encode()
        self.send_response(200 if healthy else 503)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self) -> None:  # noqa: N802 — stdlib API
        parsed = urllib.parse.urlsplit(self.path)
        if parsed.path != "/subscribe":
            self.send_response(404)
            self.end_headers()
            return

        # Optional shared-secret guard — when set on Fly + Vercel both
        # sides know the token. Open by default so a misconfigured Fly
        # secret doesn't silently break the feature.
        if _subscribe_token:
            auth = self.headers.get("Authorization") or ""
            expected = f"Bearer {_subscribe_token}"
            if auth != expected:
                self.send_response(401)
                self.end_headers()
                return

        qs = urllib.parse.parse_qs(parsed.query or "")
        ticker = (qs.get("ticker") or [""])[0]
        result = add_symbol(ticker)
        body = json.dumps(result).encode()
        status = 200 if result.get("ok") else 400
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format: str, *args: Any) -> None:  # noqa: A002 — stdlib API
        # Suppress per-request stderr noise; we already log meaningful events.
        return


def _start_health_server(port: int) -> None:
    server = ThreadingHTTPServer(("0.0.0.0", port), _HealthHandler)
    thread = threading.Thread(target=server.serve_forever, name="health", daemon=True)
    thread.start()
    log.info("Health endpoint listening on :%d /health", port)


# ---------- databento live wiring ------------------------------------------

def run() -> None:
    load_env()
    api_key = require_env("DATABENTO_API_KEY")
    dataset = require_env("LIVE_DATASET")
    live_schema = optional_env("LIVE_SCHEMA", "trades").lower()
    symbols_csv = require_env("LIVE_SYMBOLS")
    upstash_url = require_env("UPSTASH_REDIS_REST_URL")
    upstash_token = require_env("UPSTASH_REDIS_REST_TOKEN")

    if live_schema not in {"trades", "ohlcv-1m"}:
        log.error("Unsupported LIVE_SCHEMA=%s; expected trades or ohlcv-1m", live_schema)
        sys.exit(2)

    symbols = [s.strip().upper() for s in symbols_csv.split(",") if s.strip()]
    if not symbols:
        log.error("LIVE_SYMBOLS is empty")
        sys.exit(2)

    log.info("Starting aggregator: dataset=%s schema=%s symbols=%s", dataset, live_schema, symbols)

    cache = Upstash(upstash_url, upstash_token)
    partial_interval_s = float(optional_env("PARTIAL_BAR_INTERVAL_S", "0.5"))

    # TFO live runner — secondary feature; failures here never crash the
    # primary bar-writing path. The runner disables itself cleanly if
    # SUPABASE_URL / SERVICE_ROLE_KEY / model.joblib aren't available.
    try:
        from live_tfo_runner import TfoLiveRunner
        tfo_runner = TfoLiveRunner()
    except Exception as exc:
        log.warning("TfoLiveRunner construction failed (continuing without it): %s", exc)
        tfo_runner = None

    # Pullback live runner — same secondary-feature contract as the TFO
    # runner. Recurs intraday; runs on every 1min close.
    try:
        from live_pullback_runner import PullbackLiveRunner
        pullback_runner = PullbackLiveRunner()
    except Exception as exc:
        log.warning("PullbackLiveRunner construction failed (continuing without it): %s", exc)
        pullback_runner = None

    def on_close(sym: str, bar: Bar) -> None:
        log.info(
            "[%s] %d  o=%.2f h=%.2f l=%.2f c=%.2f v=%d",
            sym, bar.t, bar.o, bar.h, bar.l, bar.c, bar.v,
        )
        _health_mark("last_bar_at", time.time())
        _health_bump("bars_total")
        cache.write_bar(sym, bar)
        # Pass the bar as a plain dict so the runners don't take a
        # dependency on Bar (and so synthetic tests can call them).
        if (tfo_runner is not None and tfo_runner.enabled) or (
            pullback_runner is not None and pullback_runner.enabled
        ):
            bar_dict = {
                "t": bar.t, "o": bar.o, "h": bar.h, "l": bar.l, "c": bar.c, "v": bar.v,
            }
            if tfo_runner is not None and tfo_runner.enabled:
                tfo_runner.on_1m_close(sym, bar_dict)
            if pullback_runner is not None and pullback_runner.enabled:
                pullback_runner.on_1m_close(sym, bar_dict)

    def on_partial(sym: str, bar: Bar) -> None:
        cache.write_partial(sym, bar)

    aggs: dict[str, Aggregator] = {
        s: Aggregator(s, on_close, on_partial=on_partial, partial_min_interval_s=partial_interval_s)
        for s in symbols
    }

    try:
        import databento as db  # type: ignore[import-not-found]
    except ImportError:
        log.error("Missing dep: pip install databento")
        sys.exit(2)
    FIXED_PRICE_SCALE = db.FIXED_PRICE_SCALE
    OHLCVMsg = db.OHLCVMsg
    SymbolMappingMsg = db.SymbolMappingMsg

    # Live client. Created up front so the /subscribe handler can see it
    # before we start the health/subscribe HTTP server.
    client = db.Live(key=api_key)

    # Hydrate the module-level refs that add_symbol() reads. After this
    # point the POST /subscribe handler is safe to serve. Pull any
    # previously-subscribed dynamic symbols from Redis so a restart
    # doesn't lose them.
    global _client_ref, _aggs_ref, _cache_ref, _api_key_ref, _dataset_ref
    global _live_schema_ref, _partial_interval_ref, _on_close_ref
    global _on_partial_ref, _db_module_ref, _subscribe_token
    _client_ref = client
    _aggs_ref = aggs
    _cache_ref = cache
    _api_key_ref = api_key
    _dataset_ref = dataset
    _live_schema_ref = live_schema
    _partial_interval_ref = partial_interval_s
    _on_close_ref = on_close
    _on_partial_ref = on_partial
    _db_module_ref = db
    _subscribe_token = optional_env("LIVE_SUBSCRIBE_TOKEN", "")
    with _subscribe_lock:
        _subscribed_symbols.update(symbols)

    dynamic_symbols = _load_persisted_dynamic_symbols(cache)
    dynamic_only = [s for s in dynamic_symbols if s not in set(symbols)]
    if dynamic_only:
        log.info("Re-subscribing %d persisted dynamic symbols: %s", len(dynamic_only), dynamic_only)
        for sym in dynamic_only:
            with _subscribe_lock:
                _subscribed_symbols.add(sym)
                if live_schema == "trades":
                    aggs[sym] = Aggregator(
                        sym, on_close, on_partial=on_partial, partial_min_interval_s=partial_interval_s,
                    )

    health_port = int(optional_env("HEALTH_PORT", "8080"))
    if health_port > 0:
        try:
            _start_health_server(health_port)
        except Exception as exc:
            log.warning("Failed to start health server on :%d: %s", health_port, exc)

    # Backfill recent bars from Databento Historical before we subscribe to
    # live. Closes the visual gap the chart sees between /api/bars (which
    # stops at the ~30-min publish frontier) and the aggregator's first
    # live bar after a restart. Best-effort — historical failures don't
    # block the live subscription.
    backfill_hours = float(optional_env("BACKFILL_HOURS", "2"))
    if backfill_hours > 0:
        backfill_recent_bars(
            api_key=api_key,
            dataset=dataset,
            symbols=symbols + dynamic_only,
            cache=cache,
            hours=backfill_hours,
            db_module=db,
        )

    initial_symbols = symbols + dynamic_only
    client.subscribe(dataset=dataset, schema=live_schema, symbols=initial_symbols, stype_in="raw_symbol")

    # Graceful shutdown — flush any in-progress bars on SIGINT/SIGTERM so
    # we don't lose the partial last minute.
    stopping = {"flag": False}

    def _stop(signum, _frame):
        log.info("Got signal %d, flushing and exiting", signum)
        stopping["flag"] = True
        for a in aggs.values():
            a.force_close()
        try:
            client.stop()
        except Exception:
            pass

    signal.signal(signal.SIGINT, _stop)
    signal.signal(signal.SIGTERM, _stop)

    _health_mark("live_connected", True)

    # The Live iterator yields records we care about:
    #   - SymbolMappingMsg: instrument_id ↔ raw_symbol mapping. These arrive
    #     at session start and whenever a subscription resolves a new symbol.
    #   - Trade records (rtype=TRADE / MBP-0): carry only instrument_id, not
    #     raw_symbol. We resolve via the map we built from SymbolMappingMsg.
    #   - OHLCV records: native bars with instrument_id and scaled prices.
    instrument_to_symbol: dict[int, str] = {}
    record_count = 0
    for rec in client:
        if stopping["flag"]:
            break

        if isinstance(rec, SymbolMappingMsg):
            iid = getattr(rec, "instrument_id", None)
            sym = getattr(rec, "stype_out_symbol", None) or getattr(rec, "stype_in_symbol", None)
            if iid is not None and sym:
                instrument_to_symbol[int(iid)] = str(sym).upper()
            continue

        iid = getattr(rec, "instrument_id", None)
        if iid is None:
            continue
        sym = instrument_to_symbol.get(int(iid))
        if sym is None:
            continue

        if live_schema == "ohlcv-1m":
            if not isinstance(rec, OHLCVMsg):
                continue
            ts_ns = getattr(rec, "ts_event", None)
            if ts_ns is None:
                continue
            bar = Bar(
                t=int(ts_ns / 1e9),
                o=float(rec.open) / FIXED_PRICE_SCALE,
                h=float(rec.high) / FIXED_PRICE_SCALE,
                l=float(rec.low) / FIXED_PRICE_SCALE,
                c=float(rec.close) / FIXED_PRICE_SCALE,
                v=int(rec.volume or 0),
            )
            on_close(sym, bar)
        else:
            agg = aggs.get(sym)
            if agg is None:
                continue

            ts_ns = getattr(rec, "ts_event", None)
            raw_price = getattr(rec, "price", None)
            size = getattr(rec, "size", 0)
            if ts_ns is None or raw_price is None:
                continue

            # DBN prices are int64 in 1e-9 fixed point — $580.12 arrives as
            # 580_120_000_000. Scale to a float before bucketing.
            price = float(raw_price) / FIXED_PRICE_SCALE
            agg.add_trade(ts_seconds=ts_ns / 1e9, price=price, size=int(size or 0))

        record_count += 1
        _health_mark("last_record_at", time.time())
        _health_bump("records_total")
        if record_count % 1000 == 0:
            log.info("Processed %d records", record_count)

    _health_mark("live_connected", False)


def main() -> None:
    """Process entrypoint. Wraps ``run()`` in a reconnect loop so a
    transient Databento WebSocket disconnect doesn't take the whole
    Fly machine down with it.

    Why this matters: the Live SDK's iterator ends cleanly when the
    server hangs up (maintenance windows, network blips). Without a
    wrapper, ``run()`` would return, ``__main__`` would fall through,
    Python would exit 0, and Fly would consider the machine "done"
    instead of crashed — leaving /subscribe unreachable until someone
    redeploys. The loop keeps the HTTP server alive across reconnects
    (it's a daemon thread) and re-initializes the Databento client on
    each iteration so a stale handle doesn't poison the next pass.

    On a fatal/unrecoverable error we sys.exit(1) so Fly's restart
    policy actually fires (a clean exit 0 doesn't always respawn).
    """
    load_env()
    init_sentry()

    backoff_s = 2.0
    max_backoff_s = 60.0
    consecutive_failures = 0
    max_consecutive_failures = 30  # ~10 min of pain before giving up
    while True:
        try:
            run()
            # run() returned normally — almost always means the live
            # iterator ended. Treat as transient and reconnect.
            log.warning("Live loop returned cleanly; reconnecting in %.1fs", backoff_s)
            consecutive_failures += 1
        except SystemExit:
            # require_env() / config errors — propagate so the operator
            # sees the failure clearly in Fly logs. Report it too: a
            # missing Fly secret causing a crashloop is a 2am incident.
            if _sentry is not None:
                _sentry.capture_message(
                    "Aggregator exited during startup (missing or invalid config)",
                    level="fatal",
                )
                _sentry.flush(timeout=5.0)
            raise
        except KeyboardInterrupt:
            log.info("Interrupted — exiting cleanly")
            return
        except Exception:
            log.exception("Live loop crashed; reconnecting in %.1fs", backoff_s)
            consecutive_failures += 1
            if _sentry is not None:
                _sentry.capture_exception()

        if consecutive_failures >= max_consecutive_failures:
            log.error(
                "Aggregator failed %d times in a row; exiting non-zero so Fly respawns the machine",
                consecutive_failures,
            )
            if _sentry is not None:
                _sentry.capture_message(
                    f"Aggregator gave up after {consecutive_failures} consecutive "
                    "failures; exiting non-zero for Fly respawn",
                    level="fatal",
                )
                _sentry.flush(timeout=5.0)
            sys.exit(1)
        _health_mark("live_connected", False)
        time.sleep(backoff_s)
        backoff_s = min(backoff_s * 1.5, max_backoff_s)


if __name__ == "__main__":
    main()
