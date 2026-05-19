"""Tests for ii_detector. Run: python3 scripts/ml/ii_detector_test.py"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "live"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from tfo_detector import Bar5m  # noqa: E402
from ii_detector import detect_ii  # noqa: E402


def assert_eq(actual, expected, label):
    if actual != expected:
        print(f"FAIL {label}: expected {expected!r}, got {actual!r}")
        sys.exit(1)
    print(f"PASS {label}")


def _bars(rows):
    return [Bar5m(t=i, o=o, h=h, l=l, c=c) for i, (o, h, l, c) in enumerate(rows)]


def _reflect(rows, k=300.0):
    return [(k - o, k - l, k - h, k - c) for (o, h, l, c) in rows]


# 21 rising bars (a rising EMA), then a wide bar, two inside bars, then
# the breakout bar.
_II_ROWS = (
    [(100.0 + j, 101.0 + j, 100.0 + j, 101.0 + j) for j in range(21)]
    + [
        (120.5, 122.0, 119.0, 121.0),   # 21 outer bar
        (120.0, 121.5, 119.5, 120.5),   # 22 inside bar #1
        (120.3, 121.0, 120.0, 120.8),   # 23 inside bar #2 (signal bar)
        (120.8, 122.5, 120.7, 122.3),   # 24 breakout bar
    ]
)


def test_clean_ii_long():
    sigs = detect_ii(_bars(_II_ROWS))
    assert_eq(len(sigs), 1, "one ii signal")
    s = sigs[0]
    assert_eq(s.direction, "long", "ii breakout is long")
    assert_eq(s.fire_index, 24, "fires on the breakout bar")
    assert_eq(s.inside_count, 2, "two inside bars = an ii")
    assert_eq(s.entry_price, 121.01, "entry is 1 tick above the last inside bar")
    assert_eq(s.stop_price, 119.49, "stop is 1 tick below the pattern low")


def test_no_inside_bars_no_signal():
    """Three bars that each poke out of the prior are not an ii."""
    rows = (
        [(100.0 + j, 101.0 + j, 100.0 + j, 101.0 + j) for j in range(21)]
        + [
            (120.5, 122.0, 119.0, 121.0),
            (121.0, 123.0, 120.0, 122.0),   # pokes above — not inside
            (122.0, 123.5, 121.0, 123.0),   # pokes above — not inside
            (123.0, 125.0, 123.0, 124.5),
        ]
    )
    assert_eq(len(detect_ii(_bars(rows))), 0, "no inside bars -> no signal")


def test_clean_ii_short():
    """The bear mirror must fire exactly one short ii breakout."""
    sigs = detect_ii(_bars(_reflect(_II_ROWS)))
    assert_eq(len(sigs), 1, "one short ii signal")
    assert_eq(sigs[0].direction, "short", "mirror is a short")


if __name__ == "__main__":
    test_clean_ii_long()
    test_no_inside_bars_no_signal()
    test_clean_ii_short()
    print("\nall ii_detector tests passed")
