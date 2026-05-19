"""Tests for the scaling-in spike trade engine.

Run: python3 scripts/ml/backtest_spike_test.py
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "live"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from tfo_detector import Bar5m  # noqa: E402
from spike_detector import SpikeSignal  # noqa: E402
import backtest_spike as bs  # noqa: E402

# Pin the scaling config so the tests do not move when it is tuned.
bs.N_TRANCHES = 4
bs.SCALE_STEP_FRAC = 0.30
bs.STOP_WIDEN_FRAC = 1.30
bs.BREAKEVEN_ARM_FRAC = 0.25
bs.ENTRY_SLIPPAGE_BPS = 0.0      # exact arithmetic in the assertions
bs.STOP_SLIPPAGE_BPS = 0.0
bs.COMMISSION_PER_SHARE = 0.0


def assert_eq(actual, expected, label):
    if actual != expected:
        print(f"FAIL {label}: expected {expected!r}, got {actual!r}")
        sys.exit(1)
    print(f"PASS {label}")


def assert_close(actual, expected, label, tol=1e-6):
    if abs(actual - expected) > tol:
        print(f"FAIL {label}: expected ~{expected}, got {actual}")
        sys.exit(1)
    print(f"PASS {label}")


def _long_signal():
    """A long spike: entry 100, spike low 90, height 10, target 110.
    The signal bar sits at index 2; the trade path is index 3+."""
    return SpikeSignal(
        direction="long", spike_start_index=0, entry_index=2, entry_ts=0,
        entry_price=100.0, stop_price=89.99, target_price=110.0,
        spike_height=10.0, spike_bar_count=3, is_opening=True,
    )


def _bar(o, h, l, c):
    return Bar5m(t=0, o=o, h=h, l=l, c=c)


def test_levels():
    """wide stop = spike low - 1.30 * height; adds every 0.30 * height."""
    wide_stop, tranches = bs.scale_in_levels(_long_signal())
    assert_close(wide_stop, 90.0 - 13.0, "wide stop is 1.30x height below spike low")
    assert_eq(tranches, [100.0, 97.0, 94.0, 91.0], "four tranches spaced 0.30x height")


def test_no_pullback_runs_to_target():
    """Price runs straight up: only the signal-bar tranche fills."""
    sig = _long_signal()
    path = [_bar(100, 102, 99.9, 101)] * 2 + [_bar(101, 111, 101, 110)]
    bars = [_bar(0, 0, 0, 0)] * 3 + path
    r = bs.simulate_scaled(sig, bars)
    assert_eq(r["exit_reason"], "target", "no-pullback trade hits target")
    assert_eq(r["tranches_filled"], 1, "only the signal-bar tranche filled")
    # risk1 = 100 - 77 = 23; gross = 110 - 100 = 10.
    assert_close(r["net_r"], 10.0 / 23.0, "no-pullback target R", tol=1e-4)


def test_full_scale_then_target():
    """A deep pullback fills all four tranches, then the move resumes."""
    sig = _long_signal()
    pullback = _bar(99, 92, 91, 91.5)      # low 91 fills the 97/94/91 adds
    runup = _bar(92, 111, 92, 110)
    bars = [_bar(0, 0, 0, 0)] * 3 + [pullback, runup]
    r = bs.simulate_scaled(sig, bars)
    assert_eq(r["exit_reason"], "target", "scaled-in trade hits target")
    assert_eq(r["tranches_filled"], 4, "all four tranches filled")
    # gross = (110-100)+(110-97)+(110-94)+(110-91) = 58 ; risk1 = 23.
    assert_close(r["net_r"], 58.0 / 23.0, "full-scale target R", tol=1e-4)


def test_wide_stop_loss():
    """A bar straight through the wide stop: every add fills, then stop."""
    sig = _long_signal()
    bars = [_bar(0, 0, 0, 0)] * 3 + [_bar(99, 99, 70, 72)]
    r = bs.simulate_scaled(sig, bars)
    assert_eq(r["exit_reason"], "stop", "trade stops at the wide stop")
    assert_eq(r["tranches_filled"], 4, "wide-stop bar fills every pending add")
    # exit 77 ; gross = (77-100)+(77-97)+(77-94)+(77-91) = -74 ; risk1 = 23.
    assert_close(r["net_r"], -74.0 / 23.0, "full-scale stop R", tol=1e-4)


def test_breakeven_trail_scratches_the_trade():
    """Pull back to fill an add, rally far enough to arm the breakeven
    stop, then fall back to the average entry — scratched, not stopped."""
    sig = _long_signal()
    pull = _bar(99, 99, 96.5, 97)          # low 96.5 fills the 97 add only
    # avg of {100, 97} = 98.5 ; breakeven arms at 98.5 + 0.25*10 = 101.0
    rally = _bar(97, 101.5, 97, 101)       # high 101.5 arms breakeven
    fade = _bar(101, 101, 98.0, 98.2)      # low 98.0 <= avg 98.5 -> scratch
    bars = [_bar(0, 0, 0, 0)] * 3 + [pull, rally, fade]
    r = bs.simulate_scaled(sig, bars)
    assert_eq(r["exit_reason"], "breakeven", "armed trade scratches at breakeven")
    assert_eq(r["tranches_filled"], 2, "signal bar + one add filled")
    assert_close(r["net_r"], 0.0, "breakeven scratch is flat (zero cost here)", tol=1e-4)


if __name__ == "__main__":
    test_levels()
    test_no_pullback_runs_to_target()
    test_full_scale_then_target()
    test_wide_stop_loss()
    test_breakeven_trail_scratches_the_trade()
    print("\nall backtest_spike tests passed")
