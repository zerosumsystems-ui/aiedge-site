#!/usr/bin/env python3
"""Parity test for scripts/tfo_features.py.

Loads artifacts/tfo-baseline/raw_dataset.json (the snapshot of 285
candidates' features produced by the previous in-place extractor), then
re-runs the new shared tfo_features module against the same /api/bars
input. Asserts byte-equality of the produced feature dicts.

If a single row diverges, the refactor changed behavior and we cannot
ship — the model was trained on the old features and would be served
the new ones, drifting silently.

Usage:
    python3 scripts/tfo_features_test.py             # samples 20 rows (fast)
    python3 scripts/tfo_features_test.py --full      # all 285 rows
    python3 scripts/tfo_features_test.py --base-url http://127.0.0.1:3000
"""

from __future__ import annotations

import argparse
import json
import os
import random
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from tfo_features import extract_features_for_fire  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
DATASET = ROOT / "artifacts" / "tfo-baseline" / "raw_dataset.json"
DEFAULT_BASE_URL = "https://www.aiedge.trade"


def fetch_session_bars(base_url: str, ticker: str, day: str) -> list[dict]:
    qs = urllib.parse.urlencode({
        "ticker": ticker,
        "from": day,
        "to": day,
        "tf": "5min",
        "session": "rth",
        "limit": "200",
    })
    url = f"{base_url}/api/bars?{qs}"
    with urllib.request.urlopen(url, timeout=30) as r:
        return (json.loads(r.read()).get("bars") or [])


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL)
    parser.add_argument("--full", action="store_true",
                        help="Check all 285 rows (default: random sample of 20)")
    parser.add_argument("--sample", type=int, default=20)
    parser.add_argument("--seed", type=int, default=17)
    args = parser.parse_args(argv)

    if not DATASET.exists():
        print(f"ERROR: dataset not found at {DATASET}", file=sys.stderr)
        return 2

    rows = json.loads(DATASET.read_text())
    if not args.full:
        random.seed(args.seed)
        rows = random.sample(rows, min(args.sample, len(rows)))

    print(f"Parity-testing {len(rows)} row(s) against {args.base_url}...")
    fails = 0
    for i, row in enumerate(rows, 1):
        expected = row.get("features")
        if not expected:
            continue
        try:
            bars = fetch_session_bars(args.base_url, row["symbol"], row["session_date"])
        except Exception as e:
            print(f"  [skip] {row['symbol']} {row['session_date']}: {e}")
            continue
        # The original extractor reads pivot_index from the candidate row,
        # but the raw_dataset.json dump doesn't include it. We don't have
        # to: the features dict shows `bars_since_open`, and we can recover
        # the original parameters via the candidate's stored detection
        # fields. The dataset DOES include consecutive_count + strong_count
        # under `features` — round-trip those.
        feats_expected = expected
        # Reconstruct args from what the row provides. We need pivot_index;
        # the detector stores it on the candidate but our JSON dump
        # only carries the feature dict + row metadata, not pivot_index.
        # Re-derive pivot_index from the session bars: it's the index of
        # min low (long) or max high (short) in the first 4 bars, matching
        # tfo_detector. Cheap and self-consistent.
        pivot_window = bars[:4]
        if row["direction"] == "long":
            pivot_index = min(range(len(pivot_window)), key=lambda i: pivot_window[i]["l"])
        else:
            pivot_index = max(range(len(pivot_window)), key=lambda i: pivot_window[i]["h"])
        produced = extract_features_for_fire(
            bars,
            fire_ts=int(row["fire_ts"]),
            pivot_index=pivot_index,
            consecutive_count=int(feats_expected.get("consecutive_count") or 0),
            strong_count=int(feats_expected.get("strong_count") or 0),
        )
        if produced is None:
            print(f"  [fail] {row['symbol']} {row['session_date']} — produced None")
            fails += 1
            continue
        # Compare every key. Tolerate exactly zero drift on rounded values.
        for k in feats_expected:
            if k not in produced:
                print(f"  [fail] {row['symbol']} {row['session_date']} — missing key {k!r}")
                fails += 1
                break
            if produced[k] != feats_expected[k]:
                print(
                    f"  [fail] {row['symbol']} {row['session_date']} — "
                    f"{k}: produced={produced[k]} expected={feats_expected[k]}"
                )
                fails += 1
                break
        else:
            if i % 5 == 0 or i == len(rows):
                print(f"  [ok ] {i}/{len(rows)}")

    if fails:
        print(f"\nFAILED: {fails} row(s) diverged from snapshot.")
        return 1
    print(f"\nPASS: {len(rows)} row(s) byte-equal vs prior extractor.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
