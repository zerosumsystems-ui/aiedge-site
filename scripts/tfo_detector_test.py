"""Tests for tfo_detector. Run: python3 scripts/tfo_detector_test.py"""

from __future__ import annotations

import sys

from tfo_detector import (
    Bar5m,
    detect_tfo,
    _is_strong_bull,
    _is_strong_bear,
)


def make_bull(t: int, lo: float, body_top: float, hi: float | None = None) -> Bar5m:
    """Strong bull bar: opens at lo, closes at body_top, optional small upper tail."""
    high = hi if hi is not None else body_top
    return Bar5m(t=t, o=lo, h=high, l=lo, c=body_top)


def make_bear(t: int, hi: float, body_bot: float, lo: float | None = None) -> Bar5m:
    """Strong bear bar: opens at hi, closes at body_bot, optional small lower tail."""
    low = lo if lo is not None else body_bot
    return Bar5m(t=t, o=hi, h=hi, l=low, c=body_bot)


def make_weak_bull(t: int, lo: float, hi: float, o: float, c: float) -> Bar5m:
    return Bar5m(t=t, o=o, h=hi, l=lo, c=c)


def assert_eq(actual, expected, label: str):
    if actual != expected:
        print(f"FAIL {label}: expected {expected!r}, got {actual!r}")
        sys.exit(1)
    print(f"PASS {label}")


def assert_true(cond, label: str):
    assert_eq(bool(cond), True, label)


def test_strong_bar_classifier():
    # body = 1.0 = 100% of range, close in top 0% -> strong bull
    assert_true(_is_strong_bull(Bar5m(0, 100.0, 101.0, 100.0, 101.0)), "strong bull: full body")
    # body = 0.4 = 40% of range -> too weak
    assert_eq(_is_strong_bull(Bar5m(0, 100.0, 101.0, 100.0, 100.4)), False, "weak body fails")
    # body strong but close in lower half -> fails (top quartile)
    assert_eq(_is_strong_bull(Bar5m(0, 100.0, 101.0, 100.0, 100.7)), False, "close not in top 25%")
    # zero range (doji) -> false
    assert_eq(_is_strong_bull(Bar5m(0, 100.0, 100.0, 100.0, 100.0)), False, "doji -> not strong")
    # strong bear mirror
    assert_true(_is_strong_bear(Bar5m(0, 101.0, 101.0, 100.0, 100.0)), "strong bear: full body")
    assert_eq(_is_strong_bear(Bar5m(0, 100.5, 101.0, 100.0, 100.4)), False, "weak bear body fails")


def test_long_tfo_minimum_fire():
    """LOD at bar 0, then bars 1..3 are 3 strong bull closes -> fire."""
    bars = [
        Bar5m(t=1000, o=100.0, h=100.2, l=99.0, c=99.1),   # bar 0: LOD
        make_bull(1300, 99.1, 99.5),                         # bar 1: strong bull
        make_bull(1600, 99.5, 99.9),                         # bar 2: strong bull
        make_bull(1900, 99.9, 100.3),                        # bar 3: strong bull
        Bar5m(t=2200, o=100.3, h=100.4, l=100.2, c=100.3),   # bar 4
    ]
    signals = detect_tfo(bars)
    assert_eq(len(signals), 1, "long TFO fires once")
    s = signals[0]
    assert_eq(s.direction, "long", "long direction")
    assert_eq(s.pivot_index, 0, "pivot at bar 0")
    assert_eq(s.fired_bar_index, 3, "fires at 3rd confirming bar (index 3)")
    assert_eq(s.fire_ts, 1900, "fire_ts is bar-3 open")
    assert_eq(s.consecutive_count, 3, "exactly 3 consecutive")
    assert_eq(s.strong_count, 3, "all 3 are strong")
    assert_eq(
        s.strong_bar_timestamps,
        (1300, 1600, 1900),
        "strong_bar_timestamps lists all 3 strong bar opens in order",
    )


def test_short_tfo_minimum_fire():
    """HOD at bar 3, then bars 4..6 are strong bear closes."""
    bars = [
        Bar5m(t=1000, o=100.0, h=100.5, l=99.9, c=100.4),
        Bar5m(t=1300, o=100.4, h=100.8, l=100.3, c=100.7),
        Bar5m(t=1600, o=100.7, h=101.2, l=100.6, c=101.1),
        Bar5m(t=1900, o=101.1, h=101.5, l=101.0, c=101.05),   # bar 3: HOD
        make_bear(2200, 101.05, 100.6),                         # bar 4: strong bear
        make_bear(2500, 100.6, 100.2),                          # bar 5: strong bear
        make_bear(2800, 100.2, 99.7),                           # bar 6: strong bear
        Bar5m(t=3100, o=99.7, h=99.8, l=99.6, c=99.65),
    ]
    signals = detect_tfo(bars)
    assert_eq(len(signals), 1, "short TFO fires once")
    s = signals[0]
    assert_eq(s.direction, "short", "short direction")
    assert_eq(s.pivot_index, 3, "pivot at bar 3")
    assert_eq(s.fired_bar_index, 6, "fires at bar 6")
    assert_eq(s.fire_ts, 2800, "fire_ts is bar-6 open")
    assert_eq(
        s.strong_bar_timestamps,
        (2200, 2500, 2800),
        "short strong_bar_timestamps lists all 3 strong bar opens in order",
    )


