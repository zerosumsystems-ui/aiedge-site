"""Tests for h2_detector. Run: python3 scripts/h2_detector_test.py"""

from __future__ import annotations

import sys

from tfo_detector import Bar5m
from h2_detector import detect_h2


def assert_eq(actual, expected, label: str):
    if actual != expected:
        print(f"FAIL {label}: expected {expected!r}, got {actual!r}")
        sys.exit(1)
    print(f"PASS {label}")


def strong_bull(t, lo, top):
    return Bar5m(t=t, o=lo, h=top, l=lo, c=top)


# 3-bar bull spike, then a two-legged pullback: pause -> H1 -> lower
# high -> H2.
BULL = [
    strong_bull(0,    100.0, 101.0),                  # 0  spike
    strong_bull(300,  101.0, 102.0),                  # 1  spike
    strong_bull(600,  102.0, 103.0),                  # 2  spike end
    Bar5m(900,  102.9, 102.9, 102.0, 102.2),          # 3  pause (pullback)
    Bar5m(1200, 102.2, 103.5, 102.1, 103.4),          # 4  H1 (higher high)
    Bar5m(1500, 103.4, 103.3, 102.5, 102.6),          # 5  lower high (leg 2)
    Bar5m(1800, 102.6, 104.5, 102.5, 104.4),          # 6  H2 (higher high)
    Bar5m(2100, 104.4, 105.0, 104.2, 104.9),          # 7
]


def test_detects_one_h2():
    sigs = detect_h2(BULL)
    assert_eq(len(sigs), 1, "one H2 signal")
    s = sigs[0]
    assert_eq(s.direction, "long", "long (High 2)")
    assert_eq(s.entry_index, 6, "entry at the H2 bar (index 6)")
    assert_eq(s.signal_bar_index, 5, "signal bar is the lower-high bar")
    # entry = 1 tick above the signal bar high (103.3)
    assert_eq(s.entry_trigger, 103.31, "entry 1 tick above signal bar high")
    # correction = bars 3,4,5; lowest low 102.0
    assert_eq(s.stop_pullback, 101.99, "tight stop 1 tick below correction low")
    assert_eq(s.stop_spike, 99.99, "spike stop 1 tick below spike low")
    assert_eq(s.spike_height, 3.0, "spike height")
    assert_eq(s.target_measured_move, 106.0, "measured move = spike high + height")
    assert_eq(s.pullback_bar_count, 3, "three-bar two-legged correction")


def test_no_h2_when_only_one_leg():
    """A spike + a single-leg pullback + H1 that just runs (no second
    leg) yields no H2."""
    bars = BULL[:3] + [
        Bar5m(900,  102.9, 102.9, 102.0, 102.2),      # pause
        Bar5m(1200, 102.2, 103.5, 102.1, 103.4),      # H1
        Bar5m(1500, 103.4, 104.5, 103.3, 104.4),      # just runs up
        Bar5m(1800, 104.4, 105.5, 104.3, 105.4),      # still running
    ]
    assert_eq(len(detect_h2(bars)), 0, "one-leg pullback -> no H2")


def test_bear_l2():
    def strong_bear(t, hi, bot):
        return Bar5m(t=t, o=hi, h=hi, l=bot, c=bot)
    bars = [
        strong_bear(0,    100.0, 99.0),               # spike
        strong_bear(300,  99.0,  98.0),               # spike
        strong_bear(600,  98.0,  97.0),               # spike end
        Bar5m(900,  97.1, 98.0, 97.1, 97.8),          # pause (rally)
        Bar5m(1200, 97.8, 97.9, 96.5, 96.6),          # L1 (lower low)
        Bar5m(1500, 96.6, 97.5, 96.7, 97.4),          # higher low (leg 2)
        Bar5m(1800, 97.4, 97.5, 95.5, 95.6),          # L2 (lower low)
    ]
    sigs = detect_h2(bars)
    assert_eq(len(sigs), 1, "one L2 signal")
    assert_eq(sigs[0].direction, "short", "short (Low 2)")
    assert_eq(sigs[0].entry_index, 6, "entry at the L2 bar")


def test_no_hindsight_invariant():
    """A signal at bar i must be identical whether the detector sees
    the whole session or only bars-so-far through bar i."""
    full = detect_h2(BULL)
    assert_eq(len(full), 1, "full session: one signal")
    e = full[0].entry_index
    sliced = detect_h2(BULL[: e + 1])
    assert_eq(sliced, full, "bars-so-far == full session at the H2 bar")


if __name__ == "__main__":
    test_detects_one_h2()
    test_no_h2_when_only_one_leg()
    test_bear_l2()
    test_no_hindsight_invariant()
    print("\nall h2_detector tests passed")
