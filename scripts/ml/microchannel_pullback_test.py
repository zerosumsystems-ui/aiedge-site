"""Tests for microchannel_pullback.

Run: python3 scripts/ml/microchannel_pullback_test.py
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "live"))
from pullback_detector import Bar  # noqa: E402
from microchannel_pullback import detect_microchannel_pullback  # noqa: E402


def assert_eq(actual, expected, label: str):
    if actual != expected:
        print(f"FAIL {label}: expected {expected!r}, got {actual!r}")
        sys.exit(1)
    print(f"PASS {label}")


def assert_true(cond, label: str):
    assert_eq(bool(cond), True, label)


def bar(t, o, h, l, c):
    return Bar(t=t, o=o, h=h, l=l, c=c)


def bull_spike():
    """Three rising bars — a clean bull microchannel leg."""
    return [
        bar(0, 100.0, 101.0, 100.0, 101.0),    # 0 spike bar 1 (start)
        bar(300, 101.0, 102.0, 101.0, 102.0),  # 1 spike bar 2 (higher high)
        bar(600, 102.0, 103.0, 102.0, 103.0),  # 2 spike bar 3 (higher high)
    ]


def test_clean_bull_first_pullback():
    """3-bar spike, one pullback bar, then an H1 breakout fills."""
    bars = bull_spike() + [
        bar(900, 102.7, 102.8, 102.3, 102.5),   # 3 pullback (no higher high)
        bar(1200, 102.7, 103.6, 102.6, 103.4),  # 4 H1 — trades above bar 3
    ]
    mc = detect_microchannel_pullback(bars, 0, 3, "long")
    assert_true(mc is not None, "bull microchannel pullback detected")
    assert mc is not None
    assert_eq(mc.lead_end_index, 2, "lead ends at last spike bar")
    assert_eq(mc.pullback_start_index, 3, "pullback starts at bar 3")
    assert_eq(mc.signal_index, 3, "signal bar is the single pullback bar")
    assert_eq(mc.fire_index, 4, "breakout fills on bar 4")
    # entry = pullback-bar high (102.8) + 1 tick
    assert_eq(mc.entry_price, 102.81, "entry one tick above signal-bar high")
    # pullback extreme = pullback-bar low
    assert_eq(mc.pullback_extreme, 102.3, "pullback extreme = pullback low")
    # micro leg = lead high (103.0) - spike-start low (100.0)
    assert_eq(mc.micro_leg_height, 3.0, "microchannel leg height")


def test_lead_extends_past_the_spike():
    """A 4th rising bar extends the microchannel; the pullback shifts."""
    bars = bull_spike() + [
        bar(900, 103.0, 104.0, 103.0, 104.0),   # 3 still extending
        bar(1200, 103.9, 103.95, 103.5, 103.7),  # 4 pullback
        bar(1500, 103.8, 104.5, 103.7, 104.4),  # 5 H1 breakout
    ]
    mc = detect_microchannel_pullback(bars, 0, 3, "long")
    assert mc is not None
    assert_eq(mc.lead_end_index, 3, "lead extends to bar 3")
    assert_eq(mc.pullback_start_index, 4, "pullback starts at bar 4")
    assert_eq(mc.fire_index, 5, "breakout fills on bar 5")


def test_trailing_stop_two_bar_pullback():
    """A two-bar pullback — the stop trails to the second bar's high."""
    bars = bull_spike() + [
        bar(900, 102.7, 102.8, 102.4, 102.5),   # 3 pullback bar 1
        bar(1200, 102.5, 102.6, 102.0, 102.1),  # 4 pullback bar 2 (deeper)
        bar(1500, 102.3, 103.0, 102.2, 102.9),  # 5 H1 — trades above bar 4
    ]
    mc = detect_microchannel_pullback(bars, 0, 3, "long")
    assert mc is not None
    assert_eq(mc.pullback_bar_indices, (3, 4), "two pullback bars counted")
    assert_eq(mc.signal_index, 4, "signal is the second pullback bar")
    assert_eq(mc.fire_index, 5, "fills on bar 5")
    # entry trailed down to bar 4's high (102.6) + tick
    assert_eq(mc.entry_price, 102.61, "stop trailed to the deeper bar")
    assert_eq(mc.pullback_extreme, 102.0, "pullback extreme = deepest low")


def test_no_pullback_returns_none():
    """The trend extends to the end of the data — no pullback."""
    bars = bull_spike() + [
        bar(900, 103.0, 104.0, 103.0, 104.0),
        bar(1200, 104.0, 105.0, 104.0, 105.0),
    ]
    assert_eq(detect_microchannel_pullback(bars, 0, 3, "long"), None,
              "no pullback -> no signal")


def test_pullback_too_long_returns_none():
    """A drift longer than MAX_PULLBACK_BARS is not an H1 entry."""
    bars = bull_spike() + [
        bar(900, 102.7, 102.8, 102.3, 102.5),
        bar(1200, 102.4, 102.5, 102.1, 102.2),
        bar(1500, 102.2, 102.3, 101.9, 102.0),
        bar(1800, 102.0, 102.1, 101.7, 101.8),
        bar(2100, 101.8, 101.9, 101.5, 101.6),
        bar(2400, 101.6, 101.7, 101.3, 101.4),
    ]
    assert_eq(detect_microchannel_pullback(bars, 0, 3, "long"), None,
              "pullback longer than MAX_PULLBACK_BARS -> no signal")


def test_pullback_erasing_the_microchannel_returns_none():
    """A pullback that falls below the spike origin kills the trade."""
    bars = bull_spike() + [
        bar(900, 102.5, 102.8, 99.0, 99.5),     # 3 pullback below bar-0 low
        bar(1200, 99.6, 103.0, 99.5, 102.9),    # 4 would-be breakout
    ]
    assert_eq(detect_microchannel_pullback(bars, 0, 3, "long"), None,
              "pullback through the spike origin -> no signal")


def test_bear_first_pullback():
    """Mirror case: a falling spike, one pullback up, then an L1 break."""
    bars = [
        bar(0, 100.0, 100.0, 99.0, 99.0),       # 0 spike bar 1 (start)
        bar(300, 99.0, 99.0, 98.0, 98.0),       # 1 lower low
        bar(600, 98.0, 98.0, 97.0, 97.0),       # 2 lower low
        bar(900, 97.3, 97.7, 97.2, 97.5),       # 3 pullback (no lower low)
        bar(1200, 97.4, 97.5, 96.4, 96.6),      # 4 L1 — trades below bar 3
    ]
    mc = detect_microchannel_pullback(bars, 0, 3, "short")
    assert mc is not None
    assert_eq(mc.direction, "short", "short direction")
    assert_eq(mc.fire_index, 4, "L1 fills on bar 4")
    # entry = pullback-bar low (97.2) - 1 tick
    assert_eq(mc.entry_price, 97.19, "entry one tick below signal-bar low")
    assert_eq(mc.pullback_extreme, 97.7, "pullback extreme = pullback high")
    # micro leg = spike-start high (100.0) - lead low (97.0)
    assert_eq(mc.micro_leg_height, 3.0, "bear microchannel leg height")


if __name__ == "__main__":
    test_clean_bull_first_pullback()
    test_lead_extends_past_the_spike()
    test_trailing_stop_two_bar_pullback()
    test_no_pullback_returns_none()
    test_pullback_too_long_returns_none()
    test_pullback_erasing_the_microchannel_returns_none()
    test_bear_first_pullback()
    print("\nall microchannel_pullback tests passed")