def test_no_fire_when_lod_outside_first_4():
    """LOD at bar 5 -> no signal."""
    bars = [
        Bar5m(t=1000, o=100.0, h=100.1, l=99.9, c=100.0),
        Bar5m(t=1300, o=100.0, h=100.2, l=99.8, c=99.9),
        Bar5m(t=1600, o=99.9, h=100.0, l=99.7, c=99.8),
        Bar5m(t=1900, o=99.8, h=99.9, l=99.6, c=99.7),
        Bar5m(t=2200, o=99.7, h=99.8, l=99.5, c=99.6),    # bar 4
        Bar5m(t=2500, o=99.6, h=99.7, l=99.0, c=99.1),    # bar 5: LOD
        make_bull(2800, 99.1, 99.5),
        make_bull(3100, 99.5, 99.9),
        make_bull(3400, 99.9, 100.3),
    ]
    signals = detect_tfo(bars)
    assert_eq(len(signals), 0, "no signal when LOD is bar 5+")


def test_no_fire_when_only_one_strong():
    """LOD bar 0, then 3 bull closes but only 1 strong -> no signal."""
    bars = [
        Bar5m(t=1000, o=100.0, h=100.2, l=99.0, c=99.1),
        make_bull(1300, 99.1, 99.5),
        # weak bull: closes mid-range
        Bar5m(t=1600, o=99.5, h=99.9, l=99.45, c=99.55),
        # weak bull: closes mid-range
        Bar5m(t=1900, o=99.55, h=100.0, l=99.5, c=99.6),
    ]
    signals = detect_tfo(bars)
    assert_eq(len(signals), 0, "no signal when only 1 of 3 is strong")


def test_no_fire_when_run_breaks():
    """LOD bar 0, 2 bull closes then a bear close -> no signal (need 3)."""
    bars = [
        Bar5m(t=1000, o=100.0, h=100.2, l=99.0, c=99.1),
        make_bull(1300, 99.1, 99.5),
        make_bull(1600, 99.5, 99.9),
        # bear bar interrupts
        Bar5m(t=1900, o=99.9, h=99.95, l=99.6, c=99.7),
        make_bull(2200, 99.7, 100.0),
        make_bull(2500, 100.0, 100.3),
    ]
    signals = detect_tfo(bars)
    assert_eq(len(signals), 0, "no signal when bull run breaks at 2")


def test_no_fire_when_session_low_breaks_later():
    """LOD-so-far at bar 0 but a later bar undercuts it -> not the LOD."""
    bars = [
        Bar5m(t=1000, o=100.0, h=100.2, l=99.5, c=99.6),
        make_bull(1300, 99.6, 100.0),
        make_bull(1600, 100.0, 100.3),
        make_bull(1900, 100.3, 100.7),
        # later bar undercuts the supposed LOD
        Bar5m(t=2200, o=100.7, h=100.8, l=99.0, c=99.1),
    ]
    signals = detect_tfo(bars)
    assert_eq(len(signals), 0, "no signal when later bar undercuts LOD")


def test_long_score_scales_with_strength():
    """A 4-bar all-strong run scores higher than a 3-bar minimum."""
    short_run = [
        Bar5m(t=1000, o=100.0, h=100.2, l=99.0, c=99.1),
        make_bull(1300, 99.1, 99.5),
        make_bull(1600, 99.5, 99.9),
        make_bull(1900, 99.9, 100.3),
    ]
    long_run = short_run + [make_bull(2200, 100.3, 100.7)]
    s_short = detect_tfo(short_run)[0]
    s_long = detect_tfo(long_run)[0]
    assert_true(s_long.score > s_short.score, "longer run scores higher")


def test_zero_bars_no_crash():
    assert_eq(detect_tfo([]), [], "empty bars: no signals, no crash")


if __name__ == "__main__":
    test_strong_bar_classifier()
    test_long_tfo_minimum_fire()
    test_short_tfo_minimum_fire()
    test_no_fire_when_lod_outside_first_4()
    test_no_fire_when_only_one_strong()
    test_no_fire_when_run_breaks()
    test_no_fire_when_session_low_breaks_later()
    test_long_score_scales_with_strength()
    test_zero_bars_no_crash()
    print("\nall tfo_detector tests passed")
