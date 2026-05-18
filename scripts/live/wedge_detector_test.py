"""Tests for wedge_detector. Run: python3 scripts/live/wedge_detector_test.py

Fixtures are built from explicit trendline equations by `build_series`,
so the geometry is exact rather than eyeballed. The suite checks the
unbiased guarantees as much as the firing logic: pivots are confirmed
(never hindsight), and a full-history sweep emits the same signals a
live bar-by-bar scanner would.
"""

from __future__ import annotations

import sys

from wedge_detector import (
    Bar,
    WedgeSignal,
    detect_wedges,
    _confirmed_pivot_highs,
    _fit_line,
)


def assert_eq(actual, expected, label: str):
    if actual != expected:
        print(f"FAIL {label}: expected {expected!r}, got {actual!r}")
        sys.exit(1)
    print(f"PASS {label}")


def assert_true(cond, label: str):
    assert_eq(bool(cond), True, label)


# ----- fixture builder ------------------------------------------------

def build_series(
    *,
    res: tuple[float, float],   # (slope, value-at-x0) of the resistance line
    sup: tuple[float, float],   # (slope, value-at-x0) of the support line
    x0: int,
    turns: list[tuple[int, str]],  # (index, 'hi'|'lo') turning points
    n: int,
) -> list[Bar]:
    """Build `n` bars tracing a triangle wave between two trendlines.

    At a 'hi' turn the bar's HIGH touches the resistance line; at a 'lo'
    turn the bar's LOW touches the support line. Bars between turns are
    thin and interpolate strictly monotonically, so the only swing
    pivots are the declared turns.
    """
    def res_at(x: float) -> float:
        return res[0] * (x - x0) + res[1]

    def sup_at(x: float) -> float:
        return sup[0] * (x - x0) + sup[1]

    def turn_level(idx: int, kind: str) -> float:
        return res_at(idx) if kind == "hi" else sup_at(idx)

    bars: list[Bar] = []
    for i in range(n):
        # Locate the turns bracketing index i.
        prev_t = None
        next_t = None
        for (idx, kind) in turns:
            if idx <= i:
                prev_t = (idx, kind)
            if idx >= i and next_t is None:
                next_t = (idx, kind)
        if prev_t is None:
            prev_t = turns[0]
        if next_t is None:
            next_t = turns[-1]

        if prev_t[0] == i:
            kind = prev_t[1]
            lvl = turn_level(i, kind)
            if kind == "hi":
                bars.append(Bar(t=i, o=lvl - 0.1, h=lvl, l=lvl - 0.2, c=lvl - 0.05))
            else:
                bars.append(Bar(t=i, o=lvl + 0.1, h=lvl + 0.2, l=lvl, c=lvl + 0.05))
            continue

        if next_t[0] == prev_t[0]:
            level = turn_level(prev_t[0], prev_t[1])
        else:
            lo_lvl = turn_level(prev_t[0], prev_t[1])
            hi_lvl = turn_level(next_t[0], next_t[1])
            frac = (i - prev_t[0]) / (next_t[0] - prev_t[0])
            level = lo_lvl + (hi_lvl - lo_lvl) * frac
        bars.append(Bar(t=i, o=level, h=level, l=level, c=level))
    return bars


# ---------------------------------------------------------------------

def test_fit_line_exact():
    slope, intercept = _fit_line([0, 1, 2, 3], [1, 3, 5, 7])
    assert_true(abs(slope - 2.0) < 1e-9, "fit_line slope")
    assert_true(abs(intercept - 1.0) < 1e-9, "fit_line intercept")


def test_pivot_confirmation_is_lagged():
    """A swing high is reported only once PIVOT_K right-context bars
    exist — never on hindsight."""
    highs = [10, 11, 12, 13, 14, 20, 14, 13, 12, 11, 10]
    bars = [Bar(t=i, o=h, h=h, l=h - 1, c=h) for i, h in enumerate(highs)]
    assert_eq(_confirmed_pivot_highs(bars, upto=7, k=3), [], "peak not yet confirmed")
    assert_eq(_confirmed_pivot_highs(bars, upto=8, k=3), [5], "peak confirmed at +k")


