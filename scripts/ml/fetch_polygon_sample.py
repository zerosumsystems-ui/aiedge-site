#!/usr/bin/env python3
"""Fetch a random, un-curated 1-minute bar sample from Polygon.io.

This builds the corpus for a *bias-checked* microchannel-pullback
backtest. It deliberately avoids every bias in the curated /spikes
gallery:

  - Random, not hand-picked. Symbol-days are drawn at random.
  - Survivorship-complete. The per-day grouped snapshot includes names
    that later delisted (they appear on the days they actually traded).
  - Tradeable universe. Each day is filtered to common stocks with
    price >= MIN_PRICE and dollar volume >= MIN_DOLLAR_VOL — the names
    a trader could actually have taken, not illiquid micro-caps.

Procedure:
  1. Pick N_DATES random weekdays across the 5-year window.
  2. For each, pull Polygon's grouped daily snapshot (all US stocks),
     keep the liquid common stocks, pick TICKERS_PER_DATE at random.
  3. Fetch each (ticker, date) 1-minute session, keep RTH bars only,
     write artifacts/backtest/bars_1m/<TICKER>_<DATE>.json.
  4. Write a manifest (sample + params + seed) for the backtest.

Reads POLYGON_API_KEY from the environment or .env.local.

Usage:
    python3 scripts/ml/fetch_polygon_sample.py            # full sample
    python3 scripts/ml/fetch_polygon_sample.py --dates 6  # smoke test
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import random
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[2]
CACHE_DIR = ROOT / "artifacts" / "backtest" / "bars_1m"
MANIFEST = ROOT / "artifacts" / "backtest" / "polygon_sample_manifest.json"
CS_UNIVERSE = ROOT / "artifacts" / "backtest" / "polygon_cs_universe.json"
BASE = "https://api.polygon.io"
ET = ZoneInfo("America/New_York")

# ----- pre-registered sampling config (fixed before any results seen) ----
WINDOW_START = dt.date(2021, 5, 19)
WINDOW_END = dt.date(2026, 5, 19)
N_DATES = 520               # random trading days drawn
TICKERS_PER_DATE = 6        # random liquid tickers per day -> ~3,000 target
MIN_PRICE = 5.0             # tradeable: no sub-$5 names
MIN_DOLLAR_VOL = 10_000_000 # tradeable: >= $10M traded that day
MIN_RTH_BARS = 180          # a usable session (half-days included)
RANDOM_SEED = 17
RTH_OPEN = dt.time(9, 30)
RTH_CLOSE = dt.time(16, 0)


def _load_key() -> str:
    key = os.environ.get("POLYGON_API_KEY")
    if not key:
        envf = ROOT / ".env.local"
        if envf.exists():
            for line in envf.read_text().splitlines():
                if line.startswith("POLYGON_API_KEY="):
                    key = line.split("=", 1)[1].strip()
                    break
    if not key:
        print("ERROR: POLYGON_API_KEY not set", file=sys.stderr)
        sys.exit(2)
    return key


KEY = _load_key()


def get(path: str) -> dict | None:
    """GET a Polygon path with the key appended. Retries transient errors."""
    sep = "&" if "?" in path else "?"
    url = f"{BASE}{path}{sep}apiKey={KEY}"
    for attempt in range(5):
        try:
            with urllib.request.urlopen(url, timeout=40) as r:
                return json.loads(r.read())
        except urllib.error.HTTPError as e:
            if e.code == 429:                       # rate limited — back off
                time.sleep(2 + 2 * attempt)
                continue
            if e.code in (404, 403):
                return None
            time.sleep(1 + attempt)
        except Exception:
            time.sleep(1 + attempt)
    return None


def random_trading_dates(n: int, rng: random.Random) -> list[str]:
    """n distinct random weekdays in the window (holidays drop out later
    when their grouped snapshot comes back empty)."""
    span = (WINDOW_END - WINDOW_START).days
    out: set[str] = set()
    while len(out) < n:
        d = WINDOW_START + dt.timedelta(days=rng.randint(0, span))
        if d.weekday() < 5:                          # Mon-Fri
            out.add(d.isoformat())
    return sorted(out)


def load_cs_universe() -> set[str]:
    """Every common stock (CS) Polygon knows — active AND delisted — so the
    sample is survivorship-complete. Cached after the first build."""
    if CS_UNIVERSE.exists():
        return set(json.loads(CS_UNIVERSE.read_text()))
    tickers: set[str] = set()
    for active in ("true", "false"):
        path = (f"/v3/reference/tickers?type=CS&market=stocks"
                f"&active={active}&limit=1000")
        while path:
            d = get(path)
            if not d:
                break
            for row in d.get("results", []):
                if row.get("ticker"):
                    tickers.add(row["ticker"])
            nxt = d.get("next_url")
            path = nxt.replace(BASE, "") if nxt else None
    CS_UNIVERSE.parent.mkdir(parents=True, exist_ok=True)
    CS_UNIVERSE.write_text(json.dumps(sorted(tickers)))
    return tickers


def liquid_tickers(date: str, cs: set[str]) -> list[str]:
    """Common stocks that traded liquidly on `date` — price >= MIN_PRICE,
    dollar volume >= MIN_DOLLAR_VOL, and in the CS universe (no ETFs,
    funds, warrants, units, preferreds)."""
    d = get(f"/v2/aggs/grouped/locale/us/market/stocks/{date}"
            f"?adjusted=true&include_otc=false")
    if not d or d.get("status") not in ("OK", "DELAYED") or not d.get("results"):
        return []
    out = []
    for row in d["results"]:
        t = row.get("T")
        c = row.get("c")
        v = row.get("v")
        if not t or c is None or v is None or t not in cs:
            continue
        if c >= MIN_PRICE and c * v >= MIN_DOLLAR_VOL:
            out.append(t)
    return out


def fetch_session(ticker: str, date: str) -> list[dict] | None:
    """One RTH session of 1-minute bars as {t(sec),o,h,l,c,v}, or None."""
    d = get(f"/v2/aggs/ticker/{ticker}/range/1/minute/{date}/{date}"
            f"?adjusted=true&sort=asc&limit=50000")
    if not d or not d.get("results"):
        return None
    bars = []
    for r in d["results"]:
        ts = dt.datetime.fromtimestamp(r["t"] / 1000, tz=dt.timezone.utc).astimezone(ET)
        if not (RTH_OPEN <= ts.time() < RTH_CLOSE):
            continue
        bars.append({
            "t": int(r["t"] // 1000),
            "o": round(float(r["o"]), 4),
            "h": round(float(r["h"]), 4),
            "l": round(float(r["l"]), 4),
            "c": round(float(r["c"]), 4),
            "v": float(r.get("v") or 0),
        })
    return bars if len(bars) >= MIN_RTH_BARS else None


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dates", type=int, default=N_DATES,
                    help="random trading days to draw")
    ap.add_argument("--per-date", type=int, default=TICKERS_PER_DATE)
    ap.add_argument("--seed", type=int, default=RANDOM_SEED)
    args = ap.parse_args()

    rng = random.Random(args.seed)
    CACHE_DIR.mkdir(parents=True, exist_ok=True)

    cs = load_cs_universe()
    print(f"Common-stock universe: {len(cs)} tickers (active + delisted)")

    dates = random_trading_dates(args.dates, rng)
    print(f"Drawing {args.per_date} liquid common stocks from each of "
          f"{len(dates)} random trading days...")

    sample: list[dict] = []
    empty_days = 0
    t0 = time.time()
    for i, date in enumerate(dates):
        pool = liquid_tickers(date, cs)
        if not pool:
            empty_days += 1
            continue
        picks = rng.sample(pool, min(args.per_date, len(pool)))
        for ticker in picks:
            bars = fetch_session(ticker, date)
            if bars is None:
                continue
            (CACHE_DIR / f"{ticker}_{date}.json").write_text(json.dumps(bars))
            sample.append({"symbol": ticker, "session_date": date,
                            "bars": len(bars)})
        if (i + 1) % 50 == 0:
            print(f"  {i + 1}/{len(dates)} days · {len(sample)} sessions "
                  f"· {round(time.time() - t0)}s")

    manifest = {
        "generated_from": "scripts/ml/fetch_polygon_sample.py",
        "source": "polygon.io ohlcv 1-minute aggregates",
        "params": {
            "window_start": WINDOW_START.isoformat(),
            "window_end": WINDOW_END.isoformat(),
            "n_dates_drawn": len(dates),
            "tickers_per_date": args.per_date,
            "min_price": MIN_PRICE,
            "min_dollar_volume": MIN_DOLLAR_VOL,
            "min_rth_bars": MIN_RTH_BARS,
            "random_seed": args.seed,
        },
        "empty_days": empty_days,
        "n_sessions": len(sample),
        "sample": sorted(sample, key=lambda s: (s["session_date"], s["symbol"])),
    }
    MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"\n{len(sample)} sessions cached in {round(time.time() - t0)}s "
          f"({empty_days} empty/holiday days skipped)")
    print(f"manifest: {MANIFEST.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
