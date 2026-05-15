#!/usr/bin/env python3
"""Diagnostic: why is the measured-move hit rate so low?

For every first-pullback signal, this measures:
  - target_mm_R : how far the measured-move target sits from entry, in R
  - target_nh_R : same for the "new high" target
  - mfe_R       : the trade's max favorable excursion, in R (how far it
                  actually ran in our favor before exit/session end)

If target_mm_R is large (a far target), a low hit rate is expected, not
a bug. If target_mm_R were ~1R and the hit rate were still 15%, that
WOULD be a bug. This script settles it, and dumps the worst losers.

Usage: python3 scripts/first_pullback_diag.py
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np

from first_pullback_detector import detect_first_pullbacks
from backtest_first_pullback import aggregate_5m, BARS_CACHE


def walk(sig, bars1, target):
    """Return (filled, exit_reason, net_R_gross, mfe_R) — no costs, so
    the geometry is clean. mfe_R is peak favorable move / risk."""
    d = sig.direction
    trig, stop = sig.entry_trigger, sig.stop_price
    risk = (trig - stop) if d == "long" else (stop - trig)
    if risk <= 0:
        return None
    path = sorted((b for b in bars1 if int(b["t"]) >= sig.entry_ts),
                  key=lambda b: int(b["t"]))
    filled = False
    mfe = 0.0
    for b in path:
        hi, lo, op = float(b["h"]), float(b["l"]), float(b["o"])
        if not filled:
            if d == "long" and hi >= trig:
                filled = True
            elif d == "short" and lo <= trig:
                filled = True
            if not filled:
                continue
        if d == "long":
            mfe = max(mfe, (hi - trig) / risk)
            if lo <= stop:
                return ("stop", -1.0, mfe)
            if hi >= target:
                return ("target", (target - trig) / risk, mfe)
        else:
            mfe = max(mfe, (trig - lo) / risk)
            if hi >= stop:
                return ("stop", -1.0, mfe)
            if lo <= target:
                return ("target", (trig - target) / risk, mfe)
    if not filled:
        return None
    last = float(path[-1]["c"])
    r = ((last - trig) if d == "long" else (trig - last)) / risk
    return ("time", r, mfe)


def main() -> int:
    rows = []
    for cf in sorted(BARS_CACHE.glob("*.json")):
        try:
            bars1 = json.loads(cf.read_text())
        except Exception:
            continue
        if not bars1:
            continue
        symbol, date = cf.stem.rsplit("_", 1)
        bars5 = aggregate_5m(bars1)
        for sig in detect_first_pullbacks(bars5):
            risk = ((sig.entry_trigger - sig.stop_price)
                    if sig.direction == "long"
                    else (sig.stop_price - sig.entry_trigger))
            if risk <= 0:
                continue
            mm_R = abs(sig.target_measured_move - sig.entry_trigger) / risk
            nh_R = abs(sig.target_new_high - sig.entry_trigger) / risk
            res = walk(sig, bars1, sig.target_measured_move)
            if res is None:
                continue
            reason, net, mfe = res
            rows.append({
                "symbol": symbol, "date": date, "dir": sig.direction,
                "risk": risk, "mm_R": mm_R, "nh_R": nh_R,
                "reason": reason, "net": net, "mfe": mfe,
                "pb": sig.pullback_bar_count,
            })

    n = len(rows)
    mm = np.array([r["mm_R"] for r in rows])
    nh = np.array([r["nh_R"] for r in rows])
    mfe = np.array([r["mfe"] for r in rows])
    print(f"{n} first-pullback trades\n")
    print("MEASURED-MOVE TARGET distance from entry, in R:")
    print(f"  min {mm.min():.2f}  p25 {np.percentile(mm,25):.2f}  "
          f"median {np.median(mm):.2f}  p75 {np.percentile(mm,75):.2f}  "
          f"max {mm.max():.2f}  mean {mm.mean():.2f}")
    print("NEW-HIGH TARGET distance from entry, in R:")
    print(f"  median {np.median(nh):.2f}  mean {nh.mean():.2f}")
    print("\nMax favorable excursion (how far trades ACTUALLY ran), in R:")
    print(f"  median {np.median(mfe):.2f}  p75 {np.percentile(mfe,75):.2f}  "
          f"p90 {np.percentile(mfe,90):.2f}  max {mfe.max():.2f}")

    # how many trades ran far enough to hit the measured move
    reached = sum(1 for r in rows if r["mfe"] >= r["mm_R"])
    print(f"\ntrades whose MFE reached the measured move: "
          f"{reached}/{n} = {reached/n:.1%}")
    # bucket the mm target distance
    print("\nmeasured-move target distance buckets:")
    for lo, hi in [(0, 1), (1, 2), (2, 3), (3, 5), (5, 99)]:
        grp = [r for r in rows if lo <= r["mm_R"] < hi]
        if not grp:
            continue
        hits = sum(1 for r in grp if r["reason"] == "target")
        print(f"  {lo}-{hi}R target: {len(grp):4d} trades, "
              f"{hits/len(grp):.1%} hit it")

    # if the measured move were projected from ENTRY instead of the
    # spike high (entry + spike_height), how far would it be?
    print("\nworst 12 losers (measured-move target):")
    losers = sorted(rows, key=lambda r: r["net"])[:12]
    print(f"  {'symbol':8s} {'date':11s} {'dir':5s} "
          f"{'mm_R':>6s} {'mfe_R':>6s} {'exit':10s}")
    for r in losers:
        print(f"  {r['symbol']:8s} {r['date']:11s} {r['dir']:5s} "
              f"{r['mm_R']:6.2f} {r['mfe']:6.2f} {r['reason']:10s}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
