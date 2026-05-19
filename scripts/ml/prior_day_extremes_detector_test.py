#!/usr/bin/env python3
"""Offline tests for prior_day_extremes_detector — no data fetch."""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from prior_day_extremes_detector import detect_pde_reversals


def bar(o, h, l, c, ema=None, time=""):
    return {"o": o, "h": h, "l": l, "c": c, "ema20": ema, "time": time}


PASS = 0
FAIL = 0


def check(name: str, cond: bool):
    global PASS, FAIL
    if cond:
        PASS += 1
        print(f"  ok   {name}")
    else:
        FAIL += 1
        print(f"  FAIL {name}")


# ---------------------------------------------------------------------
# A failed breakout above the prior-day high (100.0): bar 2 pokes to
# 101, bar 3 closes back to 99.5 -> short reversal on bar 3.
short_session = [
    bar(98.0, 99.0, 97.5, 98.5, time="09:30"),
    bar(98.5, 99.8, 98.4, 99.6, time="09:35"),
    bar(99.6, 101.0, 99.5, 100.6, time="09:40"),   # poke above 100
    bar(100.6, 100.7, 99.0, 99.5, time="09:45"),   # closes back inside
    bar(99.5, 99.6, 98.0, 98.2, time="09:50"),
    bar(98.2, 98.5, 97.0, 97.2, time="09:55"),
]
sigs = detect_pde_reversals(short_session, prior_high=100.0, prior_low=90.0)
check("one short signal on the failed high poke", len(sigs) == 1)
if sigs:
    s = sigs[0]
    check("direction is short", s.direction == "short")
    check("level_kind is prior_day_high", s.level_kind == "prior_day_high")
    check("breakout bar is index 2", s.breakout_index == 2)
    check("reversal/entry bar is index 3", s.reversal_index == 3)
    check("entry is the reversal close", abs(s.entry_price - 99.5) < 1e-9)
    check("stop sits above the breakout swing", s.stop_price > 101.0)
    check("target is below entry", s.target_price < s.entry_price)
    check("attempt number is 1", s.attempt_number == 1)
    check("2R target geometry", abs((s.entry_price - s.target_price)
                                    - 2 * s.risk) < 1e-9)

# ---------------------------------------------------------------------
# Mirror: a failed breakout below the prior-day low (90.0) -> long.
long_session = [
    bar(92.0, 93.0, 91.5, 92.2, time="09:30"),
    bar(92.2, 92.4, 90.6, 90.8, time="09:35"),
    bar(90.8, 91.0, 89.0, 89.4, time="09:40"),     # poke below 90
    bar(89.4, 91.2, 89.3, 90.9, time="09:45"),     # closes back inside
    bar(90.9, 92.5, 90.8, 92.3, time="09:50"),
    bar(92.3, 93.0, 92.0, 92.8, time="09:55"),
]
lsigs = detect_pde_reversals(long_session, prior_high=110.0, prior_low=90.0)
check("one long signal on the failed low poke", len(lsigs) == 1)
if lsigs:
    s = lsigs[0]
    check("long direction", s.direction == "long")
    check("long stop sits below the breakout swing", s.stop_price < 89.0)
    check("long target is above entry", s.target_price > s.entry_price)

# ---------------------------------------------------------------------
# No-look-ahead: a signal at reversal bar r must be unchanged when bars
# after r are deleted or replaced.
truncated = detect_pde_reversals(short_session[:4], 100.0, 90.0)
check("signal survives truncation right after the reversal bar",
      len(truncated) == 1 and truncated[0].reversal_index == 3)
mutated = [dict(b) for b in short_session]
for b in mutated[4:]:
    b["h"], b["l"], b["c"] = 999.0, 998.0, 998.5
after = detect_pde_reversals(mutated, 100.0, 90.0)
check("signal unchanged when post-reversal bars are mutated",
      len(after) == 1 and abs(after[0].entry_price - 99.5) < 1e-9)

# ---------------------------------------------------------------------
# A poke that holds above the level (no close back inside) -> no signal.
holds = [
    bar(98.0, 99.0, 97.5, 98.5, time="09:30"),
    bar(98.5, 99.8, 98.4, 99.6, time="09:35"),
    bar(99.6, 101.0, 99.5, 100.6, time="09:40"),
    bar(100.6, 102.0, 100.4, 101.8, time="09:45"),  # still above 100
    bar(101.8, 102.5, 101.5, 102.2, time="09:50"),
]
check("a breakout that holds produces no reversal signal",
      len(detect_pde_reversals(holds, 100.0, 90.0)) == 0)

# ---------------------------------------------------------------------
# A poke that only tics the level (< MIN_OVERSHOOT) is screened out.
tick = [
    bar(99.0, 99.5, 98.5, 99.2, time="09:30"),
    bar(99.2, 99.8, 99.0, 99.6, time="09:35"),
    bar(99.6, 100.005, 99.5, 99.7, time="09:40"),   # +0.005% only
    bar(99.7, 99.8, 99.0, 99.3, time="09:45"),
    bar(99.3, 99.4, 98.5, 98.7, time="09:50"),
]
check("a sub-threshold tick of the level is not a breakout",
      len(detect_pde_reversals(tick, 100.0, 90.0)) == 0)

# ---------------------------------------------------------------------
# Two separate pokes -> attempt numbers increment.
two = [
    bar(98.0, 99.0, 97.5, 98.5, time="09:30"),
    bar(98.5, 101.0, 98.4, 100.5, time="09:35"),    # poke 1
    bar(100.5, 100.6, 99.0, 99.5, time="09:40"),    # fail 1 -> attempt 1
    bar(99.5, 99.9, 98.5, 99.8, time="09:45"),      # back inside
    bar(99.8, 101.2, 99.7, 100.8, time="09:50"),    # poke 2
    bar(100.8, 100.9, 98.0, 99.2, time="09:55"),    # fail 2 -> attempt 2
    bar(99.2, 99.5, 98.0, 98.3, time="10:00"),
]
tsigs = detect_pde_reversals(two, 100.0, 90.0)
check("two pokes produce two signals", len(tsigs) == 2)
if len(tsigs) == 2:
    check("attempts are numbered 1 then 2",
          tsigs[0].attempt_number == 1 and tsigs[1].attempt_number == 2)

print(f"\n{PASS} passed, {FAIL} failed")
raise SystemExit(1 if FAIL else 0)
