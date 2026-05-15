"""Tests for tfo_context_features.

Run: python3 scripts/tfo_context_features_test.py
"""

from __future__ import annotations

import sys

from tfo_detector import Bar5m
from tfo_context_features import FEATURE_KEYS, extract_tfo_context


def assert_eq(actual, expected, label: str):
    if actual != expected:
        print(f"FAIL {label}: expected {expected!r}, got {actual!r}")
        sys.exit(1)
    print(f"PASS {label}")


def assert_true(cond, label: str):
    assert_eq(bool(cond), True, label)


# A bull trend-from-open session: bar 0 sets the low, four strong bull
# bars off the open (a spike), one pullback bar, then more upside.
BULL = [
    Bar5m(0,    100.0, 101.0, 100.0, 101.0),   # 0  low of day, strong bull
    Bar5m(300,  101.0, 102.0, 100.8, 102.0),   # 1
    Bar5m(600,  102.0, 103.0, 101.8, 103.0),   # 2
    Bar5m(900,  103.0, 104.0, 102.8, 104.0),   # 3  -> 4-bar spike
    Bar5m(1200, 104.0, 104.2, 103.5, 103.7),   # 4  pullback bar (bear close)
    Bar5m(1500, 103.7, 105.0, 103.6, 105.0),   # 5
    Bar5m(1800, 105.0, 106.0, 104.8, 106.0),   # 6
    Bar5m(2100, 106.0, 106.4, 105.6, 105.9),   # 7  pullback bar
    Bar5m(2400, 105.9, 107.0, 105.8, 107.0),   # 8
    Bar5m(2700, 107.0, 108.0, 106.9, 108.0),   # 9
    Bar5m(3000, 108.0, 108.6, 107.6, 108.4),   # 10
    Bar5m(3300, 108.4, 109.0, 108.2, 109.0),   # 11 high of day
]


def test_returns_none_on_bad_index():
    assert_eq(extract_tfo_context(BULL, at_index=0), None, "at_index 0 -> None")
    assert_eq(extract_tfo_context(BULL, at_index=99), None, "at_index past end -> None")
    assert_eq(extract_tfo_context([], at_index=1), None, "empty bars -> None")


def test_feature_keys_match():
    f = extract_tfo_context(BULL, at_index=6, prior_close=99.5, adr=9.0)
    assert_eq(tuple(f.keys()), FEATURE_KEYS, "dict keys equal FEATURE_KEYS in order")


def test_bull_context_at_bar_6():
    f = extract_tfo_context(BULL, at_index=6, prior_close=99.5, adr=9.0)
    assert_eq(f["trend_dir"], 1, "upward bias — low came first")
    assert_eq(f["extreme_bar_index"], 0, "early extreme is bar 0")
    assert_eq(f["extreme_in_first_two"], 1.0, "extreme is in the first two bars")
    assert_eq(f["bars_since_open"], 6, "decision bar index")
    # bar 0 is a full-bodied bull bar with no tails
    assert_eq(f["first_bar_body_ratio"], 1.0, "first bar full body")
    assert_eq(f["first_bar_close_pos"], 1.0, "first bar closes on its high")
    assert_eq(f["first_bar_tail_frac"], 0.0, "first bar has no tails")
    # four consecutive strong bull bars off the open -> a spike
    assert_true(f["max_consecutive_trend_bars"] >= 4, "4+ consecutive trend bars")
    assert_eq(f["spike_present"], 1.0, "spike detected")
    # bars 1-3 are all strong bull bars -> no pause -> 'too far too fast'
    assert_eq(f["paused_by_bar_4"], 0.0, "no pause by bar 4")
    # largest pullback through bar 6: bar 4 dipped to 103.5 vs an
    # established high of 104.0 -> 0.5; bar 5 dipped to 103.6 vs 104.2
    # -> 0.6. 0.6 / ADR 9.0 = 0.0667
    assert_eq(f["largest_pullback_adr"], 0.0667, "largest pullback vs ADR")
    # gap: open 100.0 vs prior close 99.5 -> +0.5 / 99.5 * 100
    assert_eq(f["gap_pct"], 0.5025, "opening gap percent")


def test_no_hindsight_invariant():
    """THE load-bearing test: a feature computed at bar i must be
    identical whether the caller passes the whole session or only the
    bars up to and including bar i."""
    for i in range(1, len(BULL)):
        full = extract_tfo_context(BULL, at_index=i, prior_close=99.5, adr=9.0)
        sliced = extract_tfo_context(BULL[: i + 1], at_index=i,
                                     prior_close=99.5, adr=9.0)
        assert_eq(sliced, full, f"bar {i}: bars-so-far == full session")


def test_bear_mirror():
    # a bear trend-from-open: bar 0 sets the high, trends down
    bear = [
        Bar5m(0,    100.0, 100.0, 99.0,  99.0),    # 0 high of day
        Bar5m(300,  99.0,  99.2,  98.0,  98.0),    # 1
        Bar5m(600,  98.0,  98.2,  97.0,  97.0),    # 2
        Bar5m(900,  97.0,  97.2,  96.0,  96.0),    # 3 -> spike down
        Bar5m(1200, 96.0,  96.5,  95.8,  96.3),    # 4 pullback up
        Bar5m(1500, 96.3,  96.4,  95.0,  95.0),    # 5
        Bar5m(1800, 95.0,  95.1,  94.0,  94.0),    # 6
    ]
    f = extract_tfo_context(bear, at_index=6, prior_close=100.5, adr=6.0)
    assert_eq(f["trend_dir"], -1, "downward bias — high came first")
    assert_eq(f["extreme_bar_index"], 0, "early extreme is bar 0")
    assert_eq(f["spike_present"], 1.0, "bear spike detected")
    assert_true(f["net_from_open_adr"] < 0, "net move is negative (down)")


if __name__ == "__main__":
    test_returns_none_on_bad_index()
    test_feature_keys_match()
    test_bull_context_at_bar_6()
    test_no_hindsight_invariant()
    test_bear_mirror()
    print("\nall tfo_context_features tests passed")
