#!/usr/bin/env python3
"""
Generate per-slug full-session JSON files for analog corpus entries.

corpus.json is kept slim (no full_session) so it's cheap to ship on every
History → Analogs page load. The "what happened after" chart needs full
RTH bars though, so we write those out as small per-slug files at
  public/analogs/<slug>/session.json
The page lazy-fetches one of these only when an entry is selected (or
shown as a match), so the heavy data is paid for on click, not on page
load.

Idempotent: skips entries whose session.json already exists.

Sources the bars from the local Databento parquet cache (~/data/databento/),
same way scripts/backfill_corpus_from_databento.py does.

Usage:
    python3 scripts/render_full_sessions.py
    python3 scripts/render_full_sessions.py --force   # rewrite existing files
    python3 scripts/render_full_sessions.py --tickers QQQ NVDA -v
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import date as date_t, datetime
from pathlib import Path

import pandas as pd

CORPUS_PATH = Path(__file__).resolve().parent.parent / "public" / "analogs" / "corpus.json"
OUT_ROOT = Path(__file__).resolve().parent.parent / "public" / "analogs"
DATA_ROOT = Path.home() / "data" / "databento"

ET = "America/New_York"


def _find_parquet(ticker: str, yyyy: str, mm: str) -> Path | None:
    for feed in ("ARCX.PILLAR", "XNAS.ITCH"):
        p = DATA_ROOT / f"{feed}_{ticker}_ohlcv-1m_{yyyy}-{mm}.parquet"
        if p.exists():
            return p
    return None


def _load_session(ticker: str, day: date_t) -> dict | None:
    """Load + resample one RTH session to 5-min bars + EMA20.

    EMA20 is seeded with the prior trading day's session (same month
    parquet) so the open's EMA reflects yesterday's price action — what
    a trader actually sees on a 5-min chart with a continuous EMA line.
    Without seeding the EMA "warms up" from close[0] over the first ~20
    bars, making the morning EMA channel functionally redundant with
    close in the DTW comparison.
    """
    p = _find_parquet(ticker, str(day.year), f"{day.month:02d}")
    if p is None:
        return None
    try:
        df = pd.read_parquet(p)
    except Exception:
        return None
    if df.empty:
        return None
    df.index = df.index.tz_convert(ET)
    for c in ("open", "high", "low", "close"):
        df[c] = df[c] * 1e9
    # RTH only across the whole month, then split prior + today.
    df = df[(df.index.time >= pd.Timestamp("09:30").time()) &
            (df.index.time <  pd.Timestamp("16:00").time())]
    today_raw = df[df.index.date == day]
    prior_raw = df[df.index.date < day]
    if today_raw.empty:
        return None

    today_5m = today_raw[["open", "high", "low", "close"]].resample("5min").agg(
        {"open": "first", "high": "max", "low": "min", "close": "last"}
    ).dropna()
    if today_5m.empty:
        return None

    if not prior_raw.empty:
        # Use the most-recent prior trading day in the same month.
        last_prior_date = prior_raw.index.date.max()
        prior_one_day = prior_raw[prior_raw.index.date == last_prior_date]
        prior_5m = prior_one_day[["close"]].resample("5min").agg({"close": "last"}).dropna()
        combined = pd.concat([prior_5m, today_5m[["close"]]])
        ema_full = combined["close"].ewm(span=20, adjust=False).mean()
        today_5m["ema20"] = ema_full.loc[today_5m.index]
    else:
        # First trading day of the month — fall back to from-scratch.
        today_5m["ema20"] = today_5m["close"].ewm(span=20, adjust=False).mean()

    return {
        "open":  [round(float(x), 4) for x in today_5m["open"]],
        "high":  [round(float(x), 4) for x in today_5m["high"]],
        "low":   [round(float(x), 4) for x in today_5m["low"]],
        "close": [round(float(x), 4) for x in today_5m["close"]],
        "ema20": [round(float(x), 4) for x in today_5m["ema20"]],
        "times": [t.strftime("%H:%M") for t in today_5m.index],
    }


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--force", action="store_true",
                    help="Rewrite session.json files that already exist")
    ap.add_argument("--tickers", nargs="+", default=None,
                    help="Limit to specific tickers")
    ap.add_argument("--limit", type=int, default=0,
                    help="Cap number of files written (smoke testing)")
    ap.add_argument("--verbose", "-v", action="store_true")
    args = ap.parse_args()

    if not CORPUS_PATH.exists():
        print(f"ERROR: corpus not found at {CORPUS_PATH}", file=sys.stderr)
        return 1
    corpus = json.loads(CORPUS_PATH.read_text())
    entries = corpus.get("entries", [])
    print(f"Corpus: {len(entries)} entries")

    written = 0
    skipped_exists = 0
    skipped_have_inline = 0
    skipped_no_data = 0
    skipped_filter = 0

    for e in entries:
        slug = e["slug"]
        ticker = e["ticker"]
        date_str = e["date"]

        if args.tickers and ticker not in args.tickers:
            skipped_filter += 1
            continue

        # Entries that already carry full_session inline (the original 43
        # strong-trend entries) don't need a separate file.
        if e.get("full_session") and e["full_session"].get("open"):
            skipped_have_inline += 1
            continue

        out_dir = OUT_ROOT / slug
        out_path = out_dir / "session.json"
        if out_path.exists() and not args.force:
            skipped_exists += 1
            continue

        try:
            day = datetime.strptime(date_str, "%Y-%m-%d").date()
        except ValueError:
            skipped_no_data += 1
            continue

        bundle = _load_session(ticker, day)
        if bundle is None:
            skipped_no_data += 1
            if args.verbose:
                print(f"  no data: {slug}")
            continue

        out_dir.mkdir(parents=True, exist_ok=True)
        out_path.write_text(json.dumps(bundle, separators=(",", ":")))
        written += 1
        if args.verbose and written % 100 == 0:
            print(f"  ... wrote {written}")
        if args.limit and written >= args.limit:
            break

    print(f"\nResults:")
    print(f"  written:        {written}")
    print(f"  skipped (exists):       {skipped_exists}")
    print(f"  skipped (inline):       {skipped_have_inline}")
    print(f"  skipped (filter):       {skipped_filter}")
    print(f"  skipped (no parquet):   {skipped_no_data}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
