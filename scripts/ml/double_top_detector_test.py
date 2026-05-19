"""Tests for double_top_detector.
Run: python3 scripts/ml/double_top_detector_test.py"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "live"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from tfo_detector import Bar5m  # noqa: E402
from double_top_detector import detect_double_tops  # noqa: E402


def assert_eq(actual, expected, label):
    if actual != expected:
        print(f"FAIL {label}: expected {expected!r}, got {actual!r}")
        sys.exit(1)
    print(f"PASS {label}")


def _bars(rows):
    return [Bar5m(t=i, o=o, h=h, l=l, c=c) for i, (o, h, l, c) in enumerate(rows)]


def _reflect(rows, k=400.0):
    return [(k - o, k - l, k - h, k - c) for (o, h, l, c) in rows]


# 20 warm-up bars, then two tops at ~equal highs (124.0 and 124.2,
# peaks at 21 and 25) with a trough between, then a downside trigger.
_DT_ROWS = (
    [(100.0 + j, 101.0 + j, 100.0 + j, 101.0 + j) for j in range(20)]
    + [
        (120.0, 121.0, 119.5, 120.5),   # 20
        (120.5, 124.0, 120.0, 123.0),   # 21 top 1
        (123.0, 123.0, 121.0, 121.5),   # 22
        (121.5, 122.0, 120.0, 120.5),   # 23 trough
        (120.5, 123.0, 120.3, 122.8),   # 24
        (122.8, 124.2, 122.5, 123.5),   # 25 top 2 (~equal)
        (123.5, 123.6, 122.0, 122.3),   # 26
        (122.3, 122.4, 120.0, 120.5),   # 27 reversal trigger
    ]
)


def test_clean_double_top_shorts():
    sigs = detect_double_tops(_bars(_DT_ROWS))
    assert_eq(len(sigs), 1, "one double-top signal")
    s = sigs[0]
    assert_eq(s.direction, "short", "a double top reverses short")
    assert_eq(s.fire_index, 27, "fires on the reversal trigger")
    assert_eq(s.extreme_indices, (21, 25), "the two tops")
    assert_eq(s.stop_price, 124.21, "stop is 1 tick above the higher top")


def test_higher_second_top_is_not_a_double_top():
    """A second top far above the first is a higher high, not a double top."""
    rows = list(_DT_ROWS)
    rows[25] = (122.8, 131.0, 122.5, 130.5)   # top 2 way above top 1
    assert_eq(len(detect_double_tops(_bars(rows))), 0,
              "unequal tops are rejected")


def test_double_bottom_goes_long():
    sigs = detect_double_tops(_bars(_reflect(_DT_ROWS)))
    assert_eq(len(sigs), 1, "one double-bottom signal")
    assert_eq(sigs[0].direction, "long", "a double bottom reverses long")


if __name__ == "__main__":
    test_clean_double_top_shorts()
    test_higher_second_top_is_not_a_double_top()
    test_double_bottom_goes_long()
    print("\nall double_top_detector tests passed")
