"""Phase 1 of issue #26 — live bar aggregator.

Subscribes to Databento live data, writes 1-minute OHLCV bars to Upstash Redis
(sorted set, keyed by ticker, scored by bar timestamp). The Next.js
/api/bars/live route reads from the same key.

Designed to run as a long-lived process on the Mac mini next to
live_scanner.py.

Required env vars (load from your existing scanner .env or the repo
.env.local — same loading order as probe_databento_entitlements.py):

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

Install once (on the Mac mini):
    pip install databento

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
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable

log = logging.getLogger("live_bars")
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)


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
    repo_root = Path(__file__).resolve().parent.parent
    _load_env_file(repo_root / ".env.local")
    _load_env_file(repo_root / ".env")
    _load_env_file(Path("/Users/williamkosloski/video-pipeline/credentials/.env"))


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

    def __init__(self, symbol: str, on_close: Callable[[str, "Bar"], None]):
        self.symbol = symbol
        self.on_close = on_close
        self.current: Bar | None = None

    def add_trade(self, ts_seconds: float, price: float, size: int) -> None:
        bucket = int(ts_seconds // 60) * 60
        if self.current is None:
            self.current = Bar(t=bucket, o=price, h=price, l=price, c=price, v=size)
            return
        if bucket > self.current.t:
            # Bar rolled. Flush the closed one, start a fresh one.
            closed = self.current
            self.current = Bar(t=bucket, o=price, h=price, l=price, c=price, v=size)
            self.on_close(self.symbol, closed)
            return
        # Same bucket — update OHLC.
        b = self.current
        b.h = max(b.h, price)
        b.l = min(b.l, price)
        b.c = price
        b.v += size

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

    def on_close(sym: str, bar: Bar) -> None:
        log.info(
            "[%s] %d  o=%.2f h=%.2f l=%.2f c=%.2f v=%d",
            sym, bar.t, bar.o, bar.h, bar.l, bar.c, bar.v,
        )
        cache.write_bar(sym, bar)

    aggs: dict[str, Aggregator] = {s: Aggregator(s, on_close) for s in symbols}

    try:
        import databento as db  # type: ignore[import-not-found]
    except ImportError:
        log.error("Missing dep: pip install databento")
        sys.exit(2)
    FIXED_PRICE_SCALE = db.FIXED_PRICE_SCALE
    OHLCVMsg = db.OHLCVMsg
    SymbolMappingMsg = db.SymbolMappingMsg

    # Live client. The SDK handles reconnect with replay so a brief drop
    # doesn't gap the cache.
    client = db.Live(key=api_key)
    client.subscribe(dataset=dataset, schema=live_schema, symbols=symbols, stype_in="raw_symbol")

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
        if record_count % 1000 == 0:
            log.info("Processed %d records", record_count)


if __name__ == "__main__":
    run()
