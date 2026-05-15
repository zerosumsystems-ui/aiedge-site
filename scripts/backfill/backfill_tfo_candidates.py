#!/usr/bin/env python3
"""Backfill TFO setup candidates into Supabase.

Sweeps (symbol × trading-day) over a recent window, fetches RTH 5-min
bars from the AIedge /api/bars endpoint (which already speaks
Databento), runs scripts/tfo_detector.detect_tfo on each session, and
upserts any signals into the public.setup_candidates table.

Idempotent — re-runs upsert on the unique key
(symbol, session_date, pattern, direction).

Usage:

    # Last 30 trading days, default symbols, against prod
    python3 scripts/backfill_tfo_candidates.py

    # Custom window + symbols, against local dev server
    python3 scripts/backfill_tfo_candidates.py \\
        --base-url http://127.0.0.1:3000 \\
        --tickers SPY NVDA AAPL --days 60

    # Dry run — print would-be writes, no Supabase calls
    python3 scripts/backfill_tfo_candidates.py --dry-run

Required env:
    SUPABASE_URL              -- e.g. https://YOUR.supabase.co
    SUPABASE_SERVICE_ROLE_KEY -- service role, writes bypass RLS
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import asdict
from datetime import date as date_t, datetime, timedelta
from typing import Iterable

# Detector lives in scripts/live/.
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "live"))
from tfo_detector import Bar5m, detect_tfo  # noqa: E402

# Highly liquid US equities — index ETFs + megacaps + sector volatility.
# Picked for: tight spreads (clean Databento data), real intraday range
# (TFO needs an actual session move to fire), and a mix of microstructure
# styles (tech-megacap, financial, consumer-volatile) so the model isn't
# fitting a single style.
DEFAULT_TICKERS = [
    # Index ETFs
    "SPY", "QQQ", "IWM", "DIA",
    # Sector ETFs (added in 50-ticker expansion)
    "XLF", "XLE", "XLK", "XLV", "XLY", "XLI", "XLP", "XLU",
    # Mega-cap tech
    "NVDA", "AAPL", "MSFT", "AMZN", "GOOGL", "META", "TSLA",
    "AMD", "NFLX", "AVGO", "CRM", "ORCL", "ADBE", "INTC",
    # Financials / payments
    "JPM", "BAC", "V", "MA", "GS",
    # Consumer / staples (added in 50-ticker expansion)
    "KO", "PG", "WMT", "COST", "HD", "DIS",
    # Healthcare (added in 50-ticker expansion)
    "UNH", "JNJ", "LLY", "ABBV", "MRK",
    # Industrials / defense (added in 50-ticker expansion). BRK.B
    # excluded — Databento symbol format varies for class-B shares.
    "BA",
    # Volatile movers
    "COIN", "PLTR", "UBER", "SHOP", "SMCI", "GME",
]
DEFAULT_DAYS = 365
DEFAULT_BASE_URL = "https://www.aiedge.trade"


def previous_trading_days(end: date_t, count: int) -> list[date_t]:
    """Walk backwards from `end`, skipping weekends, returning `count`
    weekday dates (most recent first)."""
    out: list[date_t] = []
    d = end
    while len(out) < count:
        if d.weekday() < 5:  # 0..4 = Mon..Fri
            out.append(d)
        d -= timedelta(days=1)
    return out


def fetch_session_5m_bars(base_url: str, ticker: str, day: date_t, timeout: float = 60.0) -> list[Bar5m]:
    """Pull one RTH session's worth of 5-min bars via /api/bars.

    Returns [] on any non-2xx response or empty payload — the caller
    just skips that (symbol, day) instead of aborting the sweep.
    """
    qs = urllib.parse.urlencode({
        "ticker": ticker,
        "from": day.isoformat(),
        "to": day.isoformat(),
        "tf": "5min",
        "session": "rth",
        "limit": "200",
    })
    url = f"{base_url}/api/bars?{qs}"
    try:
        with urllib.request.urlopen(url, timeout=timeout) as resp:
            payload = json.loads(resp.read())
    except urllib.error.HTTPError as e:
        body = e.read()[:120].decode("utf-8", errors="replace")
        print(f"  [skip] {ticker} {day} HTTP {e.code}: {body}", flush=True)
        return []
    except Exception as e:
        print(f"  [skip] {ticker} {day} err: {e}", flush=True)
        return []

    raw = payload.get("bars") or []
    bars: list[Bar5m] = []
    for b in raw:
        try:
            bars.append(Bar5m(
                t=int(b["t"]),
                o=float(b["o"]),
                h=float(b["h"]),
                l=float(b["l"]),
                c=float(b["c"]),
                v=float(b.get("v") or 0),
            ))
        except (KeyError, TypeError, ValueError):
            # Malformed row — skip
            continue
    return bars


def supabase_upsert(
    supabase_url: str,
    service_role_key: str,
    rows: list[dict],
    timeout: float = 30.0,
) -> tuple[int, str | None]:
    """Upsert rows into public.setup_candidates via Supabase REST.

    Returns (status_code, error_text_or_none).
    """
    if not rows:
        return 200, None
    # on_conflict must match the unique constraint exactly for
    # resolution=merge-duplicates to upsert instead of plain-inserting
    # (which would 409 against already-present rows).
    endpoint = (
        supabase_url.rstrip("/")
        + "/rest/v1/setup_candidates?on_conflict=symbol,session_date,pattern,direction"
    )
    data = json.dumps(rows).encode("utf-8")
    req = urllib.request.Request(
        endpoint,
        data=data,
        method="POST",
        headers={
            "apikey": service_role_key,
            "Authorization": f"Bearer {service_role_key}",
            "Content-Type": "application/json",
            # Upsert on the unique constraint key.
            "Prefer": "resolution=merge-duplicates,return=minimal",
        },
    )
    # Retry transient network/SSL hiccups once before giving up; we don't
    # want a 1-in-a-thousand TLS handshake glitch to abort a sweep that
    # already ran 90 days of Databento fetches.
    last_exc: Exception | None = None
    for attempt in range(2):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return resp.status, None
        except urllib.error.HTTPError as e:
            return e.code, e.read()[:300].decode("utf-8", errors="replace")
        except Exception as e:
            last_exc = e
            time.sleep(1.0 + attempt)
    return 0, str(last_exc)


def signal_to_row(symbol: str, day: date_t, signal) -> dict:
    """Map a TfoSignal into the Supabase row shape."""
    return {
        "symbol": symbol,
        "session_date": day.isoformat(),
        "pattern": "tfo",
        "direction": signal.direction,
        "fire_ts": signal.fire_ts,
        "pivot_index": signal.pivot_index,
        "fired_bar_index": signal.fired_bar_index,
        "consecutive_count": signal.consecutive_count,
        "strong_count": signal.strong_count,
        "score": signal.score,
        "pivot_ts": signal.pivot_ts,
        "strong_bar_ts": list(signal.strong_bar_timestamps),
        "status": "new",
        "source": "backfill",
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Backfill TFO setup candidates.")
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL,
                        help=f"AIedge base URL (default {DEFAULT_BASE_URL})")
    parser.add_argument("--tickers", nargs="+", default=DEFAULT_TICKERS,
                        help=f"Tickers to scan (default {' '.join(DEFAULT_TICKERS)})")
    parser.add_argument("--days", type=int, default=DEFAULT_DAYS,
                        help=f"Trading days back from today (default {DEFAULT_DAYS})")
    parser.add_argument("--until", default=None,
                        help="End date YYYY-MM-DD (default: yesterday ET)")
    parser.add_argument("--dry-run", action="store_true",
                        help="Print candidates instead of writing to Supabase")
    parser.add_argument("--concurrency", type=int, default=6,
                        help="Parallel workers fetching /api/bars (default 6)")
    parser.add_argument("--throttle", type=float, default=0.0,
                        help="Seconds to sleep between submits when concurrency=1 "
                             "(ignored at higher concurrency)")
    args = parser.parse_args(argv)

    if args.until:
        end_date = date_t.fromisoformat(args.until)
    else:
        # Yesterday — today's session may not be closed yet.
        end_date = (datetime.utcnow() - timedelta(days=1)).date()

    days = previous_trading_days(end_date, args.days)
    print(f"Scanning {len(args.tickers)} tickers × {len(days)} trading days "
          f"({days[-1]} → {days[0]}) via {args.base_url}", flush=True)

    if not args.dry_run:
        supabase_url = os.environ.get("SUPABASE_URL")
        service_role_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
        if not supabase_url or not service_role_key:
            print("ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required "
                  "(or pass --dry-run).", flush=True)
            return 2
    else:
        supabase_url = ""
        service_role_key = ""

    total_signals = 0
    rows_batch: list[dict] = []

    def scan_one(ticker_day: tuple[str, date_t]) -> tuple[str, date_t, list]:
        t, d = ticker_day
        bars = fetch_session_5m_bars(args.base_url, t, d)
        if not bars:
            return t, d, []
        return t, d, detect_tfo(bars)

    for ticker in args.tickers:
        # Process one ticker at a time so per-ticker flush still works,
        # but fan out the (ticker, day) calls in parallel within that
        # ticker. Single-ticker sweep is the common live-incremental path.
        jobs = [(ticker, d) for d in days]

        if args.concurrency <= 1:
            results = []
            for j in jobs:
                results.append(scan_one(j))
                if args.throttle > 0:
                    time.sleep(args.throttle)
        else:
            with ThreadPoolExecutor(max_workers=args.concurrency) as ex:
                results = list(ex.map(scan_one, jobs))

        # Order results by day so the log reads chronologically.
        results.sort(key=lambda r: r[1])
        for t, d, signals in results:
            if not signals:
                continue
            for s in signals:
                rows_batch.append(signal_to_row(t, d, s))
                total_signals += 1
                print(f"  [hit ] {t} {d} {s.direction:<5s} "
                      f"score={s.score:.1f} fire_ts={s.fire_ts}", flush=True)

        # Flush per-ticker so a crash mid-sweep loses at most one symbol.
        # On Supabase error, log + continue to the next ticker instead of
        # aborting — a transient hiccup on ticker N shouldn't lose the
        # remaining tickers' work. The dropped batch can be re-run since
        # detect_tfo is deterministic and the upsert is idempotent.
        if rows_batch and not args.dry_run:
            status, err = supabase_upsert(supabase_url, service_role_key, rows_batch)
            if err:
                print(f"  [supabase] HTTP {status}: {err[:200]}  (continuing)", flush=True)
            else:
                print(f"  [supabase] upserted {len(rows_batch)} rows", flush=True)
            rows_batch = []

    print(f"\nDone. Total signals: {total_signals}", flush=True)
    if args.dry_run and rows_batch:
        print("\nDry-run payload preview (first 5):")
        for r in rows_batch[:5]:
            print(json.dumps(r, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
