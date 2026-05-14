#!/usr/bin/env python3
"""Extract a bar-level feature vector for every TFO candidate.

Backfill driver. Reads candidates needing features from Supabase, fetches
RTH 5min bars from /api/bars, and writes the feature vector to
setup_candidates.features. The actual feature math lives in
scripts/tfo_features.py — the same module the live Fly aggregator imports.

Idempotent: skips rows where features_extracted_at is set, unless
--recompute.

Required env:
    SUPABASE_URL              -- e.g. https://YOUR.supabase.co
    SUPABASE_SERVICE_ROLE_KEY -- service role, bypasses RLS
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
from datetime import datetime

# tfo_features is a sibling script. Same import pattern the backfill
# detector uses.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from tfo_features import extract_features_for_fire  # noqa: E402

DEFAULT_BASE_URL = "https://www.aiedge.trade"


# ----- helpers --------------------------------------------------------

def fetch_session_5m_bars(base_url: str, ticker: str, day: str, timeout: float = 60.0) -> list[dict]:
    qs = urllib.parse.urlencode({
        "ticker": ticker,
        "from": day,
        "to": day,
        "tf": "5min",
        "session": "rth",
        "limit": "200",
    })
    url = f"{base_url}/api/bars?{qs}"
    try:
        with urllib.request.urlopen(url, timeout=timeout) as resp:
            return (json.loads(resp.read()).get("bars") or [])
    except urllib.error.HTTPError as e:
        print(f"  [skip] {ticker} {day} HTTP {e.code}", flush=True)
        return []
    except Exception as e:
        print(f"  [skip] {ticker} {day} err: {e}", flush=True)
        return []


def supabase_get_rows(supabase_url: str, key: str, recompute: bool) -> list[dict]:
    qs = {
        "select": "id,symbol,session_date,direction,fire_ts,pivot_index,fired_bar_index,"
                  "consecutive_count,strong_count,features_extracted_at",
        "order": "fire_ts.asc",
        "limit": "1000",
        # Only rows where outcome was computed — we need the fire bar to
        # be valid before bothering with features.
        "outcome_computed_at": "not.is.null",
    }
    if not recompute:
        qs["features_extracted_at"] = "is.null"
    url = supabase_url.rstrip("/") + "/rest/v1/setup_candidates?" + urllib.parse.urlencode(qs)
    req = urllib.request.Request(url, headers={
        "apikey": key,
        "Authorization": f"Bearer {key}",
    })
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())


def supabase_patch(supabase_url: str, key: str, candidate_id: int, patch: dict) -> None:
    url = supabase_url.rstrip("/") + f"/rest/v1/setup_candidates?id=eq.{candidate_id}"
    req = urllib.request.Request(
        url,
        method="PATCH",
        data=json.dumps(patch).encode("utf-8"),
        headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            "Prefer": "return=minimal",
        },
    )
    last_exc: Exception | None = None
    for attempt in range(2):
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                if r.status >= 300:
                    raise RuntimeError(f"supabase PATCH {candidate_id} -> {r.status}")
                return
        except urllib.error.HTTPError:
            raise
        except Exception as e:
            last_exc = e
            time.sleep(1.0 + attempt)
    raise RuntimeError(f"supabase PATCH {candidate_id} retried + still failed: {last_exc}")


# ----- feature extraction ---------------------------------------------

def extract_features(row: dict, bars: list[dict]) -> dict | None:
    """Thin Supabase-row adapter over tfo_features.extract_features_for_fire.

    Pulls the detection fields off the candidate row, then delegates to
    the shared pure module. Live (Fly) and backfill (this script) run
    the same math.
    """
    return extract_features_for_fire(
        bars,
        fire_ts=int(row["fire_ts"]),
        pivot_index=row.get("pivot_index"),
        consecutive_count=int(row.get("consecutive_count") or 0),
        strong_count=int(row.get("strong_count") or 0),
    )


# ----- main -----------------------------------------------------------

def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Extract bar-level features for scanner candidates.")
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL)
    parser.add_argument("--recompute", action="store_true",
                        help="Re-extract features for rows that already have a vector")
    parser.add_argument("--throttle", type=float, default=0.15)
    args = parser.parse_args(argv)

    supabase_url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not supabase_url or not key:
        print("ERROR: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required.", flush=True)
        return 2

    rows = supabase_get_rows(supabase_url, key, args.recompute)
    print(f"Extracting features for {len(rows)} candidate(s)", flush=True)
    if not rows:
        return 0

    n_ok, n_skip = 0, 0
    for row in rows:
        bars = fetch_session_5m_bars(args.base_url, row["symbol"], row["session_date"])
        if not bars:
            n_skip += 1
            continue
        features = extract_features(row, bars)
        if not features:
            print(f"  [skip] {row['symbol']} {row['session_date']} — fire bar missing", flush=True)
            n_skip += 1
            continue
        try:
            supabase_patch(supabase_url, key, int(row["id"]), {
                "features": features,
                "features_extracted_at": datetime.utcnow().isoformat() + "Z",
            })
        except Exception as e:
            print(f"  [err ] {row['symbol']} {row['session_date']}: {e}", flush=True)
            n_skip += 1
            continue
        n_ok += 1
        print(
            f"  [ok ] {row['symbol']:5s} {row['session_date']} {row['direction']:<5s}"
            f"  body={features['fire_bar_body_ratio']:.2f}"
            f"  close_pos={features['fire_bar_close_position']:.2f}"
            f"  vs_vol={features['fire_bar_vs_avg_volume']:.2f}x"
            f"  bar#{features['bars_since_open']}",
            flush=True,
        )
        time.sleep(args.throttle)

    print(f"\nDone. {n_ok} extracted, {n_skip} skipped.", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
