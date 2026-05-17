#!/usr/bin/env python3
"""Smoke test for scripts/live/live_pullback_runner.py.

Synthesizes a session of 1min RTH bars containing one small-pullback
long setup, pipes them through the runner with the Supabase insert
mocked, and asserts:

  - The detector fires once and exactly one row is POSTed.
  - The row has the right shape (pattern='pullback', source='live').
  - Pullback geometry is carried through in the features jsonb.
  - Replaying the same session does not re-insert the same fire
    (per-fire de-dup).

The runner's Supabase POST is monkey-patched to capture the row instead
of doing a real HTTP call.

Run:
    python3 scripts/live/live_pullback_runner_test.py
"""

from __future__ import annotations

import os
import sys
from datetime import datetime, time as time_t, timezone
from pathlib import Path
from zoneinfo import ZoneInfo


ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts" / "live"))


def _et_epoch(date_str: str, t: time_t) -> int:
    """ET wall-clock -> unix seconds."""
    dt = datetime.combine(datetime.strptime(date_str, "%Y-%m-%d"), t, tzinfo=ZoneInfo("America/New_York"))
    return int(dt.astimezone(timezone.utc).timestamp())


def _make_long_pullback_minutes() -> list[dict]:
    """One session of 1min RTH bars: 20 quiet bars settle EMA/ATR, then a
    strong 4-bar up impulse, a shallow 2-bar pullback, and a breakout-stop
    fire bar — the same geometry the detector test exercises.
    """
    date = "2026-05-14"
    base = _et_epoch(date, time_t(9, 30))
    ohlc = [(100.0, 100.2, 99.8, 100.0)] * 20  # quiet baseline
    ohlc += [
        (100.0, 101.5, 100.0, 101.4),   # 20: impulse
        (101.4, 103.0, 101.3, 102.9),   # 21
        (102.9, 104.5, 102.8, 104.4),   # 22
        (104.4, 106.0, 104.3, 105.9),   # 23: impulse top
        (105.9, 105.8, 104.8, 104.9),   # 24: pullback bar 1
        (104.9, 105.0, 104.3, 104.5),   # 25: pullback bar 2
        (104.5, 105.5, 104.4, 105.4),   # 26: FIRE — breaks bar 25 high
    ]
    return [
        {"t": base + i * 60, "o": o, "h": h, "l": l, "c": c, "v": 1000}
        for i, (o, h, l, c) in enumerate(ohlc)
    ]


def main() -> int:
    # Enable the runner with bogus creds and monkey-patch the insert path.
    os.environ.setdefault("SUPABASE_URL", "https://test.invalid")
    os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-key")

    from live_pullback_runner import PullbackLiveRunner

    runner = PullbackLiveRunner()
    assert runner.enabled, "Runner failed to enable — env wrong?"

    # Bypass cold-start warm-up: the test feeds the entire session itself.
    runner._warm_buffer = lambda *a, **kw: None  # type: ignore[method-assign]

    captured: list[dict] = []
    runner._insert_candidate = lambda row: captured.append(row)  # type: ignore[method-assign]

    minutes = _make_long_pullback_minutes()
    for bar in minutes:
        runner.on_1m_close("TEST", bar)

    if len(captured) != 1:
        print(f"FAIL: expected exactly 1 detection, got {len(captured)}")
        for c in captured:
            print(f"  {c['symbol']} {c['session_date']} {c['direction']} fire_ts={c['fire_ts']}")
        return 1

    row = captured[0]
    expected = {
        "symbol": "TEST",
        "pattern": "pullback",
        "direction": "long",
        "source": "live",
        "session_date": "2026-05-14",
    }
    for k, v in expected.items():
        if row.get(k) != v:
            print(f"FAIL: row[{k!r}] expected {v!r} got {row.get(k)!r}")
            return 1

    feats = row.get("features") or {}
    for k in ("timeframe", "entry_price", "stop_price", "impulse_atr", "pullback_len", "retrace"):
        if k not in feats:
            print(f"FAIL: features missing {k!r}: {feats}")
            return 1
    if feats["timeframe"] != "1m":
        print(f"FAIL: timeframe expected '1m' got {feats['timeframe']!r}")
        return 1
    if feats["pullback_len"] != 2:
        print(f"FAIL: pullback_len expected 2 got {feats['pullback_len']!r}")
        return 1
    if not (0.0 < feats["retrace"] < 0.5):
        print(f"FAIL: retrace out of expected range: {feats['retrace']}")
        return 1

    # Replay the whole session — the same fire must not insert twice.
    for bar in minutes:
        runner.on_1m_close("TEST", bar)
    if len(captured) != 1:
        print(f"FAIL: replay re-inserted — expected 1 row total, got {len(captured)}")
        return 1

    print(
        f"PASS: detected {row['symbol']} {row['session_date']} {row['direction']} "
        f"fire_ts={row['fire_ts']} score={row['score']:.1f} "
        f"impulse_atr={feats['impulse_atr']} pullback_len={feats['pullback_len']} "
        f"retrace={feats['retrace']}; replay de-duped"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
