"""Tests for spike_detector. Run: python3 scripts/spike_detector_test.py"""

from __future__ import annotations

import sys

from tfo_detector import Bar5m
from spike_detector import detect_spikes, _is_strong_bull, _little_overlap


def assert_eq(actual, expected, label: str):
    if actual != expected:
        print(f"FAIL {label}: expected {expected!r}, got {actual!r}")
        sys.exit(1)
    print(f"PASS {label}")


def assert_true(cond, label: str):
    assert_eq(bool(cond), True, label)


def strong_bull(t, lo, top):
    """A strong bull bar: opens at lo, closes at top, tiny tails."""
    return Bar5m(t=t, o=lo, h=top, l=lo, c=top)


def test_strong_bar_classifier():
    assert_true(_is_strong_bull(Bar5m(0, 100.0, 101.0, 100.0, 101.0)), "full-body bull is strong")
    assert_eq(_is_strong_bull(Bar5m(0, 100.0, 101.0, 100.0, 100.3)), False, "small body not strong")


def test_clean_three_bar_bull_spike():
    """Three consecutive strong bull bars, no overlap -> one signal."""
    bars = [
        strong_bull(1000, 100.0, 101.0),   # spike bar 1
        strong_bull(1300, 101.0, 102.0),   # spike bar 2
        strong_bull(1600, 102.0, 103.0),   # spike bar 3 = entry
        Bar5m(t=1900, o=103.0, h=103.1, l=102.8, c=102.9),  # pause
    ]
    sigs = detect_spikes(bars)
    assert_eq(len(sigs), 1, "one spike signal")
    s = sigs[0]
    assert_eq(s.direction, "long", "long direction")
    assert_eq(s.entry_index, 2, "entry at 3rd bar")
    assert_eq(s.entry_price, 103.0, "entry = close of 3rd bar")
    # spike low = bar1.low = 100.0; stop = 100.0 - 0.01
    assert_eq(s.stop_price, 99.99, "stop 1 tick below spike low")
    # spike height = close(3rd) - open(1st) = 103.0 - 100.0 = 3.0
    assert_eq(s.spike_height, 3.0, "measured move = spike height")
    # target = entry + height = 103.0 + 3.0
    assert_eq(s.target_price, 106.0, "target = entry + measured move")
    assert_eq(s.is_opening, True, "spike at bar 0 is an opening spike")


def test_overlap_breaks_the_spike():
    """A deep pullback into the prior bar breaks the run -> no spike."""
    bars = [
        strong_bull(1000, 100.0, 101.0),
        strong_bull(1300, 101.0, 102.0),
        # 3rd bar is strong but its low (100.5) digs deep below bar 2's
        # close (102.0) — far more than 25% of bar 2's range -> overlap.
        Bar5m(t=1600, o=100.6, h=102.9, l=100.5, c=102.85),
    ]
    sigs = detect_spikes(bars)
    assert_eq(len(sigs), 0, "deep overlap breaks the spike run")


def test_two_strong_bars_not_enough():
    bars = [
        strong_bull(1000, 100.0, 101.0),
        strong_bull(1300, 101.0, 102.0),
        Bar5m(t=1600, o=102.0, h=102.1, l=101.5, c=101.6),  # weak
    ]
    assert_eq(len(detect_spikes(bars)), 0, "two strong bars is not a spike")


def test_bear_spike():
    def strong_bear(t, hi, bot):
        return Bar5m(t=t, o=hi, h=hi, l=bot, c=bot)
    bars = [
        strong_bear(1000, 100.0, 99.0),
        strong_bear(1300, 99.0, 98.0),
        strong_bear(1600, 98.0, 97.0),
        Bar5m(t=1900, o=97.0, h=97.2, l=96.9, c=97.1),
    ]
    sigs = detect_spikes(bars)
    assert_eq(len(sigs), 1, "one bear spike")
    s = sigs[0]
    assert_eq(s.direction, "short", "short direction")
    assert_eq(s.entry_price, 97.0, "entry = close of 3rd bear bar")
    assert_eq(s.stop_price, 100.01, "stop 1 tick above spike high")
    assert_eq(s.spike_height, 3.0, "bear spike height")
    assert_eq(s.target_price, 94.0, "bear target = entry - measured move")


def test_intraday_spike_flagged_not_opening():
    """A spike starting after the opening window is not is_opening."""
    pad = [Bar5m(t=100 * i, o=50.0, h=50.2, l=49.8, c=50.0) for i in range(8)]
    spike = [
        strong_bull(2000, 100.0, 101.0),
        strong_bull(2300, 101.0, 102.0),
        strong_bull(2600, 102.0, 103.0),
    ]
    sigs = detect_spikes(pad + spike)
    assert_eq(len(sigs), 1, "spike found after padding")
    assert_eq(sigs[0].is_opening, False, "spike starting at bar 8 is not opening")


if __name__ == "__main__":
    test_strong_bar_classifier()
    test_clean_three_bar_bull_spike()
    test_overlap_breaks_the_spike()
    test_two_strong_bars_not_enough()
    test_bear_spike()
    test_intraday_spike_flagged_not_opening()
    print("\nall spike_detector tests passed")
