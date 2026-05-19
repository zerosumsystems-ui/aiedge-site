"""Tests for wedge_detector. Run: python3 scripts/ml/wedge_detector_test.py"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "live"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from tfo_detector import Bar5m  # noqa: E402
from wedge_detector import detect_wedges  # noqa: E402


def assert_eq(actual, expected, label):
    if actual != expected:
        print(f"FAIL {label}: expected {expected!r}, got {actual!r}")
        sys.exit(1)
    print(f"PASS {label}")


def _bars(rows):
    return [Bar5m(t=i, o=o, h=h, l=l, c=c) for i, (o, h, l, c) in enumerate(rows)]


def _reflect(rows, k=400.0):
    return [(k - o, k - l, k - h, k - c) for (o, h, l, c) in rows]


# 20 warm-up bars (a rising EMA), then a bull wedge — three rising
# pushes (peaks at 21, 23, 25) with rising lows — then a bar that
# breaks below the prior low and triggers the short reversal.
_WEDGE_ROWS = (
    [(100.0 + j, 101.0 + j, 100.0 + j, 101.0 + j) for j in range(20)]
    + [
        (120.0, 121.0, 119.5, 120.5),   # 20
        (120.5, 123.0, 120.0, 122.0),   # 21 push 1
        (122.0, 122.0, 120.5, 121.0),   # 22
        (121.0, 124.5, 121.0, 124.0),   # 23 push 2
        (124.0, 124.0, 122.0, 122.5),   # 24
        (122.5, 126.0, 122.3, 125.5),   # 25 push 3
        (125.5, 125.5, 123.0, 123.5),   # 26
        (123.5, 123.6, 121.0, 121.5),   # 27 reversal trigger
    ]
)


def test_clean_bull_wedge_shorts():
    sigs = detect_wedges(_bars(_WEDGE_ROWS))
    assert_eq(len(sigs), 1, "one wedge signal")
    s = sigs[0]
    assert_eq(s.direction, "short", "a bull wedge reverses short")
    assert_eq(s.fire_index, 27, "fires on the reversal trigger bar")
    assert_eq(s.push_indices, (21, 23, 25), "three rising pushes")
    assert_eq(s.entry_price, 122.99, "entry is 1 tick below the trigger bar")
    assert_eq(s.stop_price, 126.01, "stop is 1 tick above push 3")


def test_two_pushes_is_not_a_wedge():
    """Only two pushes up — not a three-push wedge."""
    rows = (
        [(100.0 + j, 101.0 + j, 100.0 + j, 101.0 + j) for j in range(20)]
        + [
            (120.0, 121.0, 119.5, 120.5),
            (120.5, 123.0, 120.0, 122.0),   # push 1
            (122.0, 122.0, 120.5, 121.0),
            (121.0, 124.5, 121.0, 124.0),   # push 2
            (124.0, 124.0, 122.0, 122.5),
            (122.5, 122.6, 120.0, 120.5),   # trigger — but only 2 pushes
        ]
    )
    assert_eq(len(detect_wedges(_bars(rows))), 0, "two pushes is not a wedge")


def test_bear_wedge_goes_long():
    """The bear mirror of the bull wedge must fire one long reversal."""
    sigs = detect_wedges(_bars(_reflect(_WEDGE_ROWS)))
    assert_eq(len(sigs), 1, "one bear-wedge signal")
    assert_eq(sigs[0].direction, "long", "a bear wedge reverses long")


if __name__ == "__main__":
    test_clean_bull_wedge_shorts()
    test_two_pushes_is_not_a_wedge()
    test_bear_wedge_goes_long()
    print("\nall wedge_detector tests passed")
