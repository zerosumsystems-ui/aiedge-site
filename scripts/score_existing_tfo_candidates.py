#!/usr/bin/env python3
"""One-shot scorer for the pre-existing TFO candidates.

The Fly aggregator will eventually score every new candidate inline at
fire time. Until that ships, this script backfills model_score on rows
that already exist in setup_candidates (the 285 rows the backfill +
features pipeline produced before scoring was a thing).

Loads the production joblib from artifacts/tfo-baseline/, fetches
candidates missing model_scored_at, runs predict_proba on the stored
features JSONB, and PATCHes the score back. Idempotent: skips rows that
already have a model_scored_at.

Usage:
    python3 scripts/score_existing_tfo_candidates.py
    python3 scripts/score_existing_tfo_candidates.py --recompute
    python3 scripts/score_existing_tfo_candidates.py --model path/to.joblib

Required env:
    SUPABASE_URL              -- e.g. https://YOUR.supabase.co
    SUPABASE_SERVICE_ROLE_KEY -- service role, writes bypass RLS
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from joblib import load

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_MODEL = ROOT / "artifacts" / "tfo-baseline" / "tfo_baseline_mfe_ge_1pct.joblib"


def supabase_get_rows(supabase_url: str, key: str, recompute: bool) -> list[dict]:
    qs = {
        "select": "id,symbol,session_date,direction,fire_ts,features",
        "pattern": "eq.tfo",
        "features_extracted_at": "not.is.null",
        "order": "session_date.asc,fire_ts.asc",
        "limit": "5000",
    }
    if not recompute:
        qs["model_scored_at"] = "is.null"
    url = supabase_url.rstrip("/") + "/rest/v1/setup_candidates?" + urllib.parse.urlencode(qs)
    req = urllib.request.Request(url, headers={
        "apikey": key,
        "Authorization": f"Bearer {key}",
    })
    with urllib.request.urlopen(req, timeout=60) as r:
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


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--model", type=Path, default=DEFAULT_MODEL)
    parser.add_argument("--recompute", action="store_true",
                        help="Re-score rows that already have a model_scored_at")
    args = parser.parse_args(argv)

    supabase_url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not supabase_url or not key:
        print("ERROR: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required.", file=sys.stderr)
        return 2

    if not args.model.exists():
        print(f"ERROR: model not found at {args.model}", file=sys.stderr)
        return 2

    bundle = load(args.model)
    model = bundle["model"]
    feature_columns: list[str] = bundle["feature_columns"]
    target: str = bundle["target"]
    model_version: str = bundle.get("model_version") or bundle.get("trained_at") or "unknown"
    print(f"Loaded model: target={target} version={model_version}")
    print(f"Feature columns ({len(feature_columns)}): {feature_columns}")

    rows = supabase_get_rows(supabase_url, key, args.recompute)
    print(f"Scoring {len(rows)} candidate(s)")
    if not rows:
        return 0

    scored_at = datetime.now(timezone.utc).isoformat()
    n_ok, n_skip = 0, 0
    for row in rows:
        feats = row.get("features") or {}
        try:
            # Build the input vector in the order the model expects.
            # dir_long is derived from the row.direction, not from features.
            x_row = []
            for col in feature_columns:
                if col == "dir_long":
                    x_row.append(1 if row["direction"] == "long" else 0)
                else:
                    v = feats.get(col)
                    if v is None:
                        raise ValueError(f"missing feature {col!r}")
                    x_row.append(float(v))
            x = np.array([x_row], dtype=float)
            proba = float(model.predict_proba(x)[0, 1])
        except Exception as e:
            print(f"  [skip] {row['symbol']} {row['session_date']}: {e}")
            n_skip += 1
            continue

        try:
            supabase_patch(supabase_url, key, int(row["id"]), {
                "model_score": round(proba, 6),
                "model_target": target,
                "model_version": model_version,
                "model_scored_at": scored_at,
            })
        except Exception as e:
            print(f"  [err ] {row['symbol']} {row['session_date']}: {e}")
            n_skip += 1
            continue
        n_ok += 1
        print(
            f"  [ok ] {row['symbol']:5s} {row['session_date']} {row['direction']:<5s}"
            f"  p={proba:.3f}"
        )

    print(f"\nDone. {n_ok} scored, {n_skip} skipped.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
