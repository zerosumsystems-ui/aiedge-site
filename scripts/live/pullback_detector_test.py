"""Tests for pullback_detector. Run: python3 scripts/live/pullback_detector_test.py

These tests are the proof that the detector selects ONLY small
pullbacks: it fires on a brief shallow pullback in a strong trend, and
stays silent on deep pullbacks, long pullbacks, trendless chop, and
weak impulses.
"""

from __future__ import annotations

import sys

from pullback_detector import (
    Bar,
    PullbackConfig,
    detect_pullbacks,
)


def assert_eq(actual, expected, label: str):
    if actual != expected:
        print(f"FAIL {label}: expected {expected!r}, got {actual!r}")
        sys.exit(1)
    print(f"PASS {label}")


def assert_true(cond, label: str):
    assert_eq(bool(cond), True, label)


def flat_baseline(n: int = 20, price: float = 100.0) -> list[Bar]:
    """`n` quiet bars — settles the EMA and ATR, fires on none of them."""
    return [
        Bar(t=i * 60, o=price, h=price + 0.2, l=price - 0.2, c=price)
        for i in range(n)
    ]


def _t(bars: list[Bar]) -> int:
    return len(bars) * 60


def add(bars: list[Bar], o, h, l, c) -> None:
    bars.append(Bar(t=_t(bars), o=o, h=h, l=l, c=c))


def long_small_pullback() -> list[Bar]:
    """Strong 4-bar up impulse, shallow 2-bar pullback, breakout-stop fire."""
    bars = flat_baseline()
    add(bars, 100.0, 101.5, 100.0, 101.4)   # 20: impulse
    add(bars, 101.4, 103.0, 101.3, 102.9)   # 21
    add(bars, 102.9, 104.5, 102.8, 104.4)   # 22
    add(bars, 104.4, 106.0, 104.3, 105.9)   # 23: impulse top
    add(bars, 105.9, 105.8, 104.8, 104.9)   # 24: pullback bar 1
    add(bars, 104.9, 105.0, 104.3, 104.5)   # 25: pullback bar 2
    add(bars, 104.5, 105.5, 104.4, 105.4)   # 26: FIRE — breaks bar 25 high
    return bars


def test_long_small_pullback_fires():
    sigs = detect_pullbacks(long_small_pullback(), timeframe="5m")
    assert_eq(len(sigs), 1, "exactly one small-pullback signal")
    s = sigs[0]
    assert_eq(s.direction, "long", "direction is long")
    assert_eq(s.fire_index, 26, "fire is the breakout-stop bar")
    assert_eq(s.pullback_len, 2, "pullback is 2 bars")
    assert_eq(s.entry_price, 105.0, "entry = prior bar high")
    assert_true(s.retrace < 0.5, "pullback retraced less than half the impulse")
    assert_eq(s.timeframe, "5m", "timeframe label carried through")
    assert_eq(len(s.pullback_bar_timestamps), 2, "two pullback bars timestamped")


def test_short_small_pullback_fires():
    """Mirror: strong down impulse, shallow up pullback, breakout below."""
    bars = flat_baseline()
    add(bars, 100.0, 100.0, 98.5, 98.6)     # 20: impulse down
    add(bars, 98.6, 98.7, 97.0, 97.1)       # 21
    add(bars, 97.1, 97.2, 95.5, 95.6)       # 22
    add(bars, 95.6, 95.7, 94.0, 94.1)       # 23: impulse bottom
    add(bars, 94.1, 95.2, 94.1, 95.1)       # 24: pullback bar 1
    add(bars, 95.1, 95.7, 94.9, 95.0)       # 25: pullback bar 2
    add(bars, 95.0, 95.1, 94.5, 94.6)       # 26: FIRE — breaks bar 25 low
    sigs = detect_pullbacks(bars)
    assert_eq(len(sigs), 1, "exactly one short signal")
    assert_eq(sigs[0].direction, "short", "direction is short")
    assert_eq(sigs[0].pullback_len, 2, "pullback is 2 bars")
    assert_eq(sigs[0].entry_price, 94.9, "entry = prior bar low")


