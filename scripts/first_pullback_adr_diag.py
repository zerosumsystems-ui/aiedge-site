#!/usr/bin/env python3
"""Diagnostic: the measured-move target vs. average daily range.

Will's question: a measured-move target is only meaningful if the day
can plausibly travel that far. So normalize everything by each symbol's
average daily range (ADR):

  - spike size / ADR            : how big is the spike vs. a normal day
  - first-4-bars range / ADR    : how big is the opening range
  - measured-move reach / ADR   : how far from the session open the
                                  measured-move target sits, in ADRs.
                                  A reach > 1 means the target needs a
                                  bigger-than-average day just to print.

Then the measured-move hit rate is bucketed by that reach. If the hit
rate collapses once the target is > ~1 ADR from the open, the 15%
headline is a target-placement artifact, not a directional failure.

ADR is computed per symbol from the cached sessions themselves
(mean of session high - session low).

Usage: python3 scripts/first_pullback_adr_diag.py
"""

from __future__ import annotations

import json
from collections import defaultdict

import numpy as np

from first_pullback_detector import detect_first_pullbacks
from first_pullback_diag import walk
from backtest_first_pullback import aggregate_5m, BARS_CACHE


def main() -> int:
    files = sorted(BARS_CACHE.glob("*.json"))

    # pass 1 — ADR per symbol (mean daily high-low)
    ranges: dict[str, list[float]] = defaultdict(list)
    for cf in files:
        try:
            bars1 = json.loads(cf.read_text())
        except Exception:
            continue
        if not bars1:
            continue
        sym = cf.stem.rsplit("_", 1)[0]
        hi = max(float(b["h"]) for b in bars1)
        lo = min(float(b["l"]) for b in bars1)
        ranges[sym].append(hi - lo)
    adr = {s: sum(v) / len(v) for s, v in ranges.items() if v}

    # pass 2 — per-trade metrics, all normalized by ADR
    rows = []
    for cf in files:
        try:
            bars1 = json.loads(cf.read_text())
        except Exception:
            continue
        if not bars1:
            continue
        sym = cf.stem.rsplit("_", 1)[0]
        a = adr.get(sym)
        if not a or a <= 0:
            continue
        bars5 = aggregate_5m(bars1)
        if len(bars5) < 4:
            continue
        sess_open = bars5[0].o
        first4 = bars5[:4]
        f4_range = max(b.h for b in first4) - min(b.l for b in first4)
        for sig in detect_first_pullbacks(bars5):
            res = walk(sig, bars1, sig.target_measured_move)
            if res is None:
                continue
            reason, net, mfe = res
            if sig.direction == "long":
                reach = (sig.target_measured_move - sess_open) / a
            else:
                reach = (sess_open - sig.target_measured_move) / a
            rows.append({
                "spike_pct": sig.spike_height / a,
                "f4_pct": f4_range / a,
                "reach": reach,
                "hit": reason == "target",
                "net": net,
                "mfe_pct": mfe * (sig.entry_trigger - sig.stop_pullback
                                  if sig.direction == "long"
                                  else sig.stop_pullback - sig.entry_trigger) / a,
            })

    n = len(rows)
    spike_pct = np.array([r["spike_pct"] for r in rows])
    f4_pct = np.array([r["f4_pct"] for r in rows])
    reach = np.array([r["reach"] for r in rows])
    print(f"{n} first-pullback trades, ADR computed for {len(adr)} symbols\n")

    print("SPIKE size as a fraction of ADR:")
    print(f"  median {np.median(spike_pct):.0%}  mean {spike_pct.mean():.0%}  "
          f"p90 {np.percentile(spike_pct, 90):.0%}")
    print("FIRST 4 BARS range as a fraction of ADR:")
    print(f"  median {np.median(f4_pct):.0%}  mean {f4_pct.mean():.0%}")
    print("MEASURED-MOVE target reach from the open, in ADRs:")
    print(f"  median {np.median(reach):.2f}  mean {reach.mean():.2f}  "
          f"p25 {np.percentile(reach, 25):.2f}  p75 {np.percentile(reach, 75):.2f}")
    over_1 = (reach > 1.0).mean()
    print(f"  -> {over_1:.0%} of targets need a BIGGER-than-average day "
          f"(reach > 1 ADR) just to print")

    print("\nmeasured-move hit rate + gross expectancy, bucketed by "
          "target reach (ADRs from open):")
    print(f"  {'reach':12s} {'n':>5s} {'hit':>7s} {'exp(R)':>9s}")
    for lo, hi in [(0, 0.75), (0.75, 1.0), (1.0, 1.25),
                   (1.25, 1.5), (1.5, 2.0), (2.0, 99)]:
        grp = [r for r in rows if lo <= r["reach"] < hi]
        if not grp:
            continue
        hits = sum(1 for r in grp if r["hit"]) / len(grp)
        exp = sum(r["net"] for r in grp) / len(grp)
        tag = f"{lo:.2f}-{hi:.2f}" if hi < 99 else f"{lo:.2f}+"
        print(f"  {tag:12s} {len(grp):5d} {hits:6.1%} {exp:+8.3f}")

    print("\nsame, bucketed by SPIKE size as a fraction of ADR:")
    print(f"  {'spike/ADR':12s} {'n':>5s} {'hit':>7s} {'exp(R)':>9s}")
    for lo, hi in [(0, 0.2), (0.2, 0.35), (0.35, 0.5), (0.5, 0.75), (0.75, 99)]:
        grp = [r for r in rows if lo <= r["spike_pct"] < hi]
        if not grp:
            continue
        hits = sum(1 for r in grp if r["hit"]) / len(grp)
        exp = sum(r["net"] for r in grp) / len(grp)
        tag = f"{lo:.0%}-{hi:.0%}" if hi < 99 else f"{lo:.0%}+"
        print(f"  {tag:12s} {len(grp):5d} {hits:6.1%} {exp:+8.3f}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
