"""Tests for first_pullback_detector.

Run: python3 scripts/first_pullback_detector_test.py
"""

from __future__ import annotations

import sys

from tfo_detector import Bar5m
from first_pullback_detector import detect_first_pullbacks


def assert_eq(actual, expected, label: str):
    if actual != expected:
        print(f"FAIL {label}: expected {expected!r}, got {actual!r}")
        sys.exit(1)
    print(f"PASS {label}")


def strong_bull(t, lo, top):
    """A strong bull bar: opens at lo, closes at top, tiny tails."""
    return Bar5m(t=t, o=lo, h=top, l=lo, c=top)


def strong_bear(t, hi, bot):
    """A strong bear bar: opens at hi, closes at bot, tiny tails."""
    return Bar5m(t=t, o=hi, h=hi, l=bot, c=bot)


# A clean 3-bar bull spike: highs 101, 102, 103; low of the spike 100.
BULL_SPIKE = [
    strong_bull(0, 100.0, 101.0),
    strong_bull(300, 101.0, 102.0),
    strong_bull(600, 102.0, 103.0),
]


def test_first_pullback_long():
    """3-bar bull spike, a 2-bar pullback, then a High 1 -> one long."""
    bars = BULL_SPIKE + [
        # pullback bar 1 — bear body, high 102.9 (< 103) so no higher high
        Bar5m(t=900, o=102.9, h=102.9, l=102.0, c=102.2),
        # pullback bar 2 — bear body, high 102.6, low 101.8 (the pullback
        # extreme), still no higher high
        Bar5m(t=1200, o=102.3, h=102.6, l=101.8, c=102.0),
        # High 1 — high 104.0 breaks above the signal bar's 102.6 high
        Bar5m(t=1500, o=102.0, h=104.0, l=102.0, c=103.8),
    ]
    sigs = detect_first_pullbacks(bars)
    assert_eq(len(sigs), 1, "one first-pullback signal")
    s = sigs[0]
    assert_eq(s.direction, "long", "long direction")
    assert_eq(s.entry_index, 5, "entry at the High 1 bar")
    assert_eq(s.signal_bar_index, 4, "signal bar is the last pullback bar")
    # entry = 1 tick above the signal bar high (102.6)
    assert_eq(s.entry_trigger, 102.61, "entry 1 tick above signal bar high")
    # tight stop = 1 tick below the pullback extreme (low 101.8)
    assert_eq(s.stop_pullback, 101.79, "tight stop 1 tick below pullback extreme")
    # wide stop = 1 tick below the spike's start low (100.0)
    assert_eq(s.stop_spike, 99.99, "spike stop 1 tick below the spike low")
    # spike height (103 - 100 = 3); the two Brooks targets off it
    assert_eq(s.spike_height, 3.0, "spike height")
    assert_eq(s.target_new_high, 103.01, "new-high target 1 tick above spike high")
    assert_eq(s.target_measured_move, 106.0, "measured-move target = spike high + height")
    assert_eq(s.pullback_bar_count, 2, "two-bar pullback")
    assert_eq(s.signal_bar_with_body, False, "signal bar had a bear body")
    assert_eq(s.is_opening, True, "originating spike was an opening spike")


def test_no_pullback_when_spike_continues():
    """If the bar after the spike makes a higher high, there is no
    pullback and therefore no first-pullback trade."""
    bars = BULL_SPIKE + [
        # weak bull bar (not strong, so the spike run still ends at 3),
        # but its high 104.0 immediately exceeds the spike high
        Bar5m(t=900, o=103.0, h=104.0, l=102.5, c=103.2),
    ]
    assert_eq(len(detect_first_pullbacks(bars)), 0, "no pullback -> no trade")


