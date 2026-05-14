#!/usr/bin/env python3
"""Smoke test for scripts/live_tfo_runner.py.

Synthesizes a session of 1min bars that contains a real TFO long setup
(LOD in first 4 5min bars, then 3+ strong bull closes), pipes them
through the runner with the Supabase insert mocked, and asserts:

  - Detector fires exactly once for that direction.
  - Model produces a probability in [0, 1].
  - The "candidate" row that would have been POSTed has the right shape.

The runner's Supabase POST is monkey-patched to capture the row instead
of doing a real HTTP call. Model + env vars are wired through the
process env using the production joblib in artifacts/tfo-baseline/.

Run:
    python3 scripts/live_tfo_runner_test.py
"""

from __future__ import annotations

import os
import sys
from datetime import datetime, time as time_t, timezone
from pathlib import Path
from zoneinfo import ZoneInfo


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))


def _et_epoch(date_str: str, t: time_t) -> int:
    """ET wall-clock → unix seconds."""
    dt = datetime.combine(datetime.strptime(date_str, "%Y-%m-%d"), t, tzinfo=ZoneInfo("America/New_York"))
    return int(dt.astimezone(timezone.utc).timestamp())


def _make_long_tfo_minutes() -> list[dict]:
    """Synth one session of 1min bars where:
      - bar 1 (9:30) makes the session LOW
      - bars 2,3,4 (9:35, 9:40, 9:45 5min closes) are 3 strong bull closes
      - subsequent bars don't make a new LOW.

    We emit 5 1min bars per 5min bucket so the runner's _FiveMinAggregator
    produces a closed 5min bar each time the bucket rolls.
    """
    date = "2026-05-14"
    # Define the 5min bars we want, then back-fill 1min ticks.
    five_min_bars = [
        # 9:30 — LOD (open 100, drop to 99, recover to 100)
        {"t": _et_epoch(date, time_t(9, 30)),  "o": 100.0, "h": 100.5, "l": 99.0,  "c": 100.0, "v": 5000},
        # 9:35 — strong bull close 1
        {"t": _et_epoch(date, time_t(9, 35)),  "o": 100.0, "h": 101.2, "l": 100.0, "c": 101.1, "v": 6000},
        # 9:40 — strong bull close 2
        {"t": _et_epoch(date, time_t(9, 40)),  "o": 101.1, "h": 102.3, "l": 101.0, "c": 102.2, "v": 6500},
        # 9:45 — strong bull close 3 (fire bar)
        {"t": _et_epoch(date, time_t(9, 45)),  "o": 102.2, "h": 103.4, "l": 102.1, "c": 103.3, "v": 7000},
        # 9:50 — keep moving up (no new LOD)
        {"t": _et_epoch(date, time_t(9, 50)),  "o": 103.3, "h": 103.6, "l": 103.0, "c": 103.5, "v": 4000},
    ]
    # Expand each 5min into 5 1min ticks. The aggregator's _FiveMinAggregator
    # only cares that consecutive 1min bars cross the bucket boundary, so
    # for the smoke test we can put all the OHLCV in the last 1min and
    # zero the rest — but a more realistic shape is to spread it.
    minutes: list[dict] = []
    for fb in five_min_bars:
        t0 = fb["t"]
        # 1min bar 0 — opens with the 5min open, low-tagging the 5min low
        minutes.append({"t": t0,         "o": fb["o"], "h": fb["o"], "l": fb["l"], "c": fb["l"], "v": fb["v"] // 5})
        # 1min bars 1..3 — climb to fb["h"]
        minutes.append({"t": t0 + 60,    "o": fb["l"], "h": fb["l"] + 0.1, "l": fb["l"], "c": fb["l"] + 0.1, "v": fb["v"] // 5})
        minutes.append({"t": t0 + 120,   "o": fb["l"] + 0.1, "h": fb["h"], "l": fb["l"] + 0.1, "c": fb["h"], "v": fb["v"] // 5})
        minutes.append({"t": t0 + 180,   "o": fb["h"], "h": fb["h"], "l": fb["c"], "c": fb["c"], "v": fb["v"] // 5})
        # 1min bar 4 — closes the 5min with fb["c"]
        minutes.append({"t": t0 + 240,   "o": fb["c"], "h": fb["c"], "l": fb["c"], "c": fb["c"], "v": fb["v"] - 4 * (fb["v"] // 5)})
    return minutes


def main() -> int:
    # Point the runner at the production joblib but disable the Supabase
    # write path by leaving SUPABASE_URL unset… actually we want the
    # runner ENABLED, so we set bogus creds and monkey-patch _insert.
    os.environ.setdefault("TFO_MODEL_PATH", str(ROOT / "artifacts" / "tfo-baseline" / "tfo_baseline_mfe_ge_1pct.joblib"))
    os.environ.setdefault("SUPABASE_URL", "https://test.invalid")
    os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-key")

    from live_tfo_runner import TfoLiveRunner

    runner = TfoLiveRunner()
    assert runner.enabled, "Runner failed to enable — model_path / env wrong?"

    # Bypass cold-start warm-up: the smoke test feeds the entire session
    # ourselves; we don't want the runner hitting aiedge.trade/api/bars.
    runner._warm_buffer = lambda *a, **kw: None  # type: ignore[method-assign]

    captured: list[dict] = []
    runner._insert_candidate = lambda row: captured.append(row)  # type: ignore[method-assign]

    minutes = _make_long_tfo_minutes()
    for bar in minutes:
        runner.on_1m_close("TEST", bar)

    if len(captured) != 1:
        print(f"FAIL: expected exactly 1 detection, got {len(captured)}")
        for c in captured:
            print(f"  {c['symbol']} {c['session_date']} {c['direction']} score={c['model_score']:.3f}")
        return 1

    row = captured[0]
    expected = {
        "symbol": "TEST",
        "pattern": "tfo",
        "direction": "long",
        "source": "live",
    }
    for k, v in expected.items():
        if row.get(k) != v:
            print(f"FAIL: row[{k!r}] expected {v!r} got {row.get(k)!r}")
            return 1

    if not (0.0 <= row["model_score"] <= 1.0):
        print(f"FAIL: model_score out of range: {row['model_score']}")
        return 1
    if row["consecutive_count"] < 3 or row["strong_count"] < 2:
        print(f"FAIL: detection fields look wrong: {row}")
        return 1
    if not row["features"] or "fire_bar_body_ratio" not in row["features"]:
        print(f"FAIL: features missing/incomplete: {row.get('features')}")
        return 1

    print(
        f"PASS: detected {row['symbol']} {row['session_date']} {row['direction']} "
        f"score={row['score']:.1f} model_score={row['model_score']:.3f} "
        f"target={row['model_target']} version={row['model_version']}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
