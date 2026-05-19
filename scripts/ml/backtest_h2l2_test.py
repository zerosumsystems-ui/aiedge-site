"""Tests for the H2-L2 scaling-in trade engine.

Run: python3 scripts/ml/backtest_h2l2_test.py
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "live"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from tfo_detector import Bar5m  # noqa: E402
import backtest_h2l2 as bt  # noqa: E402

# Pin the scaling config so the tests do not move when it is tuned.
bt.N_TRANCHES = 4
bt.SCALE_STEP_FRAC = 0.30
bt.STOP_WIDEN_FRAC = 1.30
bt.BREAKEVEN_ARM_FRAC = 0.25
bt.ENTRY_SLIPPAGE_BPS = 0.0
bt.STOP_SLIPPAGE_BPS = 0.0
bt.COMMISSION_PER_SHARE = 0.0


def assert_eq(actual, expected, label):
    if actual != expected:
        print(f"FAIL {label}: expected {expected!r}, got {actual!r}")
        sys.exit(1)
    print(f"PASS {label}")


def assert_close(actual, expected, label, tol=1e-4):
    if abs(actual - expected) > tol:
        print(f"FAIL {label}: expected ~{expected}, got {actual}")
        sys.exit(1)
    print(f"PASS {label}")


def _long():
    # entry 100, structural stop 90, impulse height 10, target 110.
    return bt.TradeSetup(direction="long", entry_index=2, entry_ts=0,
                         entry_price=100.0, stop_price=90.0,
                         target_price=110.0, height=10.0)


def _bar(o, h, l, c):
    return Bar5m(t=0, o=o, h=h, l=l, c=c)


def test_levels():
    wide_stop, tranches = bt.scale_in_levels(_long())
    assert_close(wide_stop, 90.0 - 13.0, "wide stop is 1.30x height past the stop")
    assert_eq(tranches, [100.0, 97.0, 94.0, 91.0], "four tranches spaced 0.30x height")


def test_no_pullback_runs_to_target():
    bars = [_bar(0, 0, 0, 0)] * 3 + [_bar(100, 102, 99.9, 101)] * 2 + [_bar(101, 111, 101, 110)]
    r = bt.simulate_scaled(_long(), bars)
    assert_eq(r["exit_reason"], "target", "no-pullback trade hits target")
    assert_eq(r["tranches_filled"], 1, "only the signal-bar tranche filled")
    assert_close(r["net_r"], 10.0 / 23.0, "no-pullback target R")


def test_full_scale_then_target():
    bars = [_bar(0, 0, 0, 0)] * 3 + [_bar(99, 92, 91, 91.5), _bar(92, 111, 92, 110)]
    r = bt.simulate_scaled(_long(), bars)
    assert_eq(r["exit_reason"], "target", "scaled-in trade hits target")
    assert_eq(r["tranches_filled"], 4, "all four tranches filled")
    assert_close(r["net_r"], 58.0 / 23.0, "full-scale target R")


def test_wide_stop_loss():
    bars = [_bar(0, 0, 0, 0)] * 3 + [_bar(99, 99, 70, 72)]
    r = bt.simulate_scaled(_long(), bars)
    assert_eq(r["exit_reason"], "stop", "trade stops at the wide stop")
    assert_eq(r["tranches_filled"], 4, "wide-stop bar fills every pending add")
    assert_close(r["net_r"], -74.0 / 23.0, "full-scale stop R")


def test_breakeven_trail_scratches_the_trade():
    pull = _bar(99, 99, 96.5, 97)        # fills the 97 add only
    rally = _bar(97, 101.5, 97, 101)     # arms breakeven (avg 98.5 + 2.5)
    fade = _bar(101, 101, 98.0, 98.2)    # back to avg 98.5 -> scratch
    bars = [_bar(0, 0, 0, 0)] * 3 + [pull, rally, fade]
    r = bt.simulate_scaled(_long(), bars)
    assert_eq(r["exit_reason"], "breakeven", "armed trade scratches at breakeven")
    assert_eq(r["tranches_filled"], 2, "signal bar + one add filled")
    assert_close(r["net_r"], 0.0, "breakeven scratch is flat (zero cost here)")


if __name__ == "__main__":
    test_levels()
    test_no_pullback_runs_to_target()
    test_full_scale_then_target()
    test_wide_stop_loss()
    test_breakeven_trail_scratches_the_trade()
    print("\nall backtest_h2l2 tests passed")