def test_pullback_too_long_is_a_range():
    """A correction longer than five bars is a trading range, not a
    breakout pullback -> no trade."""
    pullback = [
        Bar5m(t=900 + 300 * i, o=102.3, h=102.9 - 0.1 * i, l=101.5, c=101.7)
        for i in range(6)   # six bars, none making a higher high
    ]
    bars = BULL_SPIKE + pullback
    assert_eq(len(detect_first_pullbacks(bars)), 0, "6-bar pullback -> no trade")


def test_failed_breakout_pullback_below_spike():
    """If the pullback retraces below the spike's origin, the breakout
    has failed -> no trade."""
    bars = BULL_SPIKE + [
        # pullback bar — low 99.5 digs below the spike low (100.0)
        Bar5m(t=900, o=102.5, h=102.8, l=99.5, c=100.0),
        # High 1 — would otherwise trigger, but the breakout has failed
        Bar5m(t=1200, o=100.0, h=103.0, l=99.8, c=102.9),
    ]
    assert_eq(len(detect_first_pullbacks(bars)), 0, "failed breakout -> no trade")


def test_first_pullback_short():
    """3-bar bear spike, a 2-bar pullback up, then a Low 1 -> one short."""
    bars = [
        strong_bear(0, 100.0, 99.0),
        strong_bear(300, 99.0, 98.0),
        strong_bear(600, 98.0, 97.0),
        # pullback bar 1 up — bull body, low 97.0 (no lower low)
        Bar5m(t=900, o=97.0, h=97.8, l=97.0, c=97.6),
        # pullback bar 2 up — high 98.0 is the pullback extreme
        Bar5m(t=1200, o=97.6, h=98.0, l=97.2, c=97.4),
        # Low 1 — low 95.5 breaks below the signal bar's 97.2 low
        Bar5m(t=1500, o=97.4, h=97.4, l=95.5, c=95.7),
    ]
    sigs = detect_first_pullbacks(bars)
    assert_eq(len(sigs), 1, "one short first-pullback signal")
    s = sigs[0]
    assert_eq(s.direction, "short", "short direction")
    assert_eq(s.entry_index, 5, "entry at the Low 1 bar")
    # entry = 1 tick below the signal bar low (97.2)
    assert_eq(s.entry_trigger, 97.19, "entry 1 tick below signal bar low")
    # tight stop = 1 tick above the pullback extreme (high 98.0)
    assert_eq(s.stop_pullback, 98.01, "tight stop 1 tick above pullback extreme")
    # wide stop = 1 tick above the spike's start high (100.0)
    assert_eq(s.stop_spike, 100.01, "spike stop 1 tick above the spike high")
    assert_eq(s.spike_height, 3.0, "bear spike height")
    assert_eq(s.target_new_high, 96.99, "new-low target 1 tick below spike low")
    assert_eq(s.target_measured_move, 94.0, "measured-move target = spike low - height")
    assert_eq(s.pullback_bar_count, 2, "two-bar pullback")
    assert_eq(s.signal_bar_with_body, True, "signal bar had a bear body")


def test_signal_bar_body_recorded():
    """The signal-bar-body flag is True when the last pullback bar
    closes in the trade's direction (Brooks: 'more reliable when it has
    a bull body')."""
    bars = BULL_SPIKE + [
        Bar5m(t=900, o=102.9, h=102.9, l=102.0, c=102.2),
        # signal bar with a BULL body (close 102.4 > open 101.8)
        Bar5m(t=1200, o=101.8, h=102.6, l=101.8, c=102.4),
        Bar5m(t=1500, o=102.0, h=104.0, l=102.0, c=103.8),
    ]
    sigs = detect_first_pullbacks(bars)
    assert_eq(len(sigs), 1, "one signal")
    assert_eq(sigs[0].signal_bar_with_body, True, "bull-body signal bar recorded")


if __name__ == "__main__":
    test_first_pullback_long()
    test_no_pullback_when_spike_continues()
    test_pullback_too_long_is_a_range()
    test_failed_breakout_pullback_below_spike()
    test_first_pullback_short()
    test_signal_bar_body_recorded()
    print("\nall first_pullback_detector tests passed")