def test_deep_pullback_rejected():
    """Same impulse, but the pullback retraces > 50% — not 'small'."""
    bars = flat_baseline()
    add(bars, 100.0, 101.5, 100.0, 101.4)
    add(bars, 101.4, 103.0, 101.3, 102.9)
    add(bars, 102.9, 104.5, 102.8, 104.4)
    add(bars, 104.4, 106.0, 104.3, 105.9)
    add(bars, 105.9, 105.8, 103.0, 103.2)   # deep pullback bar 1
    add(bars, 103.2, 103.5, 102.0, 102.3)   # deep pullback bar 2
    add(bars, 102.3, 103.6, 102.2, 103.5)   # would-be fire
    assert_eq(detect_pullbacks(bars), [], "deep pullback selects nothing")


def test_long_pullback_rejected():
    """Pullback drifts 5 bars — too many to be 'small'."""
    bars = flat_baseline()
    add(bars, 100.0, 101.5, 100.0, 101.4)
    add(bars, 101.4, 103.0, 101.3, 102.9)
    add(bars, 102.9, 104.5, 102.8, 104.4)
    add(bars, 104.4, 106.0, 104.3, 105.9)
    add(bars, 105.9, 105.8, 104.8, 104.9)   # pullback 1
    add(bars, 104.9, 105.0, 104.5, 104.7)   # pullback 2
    add(bars, 104.7, 104.9, 104.3, 104.5)   # pullback 3
    add(bars, 104.5, 104.8, 104.2, 104.4)   # pullback 4
    add(bars, 104.4, 104.7, 104.1, 104.3)   # pullback 5
    add(bars, 104.3, 105.0, 104.2, 104.9)   # would-be fire
    assert_eq(detect_pullbacks(bars), [], "5-bar pullback selects nothing")


def test_weak_impulse_rejected():
    """A 1-bar nudge up is not a strong trend — no pullback to find."""
    bars = flat_baseline()
    add(bars, 100.0, 101.0, 100.0, 100.9)   # lone up bar
    add(bars, 100.9, 100.8, 100.4, 100.5)   # pullback
    add(bars, 100.5, 101.1, 100.4, 101.0)   # would-be fire
    assert_eq(detect_pullbacks(bars), [], "weak impulse selects nothing")


def test_trendless_chop_rejected():
    """Pure chop — the detector must stay completely silent."""
    bars = flat_baseline(n=40)
    assert_eq(detect_pullbacks(bars), [], "flat chop selects nothing")


def test_timeframe_agnostic():
    """Identical bars, different timeframe labels -> identical detection.
    Only the carried-through label changes; the pattern math does not.
    """
    bars = long_small_pullback()
    one_min = detect_pullbacks(bars, timeframe="1m")
    daily = detect_pullbacks(bars, timeframe="1D")
    assert_eq(len(one_min), len(daily), "same signal count on any timeframe")
    assert_eq(one_min[0].fire_index, daily[0].fire_index, "same fire bar")
    assert_eq((one_min[0].timeframe, daily[0].timeframe), ("1m", "1D"),
              "only the timeframe label differs")


def test_shallower_pullback_scores_higher():
    shallow = detect_pullbacks(long_small_pullback())[0]
    deep_bars = flat_baseline()
    add(deep_bars, 100.0, 101.5, 100.0, 101.4)
    add(deep_bars, 101.4, 103.0, 101.3, 102.9)
    add(deep_bars, 102.9, 104.5, 102.8, 104.4)
    add(deep_bars, 104.4, 106.0, 104.3, 105.9)
    add(deep_bars, 105.9, 105.8, 103.6, 103.8)   # pullback near the 50% line
    add(deep_bars, 103.8, 104.2, 103.5, 104.0)
    add(deep_bars, 104.0, 105.0, 103.9, 104.9)   # fire
    deeper = detect_pullbacks(deep_bars)[0]
    assert_true(shallow.score > deeper.score, "shallower pullback scores higher")


def test_empty_bars_no_crash():
    assert_eq(detect_pullbacks([]), [], "empty bars: no signals, no crash")
    assert_eq(detect_pullbacks(flat_baseline(n=5)), [], "too few bars: no crash")


if __name__ == "__main__":
    test_long_small_pullback_fires()
    test_short_small_pullback_fires()
    test_deep_pullback_rejected()
    test_long_pullback_rejected()
    test_weak_impulse_rejected()
    test_trendless_chop_rejected()
    test_timeframe_agnostic()
    test_shallower_pullback_scores_higher()
    test_empty_bars_no_crash()
    print("\nall pullback_detector tests passed")
