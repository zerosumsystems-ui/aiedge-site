#!/usr/bin/env python3
"""Study: trend-from-open days whose extreme is set in the first bar or two.

Brooks (Trading Price Action: Trends, "Trend from the Open"):
  "The chance of the first bar being the high or low of the day on a day
   when there is a large gap opening can be 50 percent or more, if the
   bar is a strong trend bar... The high or low of the day forms within
   the first five bars or so in about 50 percent of days."

This characterizes the TIGHTEST variant: the day's low (bull) or high
(bear) prints in 5-min bar 1 or 2, and the opposite extreme comes later
(i.e. the day actually trends away from the open).

It is a HINDSIGHT study — the extreme is located with the whole session
in hand — so it answers "if you could identify these days, are they
worth trading," not "here is a live signal." A no-hindsight detector is
a separate, later step, justified only if this cohort looks worth it.

It also tests Brooks' two qualifiers for the STRONG variant: a sizeable
opening gap, and a strong first trend bar. The plain cohort, the gap
split, the strong-first-bar split, and the Brooks combination are all
reported, normalised by average daily range.

Usage: python3 scripts/tfo_open_extreme_study.py
"""

from __future__ import annotations

import json

import numpy as np

from backtest_first_pullback import aggregate_5m, BARS_CACHE

EXTREME_WINDOW = 2     # extreme must print in 5-min bar index 0..1
MIN_BARS = 12          # skip half-sessions / bad caches
TREND_CLOSE = 0.70     # "trended" = closed in the far 30% of the range
STRONG_BODY = 0.50     # strong trend bar: body >= 50% of range
STRONG_CLOSE = 0.75    # ... and close in the extreme 25% of range
BIG_GAP_ADR = 0.10     # "sizeable" opening gap: >= 10% of ADR


def largest_pullback(bars5, direction: str) -> float:
    """Deepest counter-trend retrace from a running extreme, in price —
    the worst drawdown a with-trend holder would have endured."""
    worst = 0.0
    if direction == "bull":
        peak = bars5[0].h
        for b in bars5:
            peak = max(peak, b.h)
            worst = max(worst, peak - b.l)
    else:
        trough = bars5[0].l
        for b in bars5:
            trough = min(trough, b.l)
            worst = max(worst, b.h - trough)
    return worst


def is_strong(bar, direction: str) -> bool:
    """A strong trend bar in `direction` — large body, close near the
    extreme (the Brooks 'strong trend bar')."""
    rng = bar.h - bar.l
    if rng <= 0:
        return False
    body = abs(bar.c - bar.o) / rng
    if direction == "bull":
        return (bar.c > bar.o and body >= STRONG_BODY
                and (bar.c - bar.l) / rng >= STRONG_CLOSE)
    return (bar.c < bar.o and body >= STRONG_BODY
            and (bar.h - bar.c) / rng >= STRONG_CLOSE)


def describe(rows: list[dict], label: str, baseline: float | None = None) -> None:
    if not rows:
        print(f"  {label:38s} n=0")
        return
    cpos = np.array([r["close_pos"] for r in rows])
    run = np.array([r["run_adr"] for r in rows])
    pb = np.array([r["pullback_adr"] for r in rows])
    trended = (cpos >= TREND_CLOSE).mean()
    extra = f"  (baseline {baseline:.0%})" if baseline is not None else ""
    print(f"  {label:38s} n={len(rows):4d}  trended={trended:.0%}{extra}  "
          f"med run={np.median(run):+.2f}ADR  med close-pos={np.median(cpos):.0%}  "
          f"med pullback={np.median(pb):.2f}ADR")


