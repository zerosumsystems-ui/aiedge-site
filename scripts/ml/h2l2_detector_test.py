"""Tests for h2l2_detector. Run: python3 scripts/ml/h2l2_detector_test.py"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "live"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from tfo_detector import Bar5m  # noqa: E402
from h2l2_detector import detect_h2l2  # noqa: E402


def assert_eq(actual, expected, label):
    if actual != expected:
        print(f"FAIL {label}: expected {expected!r}, got {actual!r}")
        sys.exit(1)
    print(f"PASS {label}")


def _bars(rows):
    """rows = list of (o, h, l, c); timestamps are the bar index."""
    return [Bar5m(t=i, o=o, h=h, l=l, c=c) for i, (o, h, l, c) in enumerate(rows)]


def _reflect(rows, k=300.0):
    """Mirror a bull sequence into its bear twin: price p -> k - p, with
    the high and low swapped."""
    return [(k - o, k - l, k - h, k - c) for (o, h, l, c) in rows]


# A clean bull H2: 21 rising bars, a swing top, a two-legged pullback
# (leg 1 down, the H1 up-poke, leg 2 down), a signal bar, then the
# breakout bar that trades past the signal bar's high.
_H2_ROWS = (
    [(100.0 + j, 101.0 + j, 100.0 + j, 101.0 + j) for j in range(21)]
    + [
        (121.0, 123.0, 121.0, 122.5),   # 21 swing top
        (122.0, 122.0, 120.0, 120.5),   # 22 leg 1 down
        (120.5, 120.8, 119.0, 119.5),   # 23 leg 1 low
        (119.5, 121.0, 119.5, 120.8),   # 24 H1 — first up-poke
        (120.8, 120.9, 118.0, 118.5),   # 25 leg 2 down
        (118.5, 119.0, 117.5, 118.0),   # 26 leg 2 low
        (118.0, 118.8, 117.8, 118.6),   # 27 H2 signal bar
        (118.6, 120.5, 118.6, 120.0),   # 28 breakout — fires the H2
    ]
)


def test_clean_h2_long():
    sigs = detect_h2l2(_bars(_H2_ROWS))
    assert_eq(len(sigs), 1, "one H2 signal")
    s = sigs[0]
    assert_eq(s.direction, "long", "H2 is a long")
    assert_eq(s.fire_index, 28, "fires on the breakout bar")
    assert_eq(s.signal_index, 27, "signal bar is the bar before the breakout")
    assert_eq(s.h1_index, 24, "H1 is the first up-poke of the pullback")
    assert_eq(s.impulse_top_index, 21, "pullback hangs from the swing top")
    assert_eq(s.entry_price, 118.81, "entry is 1 tick above the signal bar")
    assert_eq(s.stop_price, 117.49, "stop is 1 tick below the pullback low")


def test_one_leg_pullback_is_not_an_h2():
    """A single straight leg down has no H1 attempt — not an H2."""
    rows = (
        [(100.0 + j, 101.0 + j, 100.0 + j, 101.0 + j) for j in range(21)]
        + [
            (121.0, 123.0, 121.0, 122.5),   # swing top
            (122.0, 122.0, 120.0, 120.5),   # straight down — lower highs
            (120.5, 120.8, 119.0, 119.5),
            (119.5, 119.6, 118.0, 118.2),
            (118.2, 118.9, 117.8, 118.6),   # signal bar (still a lower high)
            (118.6, 120.5, 118.6, 120.0),   # breakout
        ]
    )
    assert_eq(len(detect_h2l2(_bars(rows))), 0, "one-leg pullback is rejected")


def test_h3_breakout_is_not_an_h2():
    """A breakout after two earlier up-pokes is a High 3 — it must not
    fire. (The earlier High 2 in the same pullback is a real signal.)"""
    rows = (
        [(100.0 + j, 101.0 + j, 100.0 + j, 101.0 + j) for j in range(21)]
        + [
            (121.0, 123.0, 121.0, 122.5),   # 21 swing top
            (122.0, 121.5, 120.0, 120.5),   # 22 leg 1 down
            (120.5, 122.0, 120.3, 121.0),   # 23 H1 — up-poke #1
            (121.0, 120.5, 119.0, 119.3),   # 24 leg 2 down
            (119.3, 121.0, 119.0, 120.8),   # 25 H2 — up-poke #2 (a real H2)
            (120.8, 120.9, 117.0, 117.4),   # 26 leg 3 down
            (117.4, 118.2, 116.8, 118.0),   # 27 signal bar
            (118.0, 120.5, 118.0, 120.0),   # 28 breakout — this is a High 3
        ]
    )
    fires = [s.fire_index for s in detect_h2l2(_bars(rows))]
    assert_eq(28 in fires, False, "the High 3 breakout does not fire")
    assert_eq(25 in fires, True, "the earlier High 2 still fires")


def test_clean_l2_short():
    """The bear mirror of the bull H2 must fire exactly one Low 2."""
    sigs = detect_h2l2(_bars(_reflect(_H2_ROWS)))
    assert_eq(len(sigs), 1, "one L2 signal")
    assert_eq(sigs[0].direction, "short", "L2 is a short")
    assert_eq(sigs[0].fire_index, 28, "L2 fires on the breakout bar")


if __name__ == "__main__":
    test_clean_h2_long()
    test_one_leg_pullback_is_not_an_h2()
    test_h3_breakout_is_not_an_h2()
    test_clean_l2_short()
    print("\nall h2l2_detector tests passed")
