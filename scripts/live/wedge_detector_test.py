"""Tests for wedge_detector. Run: python3 scripts/live/wedge_detector_test.py

Fixtures are built from explicit turning points by `build_series`, so
the three-push geometry is exact rather than eyeballed. The suite
checks the unbiased guarantees as much as the firing logic: pushes are
confirmed pivots (never hindsight), the reversal is a closed bar, and
a full-history sweep emits the same signal a live bar-by-bar scanner
would.
"""

from __future__ import annotations

import sys

from wedge_detector import (
    Bar,
    WedgeSignal,
    detect_wedges,
    _confirmed_pivot_highs,
    _is_bear_reversal,
)


def assert_eq(actual, expected, label: str):
    if actual != expected:
        print(f"FAIL {label}: expected {expected!r}, got {actual!r}")
        sys.exit(1)
    print(f"PASS {label}")


def assert_true(cond, label: str):
    assert_eq(bool(cond), True, label)


# ----- fixture builder ------------------------------------------------

def build_series(turns: list[tuple[int, float, str]], n: int) -> list[Bar]:
    """Build `n` bars tracing straight legs between turning points.

    Each turn is (index, price, 'hi'|'lo'). At a 'hi' turn the bar's
    HIGH touches the price; at a 'lo' turn the LOW touches it. Bars
    between turns are thin dojis interpolating monotonically, so the
    only swing pivots are the declared turns.
    """
    turns = sorted(turns)
    bars: list[Bar] = []
    for i in range(n):
        prev_t = turns[0]
        next_t = turns[-1]
        for (idx, price, kind) in turns:
            if idx <= i:
                prev_t = (idx, price, kind)
        for (idx, price, kind) in turns:
            if idx >= i:
                next_t = (idx, price, kind)
                break

        if prev_t[0] == i:
            _, price, kind = prev_t
            if kind == "hi":
                bars.append(Bar(i, price - 0.1, price, price - 0.2, price - 0.05))
            else:
                bars.append(Bar(i, price + 0.1, price + 0.2, price, price + 0.05))
            continue

        if next_t[0] == prev_t[0]:
            level = prev_t[1]
        else:
            frac = (i - prev_t[0]) / (next_t[0] - prev_t[0])
            level = prev_t[1] + (next_t[1] - prev_t[1]) * frac
        bars.append(Bar(i, level, level, level, level))
    return bars


def bear_reversal(i: int, prior_low: float) -> Bar:
    """A down bar closing well below `prior_low` — a Brooks sell bar."""
    return Bar(i, prior_low - 0.5, prior_low - 0.3, prior_low - 4.5,
               prior_low - 4.0)


def bull_reversal(i: int, prior_high: float) -> Bar:
    """An up bar closing well above `prior_high`."""
    return Bar(i, prior_high + 0.5, prior_high + 4.5, prior_high + 0.3,
               prior_high + 4.0)


# ---------------------------------------------------------------------

def test_pivot_confirmation_is_lagged():
    highs = [10, 11, 12, 13, 14, 20, 14, 13, 12, 11, 10]
    bars = [Bar(i, h, h, h - 1, h) for i, h in enumerate(highs)]
    assert_eq(_confirmed_pivot_highs(bars, upto=7, k=3), [], "peak not yet confirmed")
    assert_eq(_confirmed_pivot_highs(bars, upto=8, k=3), [5], "peak confirmed at +k")


def test_reversal_bar_classifier():
    bars = [Bar(0, 100, 101, 99, 100), Bar(1, 100, 100.5, 95, 96)]
    assert_true(_is_bear_reversal(bars, 1), "bear reversal: down bar below prior low")
    up = [Bar(0, 100, 101, 99, 100), Bar(1, 100, 106, 100, 105)]
    assert_eq(_is_bear_reversal(up, 1), False, "up bar is not a bear reversal")


# Wedge TOP: three pushes up (110, 116, 117), the third decelerating
# hard (push3=5 vs push2=11), then a bear reversal.
def _wedge_top(reversal: bool = True) -> list[Bar]:
    bars = build_series(
        [(2, 100, "lo"), (8, 110, "hi"), (14, 105, "lo"), (20, 116, "hi"),
         (26, 112, "lo"), (32, 117, "hi"), (44, 100, "lo")],
        n=48,
    )
    if reversal:
        bars[36] = bear_reversal(36, bars[35].l)
    return bars