def main() -> int:
    files = sorted(BARS_CACHE.glob("*.json"))

    # parse + ADR per symbol; keep dates for prior-close gap computation
    ranges: dict[str, list[float]] = {}
    by_symbol: dict[str, list[tuple[str, list]]] = {}
    for cf in files:
        try:
            bars1 = json.loads(cf.read_text())
        except Exception:
            continue
        if not bars1:
            continue
        sym, date = cf.stem.rsplit("_", 1)
        bars5 = aggregate_5m(bars1)
        if len(bars5) < MIN_BARS:
            continue
        ranges.setdefault(sym, []).append(
            max(b.h for b in bars5) - min(b.l for b in bars5))
        by_symbol.setdefault(sym, []).append((date, bars5))
    adr = {s: sum(v) / len(v) for s, v in ranges.items() if v}

    n_sessions = sum(len(v) for v in by_symbol.values())
    cohort: list[dict] = []
    all_close_pos: list[float] = []
    lod_in_win = hod_in_win = 0

    for sym, sessions in by_symbol.items():
        a = adr.get(sym)
        if not a or a <= 0:
            continue
        sessions.sort(key=lambda x: x[0])
        prev_close: float | None = None
        for date, bars5 in sessions:
            lows = [b.l for b in bars5]
            highs = [b.h for b in bars5]
            lod_i = min(range(len(lows)), key=lambda i: lows[i])
            hod_i = max(range(len(highs)), key=lambda i: highs[i])
            lod, hod = lows[lod_i], highs[hod_i]
            rng = hod - lod
            op, cl = bars5[0].o, bars5[-1].c
            gap_adr = (op - prev_close) / a if prev_close else None
            prev_close = cl
            if rng <= 0:
                continue

            if lod_i < EXTREME_WINDOW:
                lod_in_win += 1
            if hod_i < EXTREME_WINDOW:
                hod_in_win += 1
            all_close_pos.append((cl - lod) / rng if hod_i >= lod_i
                                 else (hod - cl) / rng)

            direction = None
            if lod_i < EXTREME_WINDOW <= hod_i:
                direction = "bull"
            elif hod_i < EXTREME_WINDOW <= lod_i:
                direction = "bear"
            if direction is None:
                continue

            if direction == "bull":
                run, net = hod - op, cl - op
                close_pos = (cl - lod) / rng
                extreme_bar = lod_i
            else:
                run, net = op - lod, op - cl
                close_pos = (hod - cl) / rng
                extreme_bar = hod_i

            cohort.append({
                "symbol": sym, "direction": direction,
                "extreme_bar": extreme_bar,
                "run_adr": run / a, "net_adr": net / a,
                "close_pos": close_pos,
                "pullback_adr": largest_pullback(bars5, direction) / a,
                "strong_first_bar": is_strong(bars5[0], direction),
                "gap_adr": gap_adr,
            })

    print(f"{n_sessions} sessions, ADR for {len(adr)} symbols\n")
    print("HOW OFTEN IS THE EXTREME EARLY (5-min bar 1-2):")
    print(f"  low  of day in bar 1-2: {lod_in_win:5d} = {lod_in_win/n_sessions:.1%}")
    print(f"  high of day in bar 1-2: {hod_in_win:5d} = {hod_in_win/n_sessions:.1%}")
    if not cohort:
        print("\nno trend-from-open cohort days found")
        return 0

    base_trended = (np.array(all_close_pos) >= TREND_CLOSE).mean()
    bull = sum(1 for r in cohort if r["direction"] == "bull")
    print(f"\nTREND-FROM-OPEN COHORT (one extreme in bar 1-2, the other later):")
    print(f"  {len(cohort)} days = {len(cohort)/n_sessions:.1%} of sessions "
          f"({bull} bull, {len(cohort)-bull} bear)\n")
    print(f"ALL-DAYS BASELINE: closed in far 30% of range {base_trended:.0%}\n")

    print("PLAIN COHORT:")
    describe(cohort, "extreme in bar 1-2", base_trended)

    print("\nBROOKS QUALIFIER 1 - STRONG FIRST TREND BAR:")
    describe([r for r in cohort if r["strong_first_bar"]], "strong first bar")
    describe([r for r in cohort if not r["strong_first_bar"]], "weak first bar")

    print("\nBROOKS QUALIFIER 2 - SIZEABLE OPENING GAP:")
    gapped = [r for r in cohort if r["gap_adr"] is not None]
    describe([r for r in gapped if abs(r["gap_adr"]) >= BIG_GAP_ADR],
             f"gap >= {BIG_GAP_ADR:.0%} ADR")
    describe([r for r in gapped if abs(r["gap_adr"]) < BIG_GAP_ADR],
             f"gap < {BIG_GAP_ADR:.0%} ADR")

    print("\nBROOKS STRONG VARIANT - BOTH (gap + strong first bar):")
    describe([r for r in gapped if r["strong_first_bar"]
              and abs(r["gap_adr"]) >= BIG_GAP_ADR], "gap + strong first bar")
    describe([r for r in gapped if not r["strong_first_bar"]
              and abs(r["gap_adr"]) < BIG_GAP_ADR], "no gap + weak first bar")

    print("\nBY WHICH BAR HOLDS THE EXTREME:")
    describe([r for r in cohort if r["extreme_bar"] == 0], "extreme in bar 1")
    describe([r for r in cohort if r["extreme_bar"] == 1], "extreme in bar 2")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
