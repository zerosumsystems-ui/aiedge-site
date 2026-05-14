#!/usr/bin/env python3
"""Extract a bar-level feature vector for every TFO candidate.

Inputs come from /api/bars at 5min RTH granularity for the candidate's
session. Outputs go to setup_candidates.features as JSONB. Idempotent:
skips rows where features_extracted_at is set, unless --recompute.

The feature set is intentionally small and pre-fire-only so it can be
computed live the moment a candidate fires (V1 → backfill, V2 → live).
Names are short + stable; we'll add more as the model matures.

Required env:
    SUPABASE_URL              -- e.g. https://YOUR.supabase.co
    SUPABASE_SERVICE_ROLE_KEY -- service role, bypasses RLS
"""

from __future__ import annotations

import argparse
import json
import math
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime

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
    with urllib.request.urlopen(req, timeout=30) as r:
        if r.status >= 300:
            raise RuntimeError(f"supabase PATCH {candidate_id} -> {r.status}")


# ----- feature extraction ---------------------------------------------

def bar_body_ratio(b: dict) -> float:
    rng = float(b["h"]) - float(b["l"])
    if rng <= 0:
        return 0.0
    return abs(float(b["c"]) - float(b["o"])) / rng


def bar_close_position(b: dict) -> float:
    """Where in the bar's range did it close, 0=at low, 1=at high."""
    rng = float(b["h"]) - float(b["l"])
    if rng <= 0:
        return 0.5
    return (float(b["c"]) - float(b["l"])) / rng


def bar_upper_tail(b: dict) -> float:
    rng = float(b["h"]) - float(b["l"])
    if rng <= 0:
        return 0.0
    return (float(b["h"]) - max(float(b["o"]), float(b["c"]))) / rng


def bar_lower_tail(b: dict) -> float:
    rng = float(b["h"]) - float(b["l"])
    if rng <= 0:
        return 0.0
    return (min(float(b["o"]), float(b["c"])) - float(b["l"])) / rng


def safe_div(a: float, b: float, default: float = 0.0) -> float:
    if not math.isfinite(b) or b == 0:
        return default
    return a / b


def extract_features(row: dict, bars: list[dict]) -> dict | None:
    """All features are deliberately pre-fire-bar-inclusive — nothing
    leaks from the future. Returns None if we don't have enough bars
    to compute meaningfully (e.g., fire bar absent)."""
    fire_ts = int(row["fire_ts"])
    pivot_index = row.get("pivot_index")
    fired_idx = next((i for i, b in enumerate(bars) if int(b["t"]) == fire_ts), None)
    if fired_idx is None or fired_idx < 1:
        return None

    fire = bars[fired_idx]
    open_bar = bars[0]
    pre_fire = bars[: fired_idx + 1]
    confirming = bars[(pivot_index or 0) + 1 : fired_idx + 1] if pivot_index is not None else bars[: fired_idx + 1]

    # Range / volume context across the pre-fire window.
    pre_ranges = [float(b["h"]) - float(b["l"]) for b in pre_fire]
    avg_range = sum(pre_ranges) / len(pre_ranges) if pre_ranges else 0.0
    fire_range = float(fire["h"]) - float(fire["l"])

    pre_vols = [float(b.get("v") or 0) for b in pre_fire[:-1]]  # everything before fire
    avg_vol_pre = sum(pre_vols) / len(pre_vols) if pre_vols else 0.0
    fire_vol = float(fire.get("v") or 0)

    # Distance the fire bar's close has traveled from session open.
    session_open = float(open_bar["o"])
    dist_from_open_pct = safe_div(float(fire["c"]) - session_open, session_open) * 100.0

    # Body / tail / close-position stats on the fire bar specifically.
    fb_body = bar_body_ratio(fire)
    fb_close_pos = bar_close_position(fire)
    fb_upper_tail = bar_upper_tail(fire)
    fb_lower_tail = bar_lower_tail(fire)

    # Confirming-run stats: average body ratio + average close position
    # of the bars in the run.
    if confirming:
        avg_body_ratio = sum(bar_body_ratio(b) for b in confirming) / len(confirming)
        avg_close_pos = sum(bar_close_position(b) for b in confirming) / len(confirming)
    else:
        avg_body_ratio = 0.0
        avg_close_pos = 0.5

    return {
        "fire_bar_body_ratio": round(fb_body, 4),
        "fire_bar_close_position": round(fb_close_pos, 4),
        "fire_bar_upper_tail": round(fb_upper_tail, 4),
        "fire_bar_lower_tail": round(fb_lower_tail, 4),
        "fire_bar_range_pct": round(safe_div(fire_range, float(fire["c"])) * 100, 4),
        "fire_bar_vs_avg_range": round(safe_div(fire_range, avg_range), 4),
        "fire_bar_vs_avg_volume": round(safe_div(fire_vol, avg_vol_pre), 4),
        "dist_from_open_pct": round(dist_from_open_pct, 4),
        "confirming_avg_body_ratio": round(avg_body_ratio, 4),
        "confirming_avg_close_position": round(avg_close_pos, 4),
        "bars_since_open": fired_idx,           # 0-indexed; bar 3 = 4th bar of session
        "consecutive_count": int(row.get("consecutive_count") or 0),
        "strong_count": int(row.get("strong_count") or 0),
        "strong_fraction": round(
            safe_div(int(row.get("strong_count") or 0), int(row.get("consecutive_count") or 1)),
            4,
        ),
    }


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
        supabase_patch(supabase_url, key, int(row["id"]), {
            "features": features,
            "features_extracted_at": datetime.utcnow().isoformat() + "Z",
        })
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
