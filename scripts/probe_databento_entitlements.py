"""Phase 0 diagnostic for issue #26 — probe Databento entitlements.

Confirms which datasets the current API key can access on the historical
endpoint, which schemas are available per dataset, and how fresh those
schemas publish (i.e. how close to "now" we can request without a 422).

Usage:
    DATABENTO_API_KEY=... python3 scripts/probe_databento_entitlements.py

Optional live probe knobs:
    LIVE_PROBE_SCHEMAS=trades,ohlcv-1m
    LIVE_PROBE_SYMBOLS=SPY,QQQ
    LIVE_PROBE_TIMEOUT_SECONDS=8

Reads DATABENTO_API_KEY from the environment, or from the same
credentials/.env file the existing scanner scripts use, or from a local
.env.local at the repo root.

Output is a plain-text report printed to stdout — paste it back into the
issue / chat so we can pick the right dataset for the live aggregator.
"""

from __future__ import annotations

import base64
import json
import os
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

HIST = "https://hist.databento.com/v0"
LIVE_PROBE_TIMEOUT_SECONDS = float(os.environ.get("LIVE_PROBE_TIMEOUT_SECONDS", "8"))
LIVE_PROBE_SCHEMAS = [
    s.strip()
    for s in os.environ.get("LIVE_PROBE_SCHEMAS", "trades,ohlcv-1m").split(",")
    if s.strip()
]
LIVE_PROBE_SYMBOLS = [
    s.strip().upper()
    for s in os.environ.get(
        "LIVE_PROBE_SYMBOLS",
        os.environ.get("LIVE_SYMBOLS", "SPY"),
    ).split(",")
    if s.strip()
]

# Datasets we care about for the live wiring decision. DBEQ.BASIC is
# Databento's own consolidated equities feed (likely real-time on the
# $199/mo US Equities plan). EQUS.MINI is what /api/bars uses today.
# The single-venue raw feeds are listed because the backfill scripts
# pull from them — useful to know if they're entitled.
CANDIDATE_DATASETS = [
    "DBEQ.BASIC",
    "EQUS.MINI",
    "EQUS.SUMMARY",
    "XNAS.ITCH",
    "ARCX.PILLAR",
    "IEXG.TOPS",
]


