"""Tests for ema_touch_detector. Run: python3 scripts/ml/ema_touch_detector_test.py"""

from __future__ import annotations

import sys
from pathlib import Path

# tfo_detector lives in scripts/live/ — add it to the path.
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "live"))
from tfo_detector import Bar5m  # noqa: E402
from ema_touch_detector import detect_ema_touch, EmaTouchConfig  # noqa: E402


def assert_eq(actual, expected, label: str):
    if actual != expected:
        print(f"FAIL {label}: expected {expected!r}, got {actual!r}")
        sys.exit(1)
    print(f"PASS {label}")


def assert_true(cond, label: str):
    assert_eq(bool(cond), True, label)


def bar(t, o, h, l, c):
    return Bar5m(t=t, o=o, h=h, l=l, c=c, v=0.0)


# A clean uptrend: bars 0-4 close above a slowly rising EMA, then bar 5
# pulls back and its low reaches the EMA — the first touch.
TREND_UP = [
    bar(0,   101.0, 102.2, 100.8, 102.0),
    bar(300, 102.0, 102.7, 101.8, 102.5),
    bar(600, 102.5, 103.2, 102.3, 103.0),
    bar(900, 103.0, 103.7, 102.8, 103.5),
    bar(1200, 103.5, 104.2, 103.3, 104.0),
]
EMA_UP = [100.0, 100.2, 100.4, 100.6, 100.8]


def test_clean_long_touch():
    bars = TREND_UP + [bar(1500, 104.0, 104.1, 100.9, 101.5)]
    ema = EMA_UP + [101.0]
    sig = detect_ema_touch(bars, ema, EmaTouchConfig(ema_len=20))
    assert_true(sig is not None, "a touch is found")
    assert_eq(sig.direction, "long", "long direction")
    assert_eq(sig.touch_index, 5, "touch at the pullback bar")
    assert_eq(sig.entry_price, 101.5, "entry = close of the touch bar")
    assert_eq(sig.touch_extreme, 100.9, "touch extreme = touch bar low")
    assert_eq(sig.ema_len, 20, "ema_len carried through")
    # entry above the touch low means a long stop below entry -> positive risk
    assert_true(sig.entry_price > sig.touch_extreme, "entry above the touch low")


def test_reversal_close_is_not_a_touch():
    """A bar that closes decisively through the EMA is a breakdown, not
    a with-trend pullback — no signal."""
    bars = TREND_UP + [bar(1500, 104.0, 104.1, 99.0, 99.2)]
    ema = EMA_UP + [101.0]
    sig = detect_ema_touch(bars, ema, EmaTouchConfig(ema_len=20))
    assert_true(sig is None, "hard close through the EMA is rejected")


def test_no_trend_no_signal():
    """Fewer than trend_min_bars closing on the trend side -> no signal."""
    bars = [
        bar(0,   100.0, 100.5,  99.5, 99.8),    # closes below EMA
        bar(300, 100.0, 102.2, 100.8, 102.0),   # above
        bar(600, 102.0, 102.7, 101.8, 102.5),   # above
        bar(900, 102.5, 102.6, 100.9, 101.5),   # touch bar at i=3
    ]
    ema = [100.0, 100.2, 100.4, 101.0]
    sig = detect_ema_touch(bars, ema, EmaTouchConfig(ema_len=20))
    assert_true(sig is None, "only 2 trend bars before the touch -> no signal")


def test_small_trend_floor():
    """A trend that never extends trend_min_atr * ATR away from the EMA
    is too small to count."""
    bars = TREND_UP + [bar(1500, 104.0, 104.1, 100.9, 101.5)]
    ema = EMA_UP + [101.0]
    # An absurd trend_min_atr the 4.2-point leg cannot clear.
    sig = detect_ema_touch(bars, ema, EmaTouchConfig(ema_len=20, trend_min_atr=99.0))
    assert_true(sig is None, "extension below the ATR floor is rejected")


def test_short_touch():
    """Mirror: a downtrend, then a pullback whose high reaches the EMA."""
    bars = [
        bar(0,   99.0,  99.2,  97.8,  98.0),
        bar(300, 98.0,  98.2,  97.3,  97.5),
        bar(600, 97.5,  97.7,  96.8,  97.0),
        bar(900, 97.0,  97.2,  96.3,  96.5),
        bar(1200, 96.5, 96.7,  95.8,  96.0),
        bar(1500, 96.0, 99.1,  95.9,  98.5),   # pullback up to the EMA
    ]
    ema = [100.0, 99.8, 99.6, 99.4, 99.2, 99.0]
    sig = detect_ema_touch(bars, ema, EmaTouchConfig(ema_len=20))
    assert_true(sig is not None, "a short touch is found")
    assert_eq(sig.direction, "short", "short direction")
    assert_eq(sig.touch_index, 5, "touch at the pullback bar")
    assert_eq(sig.entry_price, 98.5, "entry = close of the touch bar")
    assert_eq(sig.touch_extreme, 99.1, "touch extreme = touch bar high")
    assert_true(sig.entry_price < sig.touch_extreme, "entry below the touch high")


def test_first_touch_only():
    """Two pullbacks in a session — only the first fires."""
    bars = TREND_UP + [
        bar(1500, 104.0, 104.1, 100.9, 101.5),  # first touch (i=5)
        bar(1800, 101.5, 103.0, 101.4, 102.8),  # trend resumes
        bar(2100, 102.8, 103.0, 101.6, 101.8),  # would touch again
    ]
    ema = EMA_UP + [101.0, 101.2, 101.5]
    sig = detect_ema_touch(bars, ema, EmaTouchConfig(ema_len=20))
    assert_true(sig is not None, "a touch is found")
    assert_eq(sig.touch_index, 5, "only the first touch fires")


if __name__ == "__main__":
    test_clean_long_touch()
    test_reversal_close_is_not_a_touch()
    test_no_trend_no_signal()
    test_small_trend_floor()
    test_short_touch()
    test_first_touch_only()
    print("\nall ema_touch_detector tests passed")
