#!/usr/bin/env python3
"""
Extend public/analogs/corpus.json from EOD history snapshots.

Each captured trading day is a fresh source of analog mornings: every
ticker that finished a full RTH session with a complete chart becomes
one new corpus entry. Run this after every EOD capture and the corpus
grows from 43 → 43 + (tickers per day) per weekday, with no curation
work.

Sources tried in order (first non-empty wins):
  1. --from-dir <path>   Local history files (capture_eod.py writes here:
                         ~/aiedge-history/<date>.json by default).
  2. --from-api <base>   GET /api/scan/history then per-date GETs.
                         Requires SYNC_SECRET env var.
  3. Default fallback    ~/aiedge-history/

Idempotent: dedupes by (date, ticker). Re-running with the same input
produces the same output. Skips entries with insufficient bars (< 10).

Usage:
    python3 scripts/extend_corpus_from_history.py
    python3 scripts/extend_corpus_from_history.py --from-dir /path/to/history
    python3 scripts/extend_corpus_from_history.py --from-api https://www.aiedge.trade
    python3 scripts/extend_corpus_from_history.py --dry-run --verbose
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

CORPUS_PATH = Path(__file__).resolve().parent.parent / "public" / "analogs" / "corpus.json"
DEFAULT_LOCAL_DIR = Path.home() / "aiedge-history"

N_OPEN_BARS = 6
MIN_TOTAL_BARS = 10  # need at least 6 + 4 to compute outcomes
DOJI_BODY_RATIO = 0.30
TREND_BODY_RATIO = 0.50
TREND_CLOSE_TOP_THIRD = 2.0 / 3.0
SIGNAL_TAIL_RATIO = 0.20


# ── Source loaders ──────────────────────────────────────────────────────────

def _load_from_dir(path: Path) -> list[dict]:
    if not path.is_dir():
        return []
    snapshots: list[dict] = []
    for f in sorted(path.glob("*.json")):
        try:
            snapshots.append(json.loads(f.read_text(encoding="utf-8")))
        except Exception as e:
            print(f"WARN: skipping {f.name}: {e}", file=sys.stderr)
    return snapshots


def _load_from_api(base_url: str) -> list[dict]:
    secret = os.environ.get("SYNC_SECRET")
    if not secret:
        print("ERROR: --from-api requires SYNC_SECRET env var", file=sys.stderr)
        return []

    base = base_url.rstrip("/")
    auth = {"Authorization": f"Bearer {secret}"}

    def _get(url: str) -> dict:
        req = Request(url, headers=auth)
        with urlopen(req, timeout=30) as resp:
            return json.loads(resp.read())

    try:
        index = _get(f"{base}/api/scan/history")
    except (HTTPError, URLError) as e:
        print(f"ERROR fetching history index: {e}", file=sys.stderr)
        return []

    dates = [d["date"] for d in (index.get("dates") or [])]
    print(f"API has {len(dates)} captured days")
    snapshots: list[dict] = []
    for date in dates:
        try:
            snap = _get(f"{base}/api/scan/history?date={date}")
            snapshots.append(snap)
        except (HTTPError, URLError) as e:
            print(f"WARN: skipping {date}: {e}", file=sys.stderr)
    return snapshots


# ── Bar-shape computations (mirror tools/chart_matcher/build_analogs_corpus.py) ─

def _ema20(closes: list[float]) -> list[float]:
    """Compute EMA20 from a list of closes. Same convention as pandas
    `df["close"].ewm(span=20, adjust=False).mean()`."""
    if not closes:
        return []
    alpha = 2.0 / (20 + 1)
    out = [float(closes[0])]
    for c in closes[1:]:
        out.append(alpha * float(c) + (1 - alpha) * out[-1])
    return out


def _bars_to_bundle(bars: list[dict]) -> dict:
    """Convert chart.bars (Bar = {t, o, h, l, c}) → corpus shape bundle."""
    closes = [float(b["c"]) for b in bars]
    ema = _ema20(closes)
    return {
        "open":  [float(b["o"]) for b in bars],
        "high":  [float(b["h"]) for b in bars],
        "low":   [float(b["l"]) for b in bars],
        "close": closes,
        "ema20": ema,
        "times": [datetime.fromtimestamp(int(b["t"])).strftime("%H:%M") for b in bars],
    }


def _compute_outcome(bundle: dict, open_bars: int = N_OPEN_BARS) -> dict:
    """Mirrors build_analogs_corpus.compute_outcome — % outcomes from
    end-of-open through end-of-day."""
    closes = bundle["close"]
    if len(closes) <= open_bars:
        return {"insufficient_data": True}
    open_close = float(closes[open_bars - 1])
    eod_close = float(closes[-1])
    after_high = max(bundle["high"][open_bars:])
    after_low = min(bundle["low"][open_bars:])
    intraday_range_pct = (after_high - after_low) / open_close if open_close > 0 else 0.0
    eod_move_pct = (eod_close - open_close) / open_close if open_close > 0 else 0.0
    first_open = float(bundle["open"][0])
    open_move_pct = (open_close - first_open) / first_open if first_open > 0 else 0.0
    if open_move_pct > 0.001:
        open_direction = "up"
    elif open_move_pct < -0.001:
        open_direction = "down"
    else:
        open_direction = "flat"
    if open_direction == "up":
        max_continuation = (after_high - open_close) / open_close
        max_reversal = (open_close - after_low) / open_close
    elif open_direction == "down":
        max_continuation = (open_close - after_low) / open_close
        max_reversal = (after_high - open_close) / open_close
    else:
        max_continuation = max_reversal = 0.0
    aligned_eod = (
        (eod_move_pct > 0 and open_direction == "up")
        or (eod_move_pct < 0 and open_direction == "down")
    )
    return {
        "open_direction": open_direction,
        "open_move_pct": open_move_pct,
        "eod_move_pct": eod_move_pct,
        "intraday_range_pct": intraday_range_pct,
        "max_continuation_pct": max_continuation,
        "max_reversal_pct": max_reversal,
        "aligned_eod": aligned_eod,
    }


def _bar_label(o: float, h: float, l: float, c: float, ema: float, median_range: float) -> dict:
    rng = max(h - l, 1e-9)
    body = abs(c - o)
    body_ratio = body / rng
    close_top = (c - l) / rng

    if body_ratio < DOJI_BODY_RATIO:
        bar_type = "doji"
    elif c > o and body_ratio >= TREND_BODY_RATIO and close_top >= TREND_CLOSE_TOP_THIRD:
        upper_tail = (h - c) / rng
        bar_type = "bull_signal" if upper_tail < SIGNAL_TAIL_RATIO else "bull_trend"
    elif c < o and body_ratio >= TREND_BODY_RATIO and (h - c) / rng >= TREND_CLOSE_TOP_THIRD:
        lower_tail = (c - l) / rng
        bar_type = "bear_signal" if lower_tail < SIGNAL_TAIL_RATIO else "bear_trend"
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
        "bar_type": bar_type,
        "close_position": close_position,
        "ema_position": ema_position,
        "body_ratio": round(body_ratio, 3),
        "ema_dist_atr": round(ema_dist, 2),
    }


def _compute_first_6_labels(full: dict) -> list[dict]:
    ranges = [h - l for h, l in zip(full["high"], full["low"])]
    valid = [r for r in ranges if r > 0]
    median_range = sorted(valid)[len(valid) // 2] if valid else 0.0
    out = []
    for i in range(min(N_OPEN_BARS, len(full["open"]))):
        out.append(_bar_label(
            full["open"][i], full["high"][i], full["low"][i],
            full["close"][i], full["ema20"][i], median_range,
        ))
    return out


# ── Entry building ──────────────────────────────────────────────────────────

def _trim_bundle(bundle: dict, n: int) -> dict:
    return {k: v[:n] for k, v in bundle.items()}


def _build_entry(date: str, ticker: str, bars: list[dict]) -> dict | None:
    if len(bars) < MIN_TOTAL_BARS:
        return None
    bundle = _bars_to_bundle(bars)
    first_6 = _trim_bundle(bundle, N_OPEN_BARS)
    outcome = _compute_outcome(bundle)
    if outcome.get("insufficient_data"):
        return None
    first_6_labels = _compute_first_6_labels(bundle)
    return {
        "date": date,
        "ticker": ticker,
        "slug": f"{date}_{ticker}",
        "first_6_bars": first_6,
        "first_6_labels": first_6_labels,
        "full_session": bundle,
        "outcome": outcome,
        # Source/metadata fields that exist in the strong-trend-derived
        # corpus but don't apply to history-derived entries.
        "trades_count": 0,
        "trades_directions": [],
        "opening_setups": [],
        # PNG paths — not rendered for history entries. The /history
        # Analogs tab falls back to SpatialOverlay when these are null.
        "first_6_chart": None,
        "full_session_chart": None,
        "source": "history",
    }


# ── Main ────────────────────────────────────────────────────────────────────

def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--from-dir", type=Path, default=None,
                    help=f"Local snapshot dir (default: {DEFAULT_LOCAL_DIR})")
    ap.add_argument("--from-api", type=str, default=None,
                    help="API base URL (e.g. https://www.aiedge.trade)")
    ap.add_argument("--dry-run", action="store_true",
                    help="Don't write the corpus, just report what would change")
    ap.add_argument("--verbose", "-v", action="store_true")
    args = ap.parse_args()

    # Pick a source.
    if args.from_dir is not None:
        snapshots = _load_from_dir(args.from_dir)
        source_label = f"dir {args.from_dir}"
    elif args.from_api is not None:
        snapshots = _load_from_api(args.from_api)
        source_label = f"api {args.from_api}"
    else:
        snapshots = _load_from_dir(DEFAULT_LOCAL_DIR)
        source_label = f"default dir {DEFAULT_LOCAL_DIR}"

    if not snapshots:
        print(f"No snapshots found in {source_label}. Nothing to ingest.")
        return 0

    print(f"Loaded {len(snapshots)} day(s) from {source_label}")

    # Load existing corpus so we can dedupe.
    if not CORPUS_PATH.exists():
        print(f"ERROR: corpus not found at {CORPUS_PATH}", file=sys.stderr)
        return 1
    corpus = json.loads(CORPUS_PATH.read_text())
    existing_slugs = {e["slug"] for e in corpus.get("entries", [])}
    before = len(existing_slugs)

    # Build new entries.
    added: list[dict] = []
    skipped_dup = 0
    skipped_short = 0
    skipped_other = 0
    for snap in snapshots:
        date = snap.get("date")
        payload = snap.get("payload", {})
        results = payload.get("results", [])
        for r in results:
            ticker = r.get("ticker")
            chart = r.get("chart") or {}
            bars = chart.get("bars") or []
            if not date or not ticker:
                skipped_other += 1
                continue
            slug = f"{date}_{ticker}"
            if slug in existing_slugs:
                skipped_dup += 1
                continue
            if len(bars) < MIN_TOTAL_BARS:
                skipped_short += 1
                if args.verbose:
                    print(f"  short bars ({len(bars)}): {slug}")
                continue
            entry = _build_entry(date, ticker, bars)
            if entry is None:
                skipped_other += 1
                continue
            added.append(entry)
            existing_slugs.add(slug)

    if not added:
        print(f"No new entries to add ({skipped_dup} dupes, {skipped_short} short, "
              f"{skipped_other} other).")
        return 0

    print(f"Adding {len(added)} entries ({skipped_dup} dupes skipped, "
          f"{skipped_short} too short, {skipped_other} other)")

    if args.verbose:
        for e in added[:20]:
            o = e["outcome"]
            print(f"  + {e['slug']:30s} eod={o['eod_move_pct']*100:+5.2f}% "
                  f"dir={o['open_direction']:4s}")
        if len(added) > 20:
            print(f"  ... and {len(added) - 20} more")

    if args.dry_run:
        print("(dry-run — not writing)")
        return 0

    # Sort by date asc, ticker asc — keeps the file diff-friendly.
    all_entries = corpus.get("entries", []) + added
    all_entries.sort(key=lambda e: (e["date"], e["ticker"]))
    corpus["entries"] = all_entries
    corpus["built_at"] = datetime.now().isoformat(timespec="seconds")

    CORPUS_PATH.write_text(json.dumps(corpus, indent=2))
    after = len(corpus["entries"])
    print(f"Wrote {CORPUS_PATH} ({before} → {after} entries, +{after - before})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
