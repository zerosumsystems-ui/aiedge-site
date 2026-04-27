#!/usr/bin/env python3
"""
Bulk-backfill the analog corpus from local Databento parquet cache.

The EOD ingest (extend_corpus_from_history.py) grows the corpus one day
at a time. This script bulk-imports historical sessions from the local
~/data/databento/ cache so the matcher has a denser starting point.

Defaults: most-recent 90 trading days × 10 liquid equity tickers, RTH
only (09:30-15:55 ET), 5-min bars, EMA20 same convention as
build_analogs_corpus.py. Idempotent — dedupes by (date, ticker) slug.

After running this, regenerate the scanner-side corpus:
    cd ~/code/aiedge/scanner
    python3 tools/chart_matcher/build_scanner_analogs_corpus.py

Usage:
    python3 scripts/backfill_corpus_from_databento.py
    python3 scripts/backfill_corpus_from_databento.py --tickers QQQ SPY NVDA --days 30
    python3 scripts/backfill_corpus_from_databento.py --since 2024-01-01 --dry-run -v
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, date as date_t, timedelta
from pathlib import Path

import pandas as pd

CORPUS_PATH = Path(__file__).resolve().parent.parent / "public" / "analogs" / "corpus.json"
ANALOGS_ROOT = Path(__file__).resolve().parent.parent / "public" / "analogs"
DATA_ROOT = Path.home() / "data" / "databento"

# Picked for liquidity + diversity of intraday behavior. Not exhaustive —
# add more via --tickers when needed. NOTE: futures can't use this script
# (parquet schema differs); equities only.
DEFAULT_TICKERS = ["QQQ", "SPY", "IWM", "NVDA", "AAPL", "MSFT", "TSLA", "AMD", "META", "GOOGL"]
DEFAULT_RECENT_DAYS = 90

N_OPEN_BARS = 6
MIN_TOTAL_BARS = 10
DOJI_BODY_RATIO = 0.30
TREND_BODY_RATIO = 0.50
TREND_CLOSE_TOP_THIRD = 2.0 / 3.0
SIGNAL_TAIL_RATIO = 0.20

ET = "America/New_York"


# ── Databento parquet IO (mirrors tools/chart_matcher/build_analogs_corpus.py) ──

def _find_parquet(ticker: str, yyyy: str, mm: str) -> Path | None:
    for feed in ("ARCX.PILLAR", "XNAS.ITCH"):
        p = DATA_ROOT / f"{feed}_{ticker}_ohlcv-1m_{yyyy}-{mm}.parquet"
        if p.exists():
            return p
    return None


def _load_month(ticker: str, yyyy: str, mm: str) -> pd.DataFrame | None:
    p = _find_parquet(ticker, yyyy, mm)
    if p is None:
        return None
    try:
        df = pd.read_parquet(p)
    except Exception:
        return None
    if df.empty:
        return None
    # Index → ET, scale prices (databento parquets store as nanos × 1e-9 of
    # the original — matches build_analogs_corpus.py convention).
    df.index = df.index.tz_convert(ET)
    for c in ("open", "high", "low", "close"):
        df[c] = df[c] * 1e9
    return df


def _resample_day_5min(month_df: pd.DataFrame, day: date_t) -> pd.DataFrame | None:
    df = month_df[month_df.index.date == day]
    df = df[(df.index.time >= pd.Timestamp("09:30").time()) &
            (df.index.time <  pd.Timestamp("16:00").time())]
    if df.empty:
        return None
    rs = df[["open", "high", "low", "close"]].resample("5min").agg(
        {"open": "first", "high": "max", "low": "min", "close": "last"}
    ).dropna()
    if rs.empty:
        return None
    rs["ema20"] = rs["close"].ewm(span=20, adjust=False).mean()
    return rs


# ── Corpus entry building ──────────────────────────────────────────────────

def _df_to_bundle(df: pd.DataFrame) -> dict:
    """Round to 4dp — DTW is shape-relative-after-normalization, so we
    don't need full float64 precision on raw price values. Trims ~30% off
    JSON size at zero matcher impact."""
    def _r(s) -> list[float]:
        return [round(float(x), 4) for x in s]
    return {
        "open":  _r(df["open"]),
        "high":  _r(df["high"]),
        "low":   _r(df["low"]),
        "close": _r(df["close"]),
        "ema20": _r(df["ema20"]),
        "times": [t.strftime("%H:%M") for t in df.index],
    }


def _trim(bundle: dict, n: int) -> dict:
    return {k: v[:n] for k, v in bundle.items()}


def _compute_outcome(bundle: dict) -> dict:
    closes = bundle["close"]
    if len(closes) <= N_OPEN_BARS:
        return {"insufficient_data": True}
    open_close = float(closes[N_OPEN_BARS - 1])
    eod_close = float(closes[-1])
    after_high = max(bundle["high"][N_OPEN_BARS:])
    after_low = min(bundle["low"][N_OPEN_BARS:])
    intraday_range_pct = (after_high - after_low) / open_close if open_close > 0 else 0.0
    eod_move_pct = (eod_close - open_close) / open_close if open_close > 0 else 0.0
    first_open = float(bundle["open"][0])
    open_move_pct = (open_close - first_open) / first_open if first_open > 0 else 0.0
    if open_move_pct > 0.001:
        open_dir = "up"
    elif open_move_pct < -0.001:
        open_dir = "down"
    else:
        open_dir = "flat"
    if open_dir == "up":
        max_continuation = (after_high - open_close) / open_close
        max_reversal = (open_close - after_low) / open_close
    elif open_dir == "down":
        max_continuation = (open_close - after_low) / open_close
        max_reversal = (after_high - open_close) / open_close
    else:
        max_continuation = max_reversal = 0.0
    aligned_eod = (eod_move_pct > 0 and open_dir == "up") or \
                  (eod_move_pct < 0 and open_dir == "down")
    return {
        "open_direction": open_dir,
        "open_move_pct": open_move_pct,
        "eod_move_pct": eod_move_pct,
        "intraday_range_pct": intraday_range_pct,
        "max_continuation_pct": max_continuation,
        "max_reversal_pct": max_reversal,
        "aligned_eod": aligned_eod,
    }


def _bar_label(o, h, l, c, ema, median_range):
    rng = max(h - l, 1e-9)
    body = abs(c - o)
    body_ratio = body / rng
    close_top = (c - l) / rng
    if body_ratio < DOJI_BODY_RATIO:
        bar_type = "doji"
    elif c > o and body_ratio >= TREND_BODY_RATIO and close_top >= TREND_CLOSE_TOP_THIRD:
        bar_type = "bull_signal" if (h - c) / rng < SIGNAL_TAIL_RATIO else "bull_trend"
    elif c < o and body_ratio >= TREND_BODY_RATIO and (h - c) / rng >= TREND_CLOSE_TOP_THIRD:
        bar_type = "bear_signal" if (c - l) / rng < SIGNAL_TAIL_RATIO else "bear_trend"
    elif c > o:
        bar_type = "bull_minor"
    elif c < o:
        bar_type = "bear_minor"
    else:
        bar_type = "neutral"
    if close_top >= 0.66:
        close_position = "top"
    elif close_top <= 0.33:
        close_position = "bottom"
    else:
        close_position = "mid"
    ema_dist = (c - ema) / median_range if median_range > 1e-9 else 0.0
    if ema_dist > 0.5:
        ema_position = "above"
    elif ema_dist < -0.5:
        ema_position = "below"
    else:
        ema_position = "near"
    return {
        "bar_type": bar_type, "close_position": close_position,
        "ema_position": ema_position, "body_ratio": round(body_ratio, 3),
        "ema_dist_atr": round(ema_dist, 2),
    }


def _compute_first_6_labels(bundle: dict) -> list[dict]:
    ranges = [h - l for h, l in zip(bundle["high"], bundle["low"])]
    valid = [r for r in ranges if r > 0]
    median_range = sorted(valid)[len(valid) // 2] if valid else 0.0
    out = []
    for i in range(min(N_OPEN_BARS, len(bundle["open"]))):
        out.append(_bar_label(
            bundle["open"][i], bundle["high"][i], bundle["low"][i],
            bundle["close"][i], bundle["ema20"][i], median_range,
        ))
    return out


def _build_entry(date_str: str, ticker: str, df5: pd.DataFrame) -> dict | None:
    if len(df5) < MIN_TOTAL_BARS:
        return None
    full = _df_to_bundle(df5)
    outcome = _compute_outcome(full)
    if outcome.get("insufficient_data"):
        return None
    first_6 = _trim(full, N_OPEN_BARS)
    # Write the full session to a per-slug file so the page can lazy-fetch
    # it on click. corpus.json itself stays slim.
    slug = f"{date_str}_{ticker}"
    session_dir = ANALOGS_ROOT / slug
    session_dir.mkdir(parents=True, exist_ok=True)
    (session_dir / "session.json").write_text(json.dumps(full, separators=(",", ":")))
    # Slim entries: keep first_6_bars + first_6_labels + outcome (everything
    # the matcher and the picker UI need); skip full_session so corpus.json
    # ships to the client at a reasonable size. The original 43 strong-trend
    # entries keep their full_session for backwards compat — the page falls
    # back to first_6 for new entries when full_session is null.
    return {
        "date": date_str,
        "ticker": ticker,
        "slug": slug,
        "first_6_bars": first_6,
        "first_6_labels": _compute_first_6_labels(full),
        "full_session": None,
        "outcome": outcome,
        "trades_count": 0,
        "trades_directions": [],
        "opening_setups": [],
        "first_6_chart": None,
        "full_session_chart": None,
        "source": "databento_backfill",
    }


# ── Date enumeration ───────────────────────────────────────────────────────

def _trading_days(start: date_t, end: date_t) -> list[date_t]:
    """Mon-Fri between start and end, inclusive. Skips weekends; doesn't
    skip holidays (parquet load will silently return None on those)."""
    out: list[date_t] = []
    d = start
    one = timedelta(days=1)
    while d <= end:
        if d.weekday() < 5:
            out.append(d)
        d += one
    return out


# ── Main ────────────────────────────────────────────────────────────────────

def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--tickers", nargs="+", default=DEFAULT_TICKERS,
                    help=f"Tickers to backfill (default: {' '.join(DEFAULT_TICKERS)})")
    ap.add_argument("--days", type=int, default=DEFAULT_RECENT_DAYS,
                    help="How many trading days back from today (default: 90)")
    ap.add_argument("--since", type=str, default=None,
                    help="Override --days with absolute start YYYY-MM-DD")
    ap.add_argument("--until", type=str, default=None,
                    help="Optional end date YYYY-MM-DD (default: today)")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--verbose", "-v", action="store_true")
    ap.add_argument("--limit", type=int, default=0,
                    help="Cap new entries (0 = no cap, useful for smoke tests)")
    args = ap.parse_args()

    end_date = (datetime.strptime(args.until, "%Y-%m-%d").date()
                if args.until else date_t.today())
    if args.since:
        start_date = datetime.strptime(args.since, "%Y-%m-%d").date()
    else:
        start_date = end_date - timedelta(days=args.days)

    print(f"Backfill window: {start_date} → {end_date}")
    print(f"Tickers ({len(args.tickers)}): {', '.join(args.tickers)}")

    # Load existing corpus.
    if not CORPUS_PATH.exists():
        print(f"ERROR: corpus not found at {CORPUS_PATH}", file=sys.stderr)
        return 1
    corpus = json.loads(CORPUS_PATH.read_text())
    existing_slugs = {e["slug"] for e in corpus.get("entries", [])}
    before = len(existing_slugs)
    print(f"Existing corpus: {before} entries")

    # Walk per-ticker × per-month, then enumerate days.
    days = _trading_days(start_date, end_date)
    months_needed: set[tuple[str, str]] = set()
    for d in days:
        months_needed.add((str(d.year), f"{d.month:02d}"))

    added: list[dict] = []
    skipped_no_data = 0
    skipped_short = 0
    skipped_dup = 0
    skipped_bad = 0

    for ticker in args.tickers:
        # Cache loaded months per ticker so we don't re-read parquet for each day.
        month_cache: dict[tuple[str, str], pd.DataFrame | None] = {}
        for d in days:
            slug = f"{d.isoformat()}_{ticker}"
            if slug in existing_slugs:
                skipped_dup += 1
                continue
            ym = (str(d.year), f"{d.month:02d}")
            if ym not in month_cache:
                month_cache[ym] = _load_month(ticker, ym[0], ym[1])
            month_df = month_cache[ym]
            if month_df is None or month_df.empty:
                skipped_no_data += 1
                continue
            try:
                df5 = _resample_day_5min(month_df, d)
            except Exception as e:
                if args.verbose:
                    print(f"  err {slug}: {e}")
                skipped_bad += 1
                continue
            if df5 is None or len(df5) < MIN_TOTAL_BARS:
                skipped_short += 1
                continue
            entry = _build_entry(d.isoformat(), ticker, df5)
            if entry is None:
                skipped_bad += 1
                continue
            added.append(entry)
            existing_slugs.add(slug)
            if args.verbose and len(added) % 25 == 0:
                print(f"  ... +{len(added)}")
            if args.limit and len(added) >= args.limit:
                break
        if args.limit and len(added) >= args.limit:
            break

    print(f"\nResults:")
    print(f"  added:        {len(added)}")
    print(f"  dup-skipped:  {skipped_dup}")
    print(f"  no-data:      {skipped_no_data}  (parquet missing for that month, or holiday)")
    print(f"  too-short:    {skipped_short}")
    print(f"  errors:       {skipped_bad}")

    if args.verbose and added:
        print(f"\n  sample (first 10):")
        for e in added[:10]:
            o = e["outcome"]
            print(f"    {e['slug']:25s} eod={o['eod_move_pct']*100:+5.2f}% "
                  f"dir={o['open_direction']:4s} cont={o['max_continuation_pct']*100:+4.1f}%")

    if not added:
        print("Nothing to add.")
        return 0

    if args.dry_run:
        print("(dry-run — not writing)")
        return 0

    all_entries = corpus.get("entries", []) + added
    all_entries.sort(key=lambda e: (e["date"], e["ticker"]))
    corpus["entries"] = all_entries
    corpus["built_at"] = datetime.now().isoformat(timespec="seconds")
    # Compact JSON (no indent) — at scale (thousands of entries) the
    # whitespace overhead is real. Saves ~30% size, identical content.
    CORPUS_PATH.write_text(json.dumps(corpus, separators=(",", ":")))
    print(f"\nWrote {CORPUS_PATH} ({before} → {len(all_entries)} entries, +{len(all_entries) - before})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
