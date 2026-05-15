#!/usr/bin/env python3
"""Backtest of the Brooks High 2 / Low 2 — his single most-cited best trade.

The H2/L2 is the two-legged-pullback resumption after a spike (see
h2_detector.py). This is the direct sibling of backtest_first_pullback
(the H1): same spike context, same structural stops, same Brooks
targets and trade management — so the H2 verdict is directly comparable
to the H1 result.

Grid: 2 Brooks stops (pullback extreme | spike start) x targets
(measured move | reward=risk +1R | scale-out). 1-minute bar-walked
execution; commission + slippage (bps and tick), reusing the cost
machinery from backtest_first_pullback.

Usage: python3 scripts/backtest_h2.py
"""

from __future__ import annotations

import json
import sys

from backtest_first_pullback import (aggregate_5m, BARS_CACHE, simulate,
                                     simulate_scaleout, summarize)
from h2_detector import detect_h2


def main() -> int:
    cache_files = sorted(BARS_CACHE.glob("*.json"))
    if not cache_files:
        print(f"ERROR: no cached 1-min bars in {BARS_CACHE}", file=sys.stderr)
        return 2
    print(f"Scanning {len(cache_files)} sessions for High 2 / Low 2...")

    # (name, stop_attr, mode, param)
    combos = [
        ("pullback_stop / measured_move", "stop_pullback", "fixed", "target_measured_move"),
        ("pullback_stop / reward=risk",   "stop_pullback", "rr", 1.0),
        ("spike_stop / measured_move",    "stop_spike",    "fixed", "target_measured_move"),
        ("spike_stop / reward=risk",      "stop_spike",    "rr", 1.0),
        ("spike_stop / scale-out",        "stop_spike",    "scaleout", None),
    ]
    models = ("bps", "tick")
    buckets: dict = {(n, m): [] for n, *_ in combos for m in models}
    by_month: dict[str, list[dict]] = {}        # spike_stop/reward=risk, bps
    opening: list[dict] = []
    intraday: list[dict] = []
    ema_yes: list[dict] = []
    ema_no: list[dict] = []
    n_sig = 0
    for cf in cache_files:
        try:
            bars1 = json.loads(cf.read_text())
        except Exception:
            continue
        if not bars1:
            continue
        symbol, session_date = cf.stem.rsplit("_", 1)
        bars5 = aggregate_5m(bars1)
        for sig in detect_h2(bars5):
            n_sig += 1
            for name, stop_attr, mode, param in combos:
                stop = getattr(sig, stop_attr)
                target = None
                if mode == "fixed":
                    target = getattr(sig, param)
                elif mode == "rr":
                    risk = (sig.entry_trigger - stop) if sig.direction == "long" \
                        else (stop - sig.entry_trigger)
                    target = (sig.entry_trigger + param * risk
                              if sig.direction == "long"
                              else sig.entry_trigger - param * risk)
                for m in models:
                    if mode == "scaleout":
                        sim = simulate_scaleout(sig, bars1, stop,
                                                sig.target_measured_move, m)
                    else:
                        sim = simulate(sig, bars1, stop, target, m)
                    if sim is None:
                        continue
                    buckets[(name, m)].append(sim)
                    if (name, m) == ("spike_stop / reward=risk", "bps"):
                        by_month.setdefault(session_date[:7], []).append(sim)
                        (opening if sig.is_opening else intraday).append(sim)
                        (ema_yes if sig.reached_ema else ema_no).append(sim)
    print(f"  {n_sig} High 2 / Low 2 signals\n")

    print("=== BROOKS HIGH 2 / LOW 2 BACKTEST ===")
    for name, *_ in combos:
        print(f"\n  [{name}]")
        for m in models:
            s = summarize(buckets[(name, m)], m)
            if s["n"] == 0:
                print(f"    {m}: n=0")
                continue
            print(f"    {m:5s} n={s['n']:5d}  win={s['win_rate']:.3f}  "
                  f"exp={s['expectancy_r']:+.3f}R  CI{s['expectancy_ci95']}  "
                  f"pf={s['profit_factor']}")

    print("\n  -- spike_stop / reward=risk, bps — segments --")
    for label, grp in (("opening spikes", opening), ("intraday spikes", intraday),
                       ("pullback reached EMA", ema_yes),
                       ("pullback missed EMA", ema_no)):
        s = summarize(grp, label)
        if s["n"]:
            print(f"    {label:24s} n={s['n']:5d}  win={s['win_rate']:.3f}  "
                  f"exp={s['expectancy_r']:+.3f}R  CI{s['expectancy_ci95']}")
    months = [summarize(by_month[k], k) for k in sorted(by_month)]
    pos = sum(1 for s in months if s["n"] and s["expectancy_r"] > 0)
    print(f"    months positive: {pos}/{len(months)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
