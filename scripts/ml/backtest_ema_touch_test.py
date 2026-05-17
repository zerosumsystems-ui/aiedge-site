"""Engine-invariant tests for backtest_ema_touch — the pure functions
that need no market data. Run:

    python3 scripts/ml/backtest_ema_touch_test.py
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from ema_touch_detector import EmaTouchSignal  # noqa: E402
from backtest_ema_touch import (  # noqa: E402
    VARIANTS, passes_min_risk, seeded_ema, simulate, size_trade,
)


def assert_eq(actual, expected, label: str):
    if actual != expected:
        print(f"FAIL {label}: expected {expected!r}, got {actual!r}")
        sys.exit(1)
    print(f"PASS {label}")


def assert_true(cond, label: str):
    assert_eq(bool(cond), True, label)


def assert_close(actual, expected, label: str, tol: float = 1e-6):
    if abs(actual - expected) > tol:
        print(f"FAIL {label}: expected ~{expected}, got {actual}")
        sys.exit(1)
    print(f"PASS {label}")


def _variant(name: str):
    return next(v for v in VARIANTS if v.name == name)


def _signal(direction="long", entry=100.0, touch_extreme=99.5,
            atr=2.0, trend_height=3.0):
    return EmaTouchSignal(
        direction=direction, ema_len=20, touch_index=10, touch_ts=3000,
        entry_price=entry, touch_extreme=touch_extreme, ema_at_touch=entry,
        atr_at_touch=atr, trend_start_index=2, trend_extreme=entry + 3,
        trend_height=trend_height,
    )


def bar(t, h, l, c=None):
    return {"t": t, "o": l, "h": h, "l": l, "c": c if c is not None else l, "v": 0.0}


# ----- seeded_ema -----------------------------------------------------


def test_seeded_ema_length_and_warmup():
    out = seeded_ema([], [100.0, 102.0, 101.0], period=1)
    # period=1 -> alpha=1 -> the EMA is just the close series.
    assert_eq(out, [100.0, 102.0, 101.0], "no prior: alpha=1 EMA equals closes")


def test_seeded_ema_prior_day_shifts_result():
    """Seeding with the prior day changes today's opening EMA — that is
    the whole point of prior_trading_day_continuous seeding."""
    from_scratch = seeded_ema([], [100.0], period=3)
    seeded = seeded_ema([90.0], [100.0], period=3)        # alpha = 0.5
    assert_eq(from_scratch, [100.0], "from-scratch EMA = today's first close")
    assert_close(seeded[0], 95.0, "prior-seeded EMA pulled toward yesterday")
    assert_true(seeded[0] != from_scratch[0], "seeding changes the EMA")


# ----- size_trade -----------------------------------------------------


def test_size_trade_1r_and_2r():
    sig = _signal(direction="long", entry=100.0, touch_extreme=99.5)
    one = size_trade(sig, _variant("ema20_1r"))
    assert_close(one["stop"], 99.49, "stop = touch low - 1 tick")
    assert_close(one["risk"], 0.51, "risk = entry - stop")
    assert_close(one["target"], 100.51, "1R target = entry + 1*risk")
    two = size_trade(sig, _variant("ema20_2r"))
    assert_close(two["target"], 101.02, "2R target = entry + 2*risk")


def test_size_trade_measured_move():
    sig = _signal(direction="long", entry=100.0, trend_height=3.0)
    mm = size_trade(sig, _variant("ema20_mm"))
    assert_close(mm["target"], 103.0, "measured-move target = entry + trend leg")


def test_size_trade_atr_stop_is_wider():
    sig = _signal(direction="long", entry=100.0, touch_extreme=99.5, atr=2.0)
    atr = size_trade(sig, _variant("ema20_atr2r"))
    # stop = touch low - 1*ATR = 99.5 - 2.0
    assert_close(atr["stop"], 97.5, "ATR stop sits an ATR below the touch low")
    assert_close(atr["risk"], 2.5, "ATR-stop risk = entry - stop")
    assert_close(atr["target"], 105.0, "2R target off the wider ATR stop")


def test_size_trade_short_geometry():
    sig = _signal(direction="short", entry=100.0, touch_extreme=100.5)
    one = size_trade(sig, _variant("ema20_1r"))
    assert_close(one["stop"], 100.51, "short stop = touch high + 1 tick")
    assert_close(one["target"], 99.49, "short 1R target below entry")


# ----- the minimum-risk filter ----------------------------------------


def test_min_risk_drops_two_tick_trade():
    assert_eq(passes_min_risk(100.0, 0.02), False, "2-tick risk is untradable")


def test_min_risk_drops_thin_bps_on_pricey_name():
    # The XLF case: $52 name, $0.01 risk -> ~2 bps, far below the floor.
    assert_eq(passes_min_risk(52.0, 0.01), False, "1 tick on a $52 ETF dropped")
    # 10 ticks clears the tick floor but 2.5 bps still fails on a $400 name.
    assert_eq(passes_min_risk(400.0, 0.10), False, "thin-bps risk dropped")


def test_min_risk_passes_tradable_setup():
    assert_eq(passes_min_risk(100.0, 0.20), True, "20-tick / 20-bps risk passes")


# ----- simulate: the no-look-ahead invariant --------------------------


def test_simulate_ignores_bars_before_entry_close():
    """A 1-min bar BEFORE the touch bar's close must never score the
    trade — even one whose range spans both stop and target."""
    bars = [
        bar(t=700, h=200.0, l=50.0, c=100.0),    # pre-entry: would straddle
        bar(t=1000, h=100.5, l=99.5, c=100.0),   # post-entry: neither hit
        bar(t=1060, h=101.0, l=100.2, c=100.8),  # post-entry: target hit
    ]
    sim = simulate("long", entry_close_t=1000, entry_price=100.0,
                   stop=99.0, target=101.0, bars_1m=bars)
    assert_true(sim is not None, "trade simulated")
    assert_eq(sim["exit_reason"], "target",
              "pre-entry straddle ignored — target scored later")


def test_simulate_straddle_scored_as_stop():
    bars = [bar(t=1000, h=101.0, l=99.0, c=100.0)]   # spans stop and target
    sim = simulate("long", 1000, 100.0, 99.0, 101.0, bars)
    assert_eq(sim["exit_reason"], "stop_straddle", "straddle is conservative")
    assert_true(sim["net_r"] < 0, "straddle loses")


def test_simulate_time_stop():
    bars = [bar(t=1000, h=100.3, l=99.8, c=100.1),
            bar(t=1060, h=100.4, l=99.9, c=100.2)]
    sim = simulate("long", 1000, 100.0, 99.0, 101.0, bars)
    assert_eq(sim["exit_reason"], "time", "unresolved trade exits at the close")


def test_simulate_target_net_r_after_costs():
    bars = [bar(t=1000, h=101.0, l=100.0, c=100.9)]
    sim = simulate("long", 1000, 100.0, 99.0, 101.0, bars)
    assert_eq(sim["exit_reason"], "target", "target hit")
    # risk=1; entry slips +2bps to 100.02; clean limit exit at 101;
    # gross 0.98; commission 2*0.005/1 = 0.01R -> net ~0.97R.
    assert_close(sim["net_r"], 0.97, "net R = +1R minus slippage + commission",
                 tol=1e-3)


def test_simulate_no_path_returns_none():
    bars = [bar(t=500, h=101.0, l=100.0, c=100.5)]    # all before entry close
    sim = simulate("long", 1000, 100.0, 99.0, 101.0, bars)
    assert_true(sim is None, "no post-entry bars -> no trade")


if __name__ == "__main__":
    test_seeded_ema_length_and_warmup()
    test_seeded_ema_prior_day_shifts_result()
    test_size_trade_1r_and_2r()
    test_size_trade_measured_move()
    test_size_trade_atr_stop_is_wider()
    test_size_trade_short_geometry()
    test_min_risk_drops_two_tick_trade()
    test_min_risk_drops_thin_bps_on_pricey_name()
    test_min_risk_passes_tradable_setup()
    test_simulate_ignores_bars_before_entry_close()
    test_simulate_straddle_scored_as_stop()
    test_simulate_time_stop()
    test_simulate_target_net_r_after_costs()
    test_simulate_no_path_returns_none()
    print("\nall backtest_ema_touch engine-invariant tests passed")
