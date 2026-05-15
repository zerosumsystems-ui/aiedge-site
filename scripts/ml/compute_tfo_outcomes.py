#!/usr/bin/env python3
"""Compute objective outcomes for scanner candidates.

For each row in public.setup_candidates where outcome_computed_at is
null, fetch the next N 5-min bars after fire_ts via /api/bars, compute:

  outcome_net_pct  = signed net move in the direction of the candidate
                     (long: (close_last - fire_close) / fire_close;
                      short: (fire_close - close_last) / fire_close)
  outcome_mfe_pct  = maximum favorable excursion in the window (>= 0)
  outcome_mae_pct  = maximum adverse excursion in the window (>= 0)
  outcome_bars_seen = how many bars we actually saw (<= window N)

Then upsert via PATCH-by-id to Supabase. Idempotent: skip rows that
already have outcome_computed_at set unless --recompute is passed.

Usage:
    python3 scripts/compute_tfo_outcomes.py
    python3 scripts/compute_tfo_outcomes.py --window 24
    python3 scripts/compute_tfo_outcomes.py --recompute --base-url http://127.0.0.1:3000

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
from typing import Any

DEFAULT_BASE_URL = "https://www.aiedge.trade"
DEFAULT_WINDOW = 24  # 24 x 5min = 2h after fire


def supabase_get_candidates(supabase_url: str, service_role: str, recompute: bool) -> list[dict]:
    """Pull candidates needing outcome computation. Filter to those with
    null outcome_computed_at unless --recompute."""
    base = supabase_url.rstrip("/") + "/rest/v1/setup_candidates"
    qs = {
        "select": "id,symbol,session_date,direction,fire_ts,outcome_computed_at",
        "order": "fire_ts.asc",
        "limit": "10000",
    }
    if not recompute:
        qs["outcome_computed_at"] = "is.null"
    url = base + "?" + urllib.parse.urlencode(qs)
    req = urllib.request.Request(url, headers={
        "apikey": service_role,
        "Authorization": f"Bearer {service_role}",
    })
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())


def supabase_patch(supabase_url: str, service_role: str, candidate_id: int, patch: dict) -> None:
    base = supabase_url.rstrip("/") + f"/rest/v1/setup_candidates?id=eq.{candidate_id}"
    req = urllib.request.Request(
        base,
        method="PATCH",
        data=json.dumps(patch).encode("utf-8"),
        headers={
            "apikey": service_role,
            "Authorization": f"Bearer {service_role}",
            "Content-Type": "application/json",
            "Prefer": "return=minimal",
        },
    )
    # Retry transient network/SSL hiccups once. A one-off TLS error on
    # row N shouldn't lose the remaining sweep — every row is independent.
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
            payload = json.loads(resp.read())
    except urllib.error.HTTPError as e:
        body = e.read()[:120].decode("utf-8", errors="replace")
        print(f"  [skip] {ticker} {day} HTTP {e.code}: {body}", flush=True)
        return []
    except Exception as e:
        print(f"  [skip] {ticker} {day} err: {e}", flush=True)
        return []
    return payload.get("bars") or []


def compute_outcome(fire_ts: int, direction: str, bars: list[dict], window: int) -> dict | None:
    """Walk forward from the bar AFTER fire_ts (exclusive) up to `window`
    bars. Return outcome dict, or None if we have no post-fire bars at
    all (in which case the candidate stays uncomputed for now).
    """
    # Find the index of the fire bar; we need its close as the anchor.
    fire_idx = next((i for i, b in enumerate(bars) if int(b["t"]) == fire_ts), None)
    if fire_idx is None:
        return None
    fire_close = float(bars[fire_idx]["c"])
    if fire_close <= 0:
        return None
    post = bars[fire_idx + 1 : fire_idx + 1 + window]
    if not post:
        return None

    if direction == "long":
        # favorable = price > fire_close
        mfe = max(0.0, (max(float(b["h"]) for b in post) - fire_close) / fire_close)
        mae = max(0.0, (fire_close - min(float(b["l"]) for b in post)) / fire_close)
        net = (float(post[-1]["c"]) - fire_close) / fire_close
    else:
        # short — favorable = price < fire_close
        mfe = max(0.0, (fire_close - min(float(b["l"]) for b in post)) / fire_close)
        mae = max(0.0, (max(float(b["h"]) for b in post) - fire_close) / fire_close)
        net = (fire_close - float(post[-1]["c"])) / fire_close

    return {
        "outcome_window_bars": window,
        "outcome_net_pct": round(net * 100, 4),
        "outcome_mfe_pct": round(mfe * 100, 4),
        "outcome_mae_pct": round(mae * 100, 4),
        "outcome_bars_seen": len(post),
        "outcome_computed_at": datetime.utcnow().isoformat() + "Z",
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Compute objective outcomes for scanner candidates.")
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL,
                        help=f"AIedge base URL (default {DEFAULT_BASE_URL})")
    parser.add_argument("--window", type=int, default=DEFAULT_WINDOW,
                        help=f"Bars after fire to evaluate (default {DEFAULT_WINDOW} = 2h at 5min)")
    parser.add_argument("--recompute", action="store_true",
                        help="Re-evaluate candidates that already have an outcome computed")
    parser.add_argument("--throttle", type=float, default=0.15,
                        help="Seconds between /api/bars calls")
    args = parser.parse_args(argv)

    supabase_url = os.environ.get("SUPABASE_URL")
    service_role = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not supabase_url or not service_role:
        print("ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required.", flush=True)
        return 2

    rows = supabase_get_candidates(supabase_url, service_role, args.recompute)
    print(f"Computing outcomes for {len(rows)} candidate(s) (window={args.window} bars)", flush=True)
    if not rows:
        return 0

    n_ok, n_skip = 0, 0
    for row in rows:
        bars = fetch_session_5m_bars(args.base_url, row["symbol"], row["session_date"])
        if not bars:
            n_skip += 1
            continue
        outcome = compute_outcome(int(row["fire_ts"]), row["direction"], bars, args.window)
        if not outcome:
            print(f"  [skip] {row['symbol']} {row['session_date']} — no post-fire bars", flush=True)
            n_skip += 1
            continue
        try:
            supabase_patch(supabase_url, service_role, int(row["id"]), outcome)
        except Exception as e:
            print(f"  [err ] {row['symbol']} {row['session_date']}: {e}", flush=True)
            n_skip += 1
            continue
        n_ok += 1
        direction = row["direction"]
        sign = "+" if outcome["outcome_net_pct"] >= 0 else ""
        print(
            f"  [ok ] {row['symbol']:5s} {row['session_date']} {direction:<5s}"
            f"  net {sign}{outcome['outcome_net_pct']:>6.2f}%"
            f"  mfe {outcome['outcome_mfe_pct']:>5.2f}%"
            f"  mae {outcome['outcome_mae_pct']:>5.2f}%"
            f"  ({outcome['outcome_bars_seen']} bars)",
            flush=True,
        )
        time.sleep(args.throttle)

    print(f"\nDone. {n_ok} computed, {n_skip} skipped.", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
