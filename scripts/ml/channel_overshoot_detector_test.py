"""Invariant tests for channel_overshoot_detector.
Run: python3 scripts/ml/channel_overshoot_detector_test.py

Runs the detector across a sample of the downloaded analogs corpus and
asserts the structural invariants every signal must satisfy: a sane
direction, an in-range fire bar, positive prices, a positive measured
move, and entry / stop / target ordered correctly for the direction.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "live"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from tfo_detector import Bar5m  # noqa: E402
from channel_overshoot_detector import detect_channel_overshoots  # noqa: E402


def _sessions(limit=400):
    root = Path(__file__).resolve().parents[2]
    out = []
    for d in sorted((root / "public" / "analogs").iterdir())[:limit]:
        sj = d / "session.json"
        if not sj.exists():
            continue
        try:
            s = json.loads(sj.read_text())
        except Exception:
            continue
        c = s.get("close") or []
        if len(c) < 25 or not c[0] or c[0] <= 0:
            continue
        scale = 1e9 if c[0] > 1e6 else 1.0
        o, h, l = s["open"], s["high"], s["low"]
        bars = [Bar5m(t=i, o=o[i] / scale, h=h[i] / scale,
                      l=l[i] / scale, c=c[i] / scale) for i in range(len(c))]
        if any(b.h <= 0 or b.l <= 0 for b in bars):
            continue
        out.append(bars)
    return out


def main():
    sessions = _sessions()
    assert sessions, "no analogs sessions loaded"
    total = 0
    for bars in sessions:
        for sg in detect_channel_overshoots(bars, "5m"):
            total += 1
            assert sg.direction in ("long", "short"), "direction"
            assert 0 <= sg.fire_index < len(bars), "fire_index in range"
            assert sg.entry_price > 0 and sg.stop_price > 0, "prices positive"
            assert sg.target_price > 0, "target positive"
            assert sg.move_height > 0, "measured move positive"
            if sg.direction == "long":
                assert sg.stop_price < sg.entry_price < sg.target_price, \
                    "long: stop < entry < target"
            else:
                assert sg.target_price < sg.entry_price < sg.stop_price, \
                    "short: target < entry < stop"
    assert total > 0, "detector produced no signals across the sample"
    print(f"PASS channel_overshoot: {total} signals across {len(sessions)} sessions, "
          f"all invariants hold")


if __name__ == "__main__":
    main()