def load_api_key() -> str:
    key = os.environ.get("DATABENTO_API_KEY")
    if key:
        return key

    # Try the repo-local .env.local first (Next.js convention).
    repo_root = Path(__file__).resolve().parent.parent
    for candidate in (repo_root / ".env.local", repo_root / ".env"):
        if candidate.exists():
            for raw in candidate.read_text().splitlines():
                line = raw.strip()
                if line.startswith("DATABENTO_API_KEY="):
                    return line.split("=", 1)[1].strip().strip('"').strip("'")

    # Fall back to the scanner's credentials .env when VIDEO_PIPELINE_DIR
    # points at a local scanner checkout (mirrors _chart_data.py).
    _vp = os.environ.get("VIDEO_PIPELINE_DIR")
    vp_env = Path(_vp) / "credentials" / ".env" if _vp else None
    if vp_env and vp_env.exists():
        for raw in vp_env.read_text().splitlines():
            line = raw.strip()
            if line.startswith("DATABENTO_API_KEY="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")

    print("ERROR: DATABENTO_API_KEY not found in env, .env.local, or credentials/.env")
    sys.exit(1)


def get(path: str, key: str, params: dict[str, str] | None = None) -> tuple[int, object]:
    qs = ("?" + urllib.parse.urlencode(params)) if params else ""
    auth = "Basic " + base64.b64encode(f"{key}:".encode()).decode()
    req = urllib.request.Request(f"{HIST}{path}{qs}", headers={"Authorization": auth})
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            body = resp.read().decode()
            try:
                return resp.status, json.loads(body)
            except json.JSONDecodeError:
                return resp.status, body
    except urllib.error.HTTPError as exc:
        body = exc.read().decode()
        try:
            return exc.code, json.loads(body)
        except json.JSONDecodeError:
            return exc.code, body
    except urllib.error.URLError as exc:
        return -1, str(exc)


def section(title: str) -> None:
    print()
    print("=" * 72)
    print(title)
    print("=" * 72)


def classify_live_error(message: str) -> str:
    msg = message.lower()
    if any(
        token in msg
        for token in (
            "not entitled",
            "not licensed",
            "license",
            "permission",
            "not authorized",
            "unauthorized",
            "forbidden",
            "auth",
            "api key",
            "subscription",
        )
    ):
        return "LICENSE_REQUIRED"
    if any(
        token in msg
        for token in (
            "timed out",
            "timeout",
            "connection",
            "failed",
            "nodename",
            "name or service",
            "temporary failure",
            "network",
            "gateway",
            "unavailable",
            "connection lost",
        )
    ):
        return "GATEWAY_UNAVAILABLE"
    # Unknown gateway rejections are safer to treat as not streamable for this key
    # than as a successful entitlement.
    return "LICENSE_REQUIRED"


def probe_live_dataset(key: str, dataset: str, schema: str, symbols: list[str]) -> tuple[str, str]:
    try:
        import databento as db  # type: ignore[import-not-found]
        import databento_dbn as dbn  # type: ignore[import-not-found]
    except ImportError as exc:
        return "GATEWAY_UNAVAILABLE", f"local Databento SDK import failed: {exc}"

    got_market_record = threading.Event()
    got_gateway_error = threading.Event()
    result = {
        "record_type": "",
        "error": "",
        "control_count": 0,
    }

    def on_record(record: object) -> None:
        record_type = type(record).__name__
        if isinstance(record, dbn.ErrorMsg):
            result["error"] = str(getattr(record, "err", record))
            got_gateway_error.set()
            return
        if isinstance(record, (dbn.Metadata, dbn.SymbolMappingMsg, dbn.SystemMsg)):
            result["control_count"] += 1
            return
        result["record_type"] = record_type
        got_market_record.set()

    client = None
    try:
        client = db.Live(key=key, heartbeat_interval_s=5)
        client.add_callback(on_record)
        client.subscribe(
            dataset=dataset,
            schema=schema,
            symbols=symbols,
            stype_in="raw_symbol",
        )
        client.start()
        deadline = time.monotonic() + LIVE_PROBE_TIMEOUT_SECONDS
        while time.monotonic() < deadline:
            if got_market_record.is_set():
                return "LICENSED_AND_STREAMING", f"received {result['record_type']}"
            if got_gateway_error.is_set():
                detail = result["error"] or "gateway error"
                return classify_live_error(detail), detail
            time.sleep(0.1)
        return (
            "LICENSED_BUT_SILENT",
            f"subscription accepted; no {schema} record within "
            f"{LIVE_PROBE_TIMEOUT_SECONDS:g}s"
            + (
                f" (control messages: {result['control_count']})"
                if result["control_count"]
                else ""
            ),
        )
    except Exception as exc:
        detail = str(exc) or repr(exc)
        return classify_live_error(detail), detail
    finally:
        if client is not None:
            try:
                client.stop()
                client.block_for_close(timeout=1)
            except Exception:
                try:
                    client.terminate()
                except Exception:
                    pass


def main() -> None:
    key = load_api_key()
    print(f"Using API key ending in ...{key[-4:]} (length {len(key)})")

    section("1. Datasets accessible on the historical endpoint")
    status, data = get("/metadata.list_datasets", key)
    if status == 200 and isinstance(data, list):
        all_datasets = sorted(data)
        print(f"  {len(all_datasets)} datasets total")
        for ds in all_datasets:
            tag = " ⭐" if ds in CANDIDATE_DATASETS else ""
            print(f"    - {ds}{tag}")
    else:
        print(f"  HTTP {status}: {data}")

    section("2. Schemas per candidate dataset")
    for ds in CANDIDATE_DATASETS:
        status, data = get("/metadata.list_schemas", key, {"dataset": ds})
        if status == 200 and isinstance(data, list):
            ohlcv = sorted(s for s in data if s.startswith("ohlcv"))
            print(f"  {ds:20s} ohlcv schemas: {ohlcv or '(none)'}")
        else:
            print(f"  {ds:20s} HTTP {status}")

    section("3. Freshness probe — how close to 'now' can each dataset serve?")
    # Walk back 5 / 30 / 90 / 240 minutes and ask for a 1-min cost on SPY.
    # If get_cost succeeds at offset N, the dataset's publish frontier is
    # within N minutes. Cheap, doesn't actually pull bars.
    now = datetime.now(timezone.utc).replace(microsecond=0)
    for ds in ("DBEQ.BASIC", "EQUS.MINI"):
        print(f"\n  {ds}")
        for minutes_ago in (5, 30, 60, 120):
            end = now - timedelta(minutes=minutes_ago)
            start = end - timedelta(minutes=1)
            status, data = get(
                "/metadata.get_cost",
                key,
                {
                    "dataset": ds,
                    "schema": "ohlcv-1m",
                    "symbols": "SPY",
                    "start": start.isoformat().replace("+00:00", "Z"),
                    "end": end.isoformat().replace("+00:00", "Z"),
                },
            )
            if status == 200:
                print(f"    {minutes_ago:>4d} min ago: OK  (cost={data})")
            else:
                detail = data
                if isinstance(data, dict):
                    detail = data.get("detail", data)
                print(f"    {minutes_ago:>4d} min ago: HTTP {status} — {detail}")

    section("4. Live stream entitlement smoke test")
    print(
        f"  Attempting db.Live.subscribe() per dataset/schema with "
        f"symbols={LIVE_PROBE_SYMBOLS!r}"
    )
    print(f"  Wait per accepted subscription: {LIVE_PROBE_TIMEOUT_SECONDS:g}s")
    for ds in CANDIDATE_DATASETS:
        for schema in LIVE_PROBE_SCHEMAS:
            live_status, detail = probe_live_dataset(key, ds, schema, LIVE_PROBE_SYMBOLS)
            print(f"  {ds:20s} {schema:10s} {live_status:22s} {detail}")

    print()
    print("Done. Paste this output back to the chat / issue #26.")


if __name__ == "__main__":
    main()
