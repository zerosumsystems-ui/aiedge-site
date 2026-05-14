#!/usr/bin/env python3
"""One-shot: populate setup_candidates.strong_bar_ts on existing TFO rows.

The detector emits strong_bar_timestamps now, but the 285 rows already
in the DB pre-date that field. Re-running the full
scripts/backfill_tfo_candidates.py would work but uses merge-duplicates,
which would overwrite per-row trader fields (status, note) — non-destructive
today because we have 0 labels, foot-gun later.

This script only PATCHes strong_bar_ts on rows where it's still null.
For each candidate it fetches the session 5min bars, re-runs the
detector, matches by fire_ts + direction, and writes the timestamps.
Idempotent; no other columns touched.

Usage:
    python3 scripts/backfill_strong_bar_ts.py

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

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from tfo_detector import Bar5m, detect_tfo  # noqa: E402

DEFAULT_BASE_URL = "https://www.aiedge.trade"


def supabase_get_rows(supabase_url: str, key: str) -> list[dict]:
    qs = {
        "select": "id,symbol,session_date,direction,fire_ts",
        "pattern": "eq.tfo",
        "strong_bar_ts": "is.null",
        "order": "fire_ts.asc",
        "limit": "5000",
    }
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


def fetch_session_5m_bars(base_url: str, ticker: str, day: str) -> list[Bar5m]:
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
        payload = json.loads(r.read())
    raw = payload.get("bars") or []
    return [
        Bar5m(t=int(b["t"]), o=float(b["o"]), h=float(b["h"]), l=float(b["l"]), c=float(b["c"]), v=float(b.get("v") or 0))
        for b in raw
    ]


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL)
    parser.add_argument("--throttle", type=float, default=0.1)
    args = parser.parse_args(argv)

    supabase_url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not supabase_url or not key:
        print("ERROR: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required.", file=sys.stderr)
        return 2

    rows = supabase_get_rows(supabase_url, key)
    print(f"Backfilling strong_bar_ts for {len(rows)} candidate(s)")
    if not rows:
        return 0

    n_ok, n_skip = 0, 0
    for row in rows:
        try:
            bars = fetch_session_5m_bars(args.base_url, row["symbol"], row["session_date"])
        except Exception as e:
            print(f"  [skip] {row['symbol']} {row['session_date']} bars: {e}")
            n_skip += 1
            continue

        signals = detect_tfo(bars)
        # Match by fire_ts + direction. There can be 0..2 signals per
        # session (one per direction) — we identify the one for this row.
        target_fire_ts = int(row["fire_ts"])
        match = next(
            (s for s in signals if s.fire_ts == target_fire_ts and s.direction == row["direction"]),
            None,
        )
        if match is None:
            print(
                f"  [skip] {row['symbol']} {row['session_date']} {row['direction']} — "
                f"detector found no matching signal (fire_ts={target_fire_ts})"
            )
            n_skip += 1
            continue

        strong_bar_ts = list(match.strong_bar_timestamps)
        try:
            supabase_patch(supabase_url, key, int(row["id"]), {"strong_bar_ts": strong_bar_ts})
        except Exception as e:
            print(f"  [err ] {row['symbol']} {row['session_date']}: {e}")
            n_skip += 1
            continue
        n_ok += 1
        print(
            f"  [ok ] {row['symbol']:5s} {row['session_date']} {row['direction']:<5s}"
            f"  strong={len(strong_bar_ts)}"
        )
        time.sleep(args.throttle)

    print(f"\nDone. {n_ok} backfilled, {n_skip} skipped.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