def _falling_wedge() -> list[Bar]:
    """Resistance slope -0.4, support slope -0.2 -> converging falling
    wedge. Pivot highs 6/16/26, pivot lows 11/21/31."""
    return build_series(
        res=(-0.4, 100.0), sup=(-0.2, 93.0), x0=6,
        turns=[(0, "lo"), (6, "hi"), (11, "lo"), (16, "hi"),
               (21, "lo"), (26, "hi"), (31, "lo")],
        n=40,
    )


def test_falling_wedge_breaks_long():
    bars = _falling_wedge()
    # Hold inside the narrow channel after the last pivot, then break up.
    for i in (32, 33, 34):
        bars[i] = Bar(t=i, o=88.4, h=88.6, l=88.2, c=88.4)
    bars[35] = Bar(t=35, o=88.4, h=92.5, l=88.2, c=92.0)  # close >> resistance
    sigs = detect_wedges(bars)
    assert_eq(len(sigs), 1, "falling wedge: one signal")
    assert_eq(sigs[0].direction, "long", "falling wedge -> long")
    assert_eq(sigs[0].wedge_type, "falling", "classified falling")
    assert_eq(sigs[0].fired_bar_index, 35, "fires on the breakout bar")
    assert_true(sigs[0].convergence < 1.0, "channel converged")


def test_falling_wedge_no_fire_without_breakout():
    """The wedge with no breakout bar emits nothing — a wedge alone is
    not a trade. Price simply rides the descending channel midline."""
    bars = _falling_wedge()
    for i in range(32, 40):
        mid = -0.3 * (i - 6) + 96.5  # midpoint of the two trendlines
        bars[i] = Bar(t=i, o=mid, h=mid + 0.1, l=mid - 0.1, c=mid)
    assert_eq(len(detect_wedges(bars)), 0, "no breakout -> no signal")


def test_rising_wedge_breaks_short():
    """Resistance slope +0.2, support slope +0.4 -> converging rising
    wedge; a close below support is the bearish break."""
    bars = build_series(
        res=(0.2, 100.0), sup=(0.4, 93.0), x0=6,
        turns=[(0, "hi"), (6, "lo"), (11, "hi"), (16, "lo"),
               (21, "hi"), (26, "lo"), (31, "hi")],
        n=40,
    )
    for i in (32, 33, 34):
        bars[i] = Bar(t=i, o=99.6, h=99.8, l=99.4, c=99.6)
    bars[35] = Bar(t=35, o=99.6, h=99.8, l=95.0, c=95.5)  # close << support
    sigs = detect_wedges(bars)
    assert_eq(len(sigs), 1, "rising wedge: one signal")
    assert_eq(sigs[0].direction, "short", "rising wedge -> short")
    assert_eq(sigs[0].wedge_type, "rising", "classified rising")


def test_no_wedge_in_parallel_channel():
    """Parallel trendlines (constant width) are a channel, not a wedge —
    must not fire even on a breakout."""
    bars = build_series(
        res=(-0.3, 100.0), sup=(-0.3, 93.0), x0=6,
        turns=[(0, "lo"), (6, "hi"), (11, "lo"), (16, "hi"),
               (21, "lo"), (26, "hi"), (31, "lo")],
        n=40,
    )
    bars[35] = Bar(t=35, o=90.0, h=95.0, l=89.0, c=94.0)
    assert_eq(len(detect_wedges(bars)), 0, "parallel channel is not a wedge")


def test_backfill_equals_live_replay():
    """The core unbiased guarantee: the signal a full-history sweep
    emits for bar n is identical to what a scanner streaming bars one
    at a time would emit, because detection at n reads only bars[:n+1].
    """
    bars = _falling_wedge()
    for i in (32, 33, 34):
        bars[i] = Bar(t=i, o=88.4, h=88.6, l=88.2, c=88.4)
    bars[35] = Bar(t=35, o=88.4, h=92.5, l=88.2, c=92.0)

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
    test_fit_line_exact()
    test_pivot_confirmation_is_lagged()
    test_falling_wedge_breaks_long()
    test_falling_wedge_no_fire_without_breakout()
    test_rising_wedge_breaks_short()
    test_no_wedge_in_parallel_channel()
    test_backfill_equals_live_replay()
    test_empty_and_short_inputs_no_crash()
    print("\nall wedge_detector tests passed")
