#!/usr/bin/env python3
"""Backfill small-pullback setup candidates from the local analog corpus.

Unlike backfill_tfo_candidates.py, this hits NO market-data provider. It
reads the historical RTH sessions already checked into the repo under
public/analogs/ — corpus.json plus the per-slug session.json files —
runs scripts/live/pullback_detector.detect_pullbacks over each session's
5-min bars, and upserts any signals into public.setup_candidates as
pattern='pullback'.

The corpus is ~2900 RTH sessions (5-min bars, 09:30-15:55 ET) captured
across ~50 liquid tickers. The pullback detector is timeframe-agnostic,
so running it on these 5-min sessions is a valid backfill — the same
code that scores live 1-min bars.

Idempotent — upserts on the unique key
(symbol, session_date, pattern, direction, fire_ts).

Usage:

    # Dry run — scan the corpus, print a summary, write rows to --out
    python3 scripts/backfill/backfill_pullback_candidates.py \\
        --dry-run --out /tmp/pullback_rows.json

    # Upsert into Supabase (needs SUPABASE_SERVICE_ROLE_KEY)
    python3 scripts/backfill/backfill_pullback_candidates.py

Required env for the write path:
    SUPABASE_SERVICE_ROLE_KEY -- service role, writes bypass RLS
    SUPABASE_URL              -- optional; defaults to the aiedge project
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

# Detector lives in scripts/live/.
ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT / "scripts" / "live"))
from pullback_detector import Bar, detect_pullbacks  # noqa: E402

CORPUS_PATH = ROOT / "public" / "analogs" / "corpus.json"
ANALOGS_ROOT = ROOT / "public" / "analogs"
DEFAULT_SUPABASE_URL = "https://ajqzvmbtfgumrkwfxmcn.supabase.co"
ET = ZoneInfo("America/New_York")
TIMEFRAME = "5m"
# Databento publishes fixed-point prices scaled by 1e9. The per-slug
# session.json files store them scaled; the 43 inline full_session
# entries store plain floats. Detect by magnitude — no real equity
# trades above this — and unscale when needed.
PRICE_SCALE = 1e9
SCALE_THRESHOLD = 100_000.0


def _session_bars(date_str: str, session: dict) -> list[Bar]:
    """Build a chronological Bar list from a corpus session dict
    (columnar open/high/low/close/times). Unscales fixed-point prices
    and converts each ET wall-clock 'HH:MM' to a UTC epoch.
    """
    o, h, l, c = session["open"], session["high"], session["low"], session["close"]
    times = session["times"]
    n = min(len(o), len(h), len(l), len(c), len(times))
    if n == 0:
        return []

    scale = PRICE_SCALE if max(c[:n]) > SCALE_THRESHOLD else 1.0
    y, m, d = (int(x) for x in date_str.split("-"))

    bars: list[Bar] = []
    for i in range(n):
        hh, mm = (int(x) for x in str(times[i]).split(":"))
        epoch = int(datetime(y, m, d, hh, mm, tzinfo=ET).astimezone(timezone.utc).timestamp())
        bars.append(Bar(
            t=epoch,
            o=float(o[i]) / scale,
            h=float(h[i]) / scale,
            l=float(l[i]) / scale,
            c=float(c[i]) / scale,
        ))
    return bars


def _load_session(entry: dict) -> dict | None:
    """Return the session dict for a corpus entry — the inline
    full_session if present, else the per-slug session.json.
    """
    inline = entry.get("full_session")
    if isinstance(inline, dict) and inline.get("close"):
        return inline
    slug_path = ANALOGS_ROOT / entry["slug"] / "session.json"
    if not slug_path.exists():
        return None
    try:
        return json.loads(slug_path.read_text())
    except Exception:
        return None


def _signal_to_row(symbol: str, session_date: str, sig) -> dict:
    return {
        "symbol": symbol,
        "session_date": session_date,
        "pattern": "pullback",
        "direction": sig.direction,
        "fire_ts": sig.fire_ts,
        "fired_bar_index": sig.fire_index,
        "score": sig.score,
        "status": "new",
        "source": "backfill",
        "features": {
            "timeframe": sig.timeframe,
            "entry_price": sig.entry_price,
            "stop_price": sig.stop_price,
            "impulse_atr": sig.impulse_atr,
            "pullback_len": sig.pullback_len,
            "retrace": sig.retrace,
            "impulse_start_ts": sig.impulse_start_ts,
            "impulse_top_ts": sig.impulse_top_ts,
            "pullback_bar_timestamps": list(sig.pullback_bar_timestamps),
        },
    }


def _upsert(supabase_url: str, key: str, rows: list[dict], timeout: float = 30.0) -> tuple[int, str | None]:
    if not rows:
        return 200, None
    endpoint = (
        supabase_url.rstrip("/")
        + "/rest/v1/setup_candidates"
        + "?on_conflict=symbol,session_date,pattern,direction,fire_ts"
    )
    req = urllib.request.Request(
        endpoint,
        data=json.dumps(rows).encode("utf-8"),
        method="POST",
        headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            "Prefer": "resolution=merge-duplicates,return=minimal",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status, None
    except urllib.error.HTTPError as e:
        return e.code, e.read()[:300].decode("utf-8", errors="replace")
    except Exception as e:
        return 0, str(e)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Backfill small-pullback candidates from the analog corpus.")
    parser.add_argument("--supabase-url", default=os.environ.get("SUPABASE_URL") or DEFAULT_SUPABASE_URL)
    parser.add_argument("--dry-run", action="store_true",
                        help="Scan + summarize, do not write to Supabase")
    parser.add_argument("--out", default=None,
                        help="Write the computed rows to this JSON file")
    parser.add_argument("--batch", type=int, default=500,
                        help="Rows per Supabase upsert request (default 500)")
    args = parser.parse_args(argv)

    if not CORPUS_PATH.exists():
        print(f"ERROR: corpus not found at {CORPUS_PATH}", flush=True)
        return 2
    corpus = json.loads(CORPUS_PATH.read_text())
    entries = corpus.get("entries", [])
    print(f"Corpus: {len(entries)} sessions", flush=True)

    rows: list[dict] = []
    scanned = 0
    skipped = 0
    for entry in entries:
        session = _load_session(entry)
        if session is None:
            skipped += 1
            continue
        bars = _session_bars(entry["date"], session)
        if len(bars) < 24:
            skipped += 1
            continue
        scanned += 1
        for sig in detect_pullbacks(bars, timeframe=TIMEFRAME):
            rows.append(_signal_to_row(entry["ticker"].upper(), entry["date"], sig))

    longs = sum(1 for r in rows if r["direction"] == "long")
    shorts = len(rows) - longs
    print(f"Scanned {scanned} sessions ({skipped} skipped) -> "
          f"{len(rows)} pullback signals ({longs} long, {shorts} short)", flush=True)

    if args.out:
        Path(args.out).write_text(json.dumps(rows))
        print(f"Wrote {len(rows)} rows to {args.out}", flush=True)

    if args.dry_run:
        for r in rows[:5]:
            print(json.dumps(r, indent=2), flush=True)
        return 0

    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not key:
        print("ERROR: SUPABASE_SERVICE_ROLE_KEY required (or pass --dry-run).", flush=True)
        return 2

    written = 0
    for i in range(0, len(rows), args.batch):
        batch = rows[i:i + args.batch]
        status, err = _upsert(args.supabase_url, key, batch)
        if err:
            print(f"  [supabase] HTTP {status}: {err[:200]}", flush=True)
            return 1
        written += len(batch)
        print(f"  [supabase] upserted {written}/{len(rows)}", flush=True)

    print(f"\nDone. {written} pullback candidates upserted.", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