def test_wedge_top_fires_short():
    sigs = detect_wedges(_wedge_top())
    assert_eq(len(sigs), 1, "wedge top: one signal")
    assert_eq(sigs[0].direction, "short", "wedge top -> short")
    assert_eq(sigs[0].wedge_type, "top", "classified top")
    assert_eq(sigs[0].fired_bar_index, 36, "fires on the reversal bar")
    assert_true(sigs[0].deceleration < 0.85, "third push decelerated")
    assert_true(abs(sigs[0].push_extreme - 117.0) < 1e-6, "stop ref = 3rd push")


def test_wedge_top_no_fire_without_reversal():
    assert_eq(len(detect_wedges(_wedge_top(reversal=False))), 0,
              "three pushes but no reversal -> no signal")


def test_no_fire_without_deceleration():
    """Third push as strong as the second -> not a Brooks wedge."""
    bars = build_series(
        [(2, 100, "lo"), (8, 110, "hi"), (14, 105, "lo"), (20, 116, "hi"),
         (26, 112, "lo"), (32, 123, "hi"), (44, 100, "lo")],
        n=48,
    )
    bars[36] = bear_reversal(36, bars[35].l)
    assert_eq(len(detect_wedges(bars)), 0, "no momentum loss -> no wedge")


def test_no_fire_with_only_two_pushes():
    bars = build_series(
        [(2, 100, "lo"), (8, 110, "hi"), (20, 116, "hi"), (44, 100, "lo")],
        n=48,
    )
    bars[36] = bear_reversal(36, bars[35].l)
    assert_eq(len(detect_wedges(bars)), 0, "two pushes is not a wedge")


def test_wedge_bottom_fires_long():
    """Three pushes down (110, 104, 103), decelerating, then a bull
    reversal."""
    bars = build_series(
        [(2, 120, "hi"), (8, 110, "lo"), (14, 115, "hi"), (20, 104, "lo"),
         (26, 108, "hi"), (32, 103, "lo"), (44, 120, "hi")],
        n=48,
    )
    bars[36] = bull_reversal(36, bars[35].h)
    sigs = detect_wedges(bars)
    assert_eq(len(sigs), 1, "wedge bottom: one signal")
    assert_eq(sigs[0].direction, "long", "wedge bottom -> long")
    assert_eq(sigs[0].wedge_type, "bottom", "classified bottom")


def test_backfill_equals_live_replay():
    """The core unbiased guarantee: the signal a full-history sweep
    emits for bar n is identical to what a scanner streaming bars one
    at a time would emit — detection at n reads only bars[:n + 1]."""
    bars = _wedge_top()
    full = detect_wedges(bars)
    assert_eq(len(full), 1, "full sweep: one signal")
    fire_idx = full[0].fired_bar_index

    replay: list[WedgeSignal] = []
    for end in range(1, len(bars) + 1):
        for s in detect_wedges(bars[:end]):
            if s.fired_bar_index == fire_idx and not any(
                r.fired_bar_index == fire_idx for r in replay
            ):
                replay.append(s)

    assert_eq(len(replay), 1, "live replay: signal appears exactly once")
    assert_eq(replay[0], full[0], "replay signal identical to sweep signal")


def test_empty_and_short_inputs_no_crash():
    assert_eq(detect_wedges([]), [], "empty bars: no signals")
    assert_eq(detect_wedges([Bar(0, 1, 2, 1, 1.5)]), [], "one bar: no signals")


if __name__ == "__main__":
    test_pivot_confirmation_is_lagged()
    test_reversal_bar_classifier()
    test_wedge_top_fires_short()
    test_wedge_top_no_fire_without_reversal()
    test_no_fire_without_deceleration()
    test_no_fire_with_only_two_pushes()
    test_wedge_bottom_fires_long()
    test_backfill_equals_live_replay()
    test_empty_and_short_inputs_no_crash()
    print("\nall wedge_detector tests passed")
