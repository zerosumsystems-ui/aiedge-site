#!/usr/bin/env python3
"""Backtest: buy the first opposite close after a spike.

Will's variant of the first pullback. Instead of waiting for the H1 /
L1 resumption (buying strength), this enters on the FIRST counter-trend
close after the spike — buying the weakness as the pullback starts.
Brooks describes the aggressive version: "aggressive bulls bought on a
limit order at and below the low of the prior bar."

  spike      detected by spike_detector (3+ strong same-direction bars)
  entry      market, at the close of the first bar after the spike that
             closes counter to the spike (a bear-bodied bar after a bull
             spike); searched up to MAX_LOOKAHEAD bars out
  stop       1 tick beyond the spike's start extreme (the structural
             Brooks stop validated in the first-pullback work)
  target     scored three ways: a measured move (spike height from the
             spike extreme), reward = risk (+1R), and a scale-out (half
             at +1R, runner to the measured move, runner stop -> breakeven)

1-minute bar-walked execution, commission + slippage (bps and tick
models), reusing the cost machinery from backtest_first_pullback so the
verdict is directly comparable to the H1 first-pullback result.

Usage: python3 scripts/backtest_spike_pullback.py
"""

from __future__ import annotations

import json
import sys

import numpy as np

from backtest_first_pullback import (aggregate_5m, BARS_CACHE, BAR_5M,
                                     COMMISSION_PER_SHARE, _slip, summarize)
from spike_detector import detect_spikes
from tfo_detector import Bar5m  # noqa: F401

MAX_LOOKAHEAD = 5      # search this many bars past the spike for the
                       # first opposite close (Brooks: a breakout
                       # pullback is "one to about five bars")
TICK = 0.01


def first_opposite_close(bars5, spike) -> int | None:
    """Index of the first bar after the spike that closes counter to
    the spike direction, or None within MAX_LOOKAHEAD."""
    last = spike.spike_start_index + spike.spike_bar_count - 1
    for i in range(last + 1, min(last + 1 + MAX_LOOKAHEAD, len(bars5))):
        b = bars5[i]
        if spike.direction == "long" and b.c < b.o:
            return i
        if spike.direction == "short" and b.c > b.o:
            return i
    return None


def simulate(bars1, entry_ts, entry_price, stop, target, direction,
             model="bps") -> dict | None:
    """Market entry at a bar's close; walk 1-min bars from the next bar.
    First of {stop, target} wins; a straddle is scored stopped."""
    risk = (entry_price - stop) if direction == "long" else (stop - entry_price)
    if risk <= 0:
        return None
    if direction == "long":
        entry_fill = entry_price + _slip(entry_price, "entry", model)
    else:
        entry_fill = entry_price - _slip(entry_price, "entry", model)
    path = sorted((b for b in bars1 if int(b["t"]) >= entry_ts + BAR_5M),
                  key=lambda b: int(b["t"]))
    if not path:
        return None
    exit_price = exit_reason = None
    for b in path:
        hi, lo = float(b["h"]), float(b["l"])
        if direction == "long":
            hit_stop, hit_tgt = lo <= stop, hi >= target
        else:
            hit_stop, hit_tgt = hi >= stop, lo <= target
        if hit_stop:
            exit_price = (stop - _slip(stop, "stop", model) if direction == "long"
                          else stop + _slip(stop, "stop", model))
            exit_reason = "stop_straddle" if hit_tgt else "stop"
            break
        if hit_tgt:
            exit_price = target
            exit_reason = "target"
            break
    if exit_price is None:
        last = float(path[-1]["c"])
        exit_price = (last - _slip(last, "entry", model) if direction == "long"
                      else last + _slip(last, "entry", model))
        exit_reason = "time"
    gross = (exit_price - entry_fill) if direction == "long" else (entry_fill - exit_price)
    return {"exit_reason": exit_reason,
            "net_r": round(gross / risk - (2 * COMMISSION_PER_SHARE) / risk, 4)}


def simulate_scaleout(bars1, entry_ts, entry_price, stop, final_target,
                      direction, model="bps") -> dict | None:
    """Half off at +1R, runner stop to breakeven, runner to the
    measured move. Market entry at the bar close."""
    risk = (entry_price - stop) if direction == "long" else (stop - entry_price)
    if risk <= 0:
        return None
    if direction == "long":
        entry_fill = entry_price + _slip(entry_price, "entry", model)
        partial = entry_price + risk
    else:
        entry_fill = entry_price - _slip(entry_price, "entry", model)
        partial = entry_price - risk
    path = sorted((b for b in bars1 if int(b["t"]) >= entry_ts + BAR_5M),
                  key=lambda b: int(b["t"]))
    if not path:
        return None
    cur_stop = stop
    partial_done = False
    p1 = p2 = None
    reason = None
    for b in path:
        hi, lo = float(b["h"]), float(b["l"])
        if not partial_done:
            if direction == "long":
                hit_stop, hit_p = lo <= cur_stop, hi >= partial
            else:
                hit_stop, hit_p = hi >= cur_stop, lo <= partial
            if hit_stop:
                p1 = p2 = (cur_stop - _slip(cur_stop, "stop", model)
                           if direction == "long"
                           else cur_stop + _slip(cur_stop, "stop", model))
                reason = "stopped_full"
                break
            if hit_p:
                p1 = partial
                partial_done = True
                cur_stop = entry_fill
            continue
        if direction == "long":
            hit_stop, hit_t = lo <= cur_stop, hi >= final_target
        else:
            hit_stop, hit_t = hi >= cur_stop, lo <= final_target
        if hit_stop:
            p2 = (cur_stop - _slip(cur_stop, "stop", model) if direction == "long"
                  else cur_stop + _slip(cur_stop, "stop", model))
            reason = "partial_then_breakeven"
            break
        if hit_t:
            p2 = final_target
            reason = "target"
            break
    if p1 is None:
        last = float(path[-1]["c"])
        p1 = p2 = (last - _slip(last, "entry", model) if direction == "long"
                   else last + _slip(last, "entry", model))
        reason = "time_full"
    elif p2 is None:
        last = float(path[-1]["c"])
        p2 = (last - _slip(last, "entry", model) if direction == "long"
              else last + _slip(last, "entry", model))
        reason = "partial_then_time"
    if direction == "long":
        gross = 0.5 * (p1 - entry_fill) + 0.5 * (p2 - entry_fill)
    else:
        gross = 0.5 * (entry_fill - p1) + 0.5 * (entry_fill - p2)
    return {"exit_reason": reason,
            "net_r": round(gross / risk - (2 * COMMISSION_PER_SHARE) / risk, 4)}


def main() -> int:
    cache_files = sorted(BARS_CACHE.glob("*.json"))
    if not cache_files:
        print(f"ERROR: no cached 1-min bars in {BARS_CACHE}", file=sys.stderr)
        return 2
    print(f"Scanning {len(cache_files)} sessions for spike + first opposite close...")

    variants = ("measured_move", "reward=risk", "scale-out")
    models = ("bps", "tick")
    buckets: dict[tuple, list[dict]] = {(v, m): [] for v in variants for m in models}
    by_month: dict[str, list[dict]] = {}      # measured_move / bps
    n_spikes = n_signals = 0
    for cf in cache_files:
        try:
            bars1 = json.loads(cf.read_text())
        except Exception:
            continue
        if not bars1:
            continue
        symbol, session_date = cf.stem.rsplit("_", 1)
        bars5 = aggregate_5m(bars1)
        for spike in detect_spikes(bars5):
            n_spikes += 1
            oi = first_opposite_close(bars5, spike)
            if oi is None:
                continue
            ebar = bars5[oi]
            spike_bars = bars5[spike.spike_start_index:
                               spike.spike_start_index + spike.spike_bar_count]
            spike_hi = max(b.h for b in spike_bars)
            spike_lo = min(b.l for b in spike_bars)
            height = spike_hi - spike_lo
            if spike.direction == "long":
                stop = round(spike_lo - TICK, 4)
                if ebar.l <= stop or ebar.c <= stop:
                    continue                       # breakout already failed
                mm = spike_hi + height
                risk = ebar.c - stop
                rr = ebar.c + risk
            else:
                stop = round(spike_hi + TICK, 4)
                if ebar.h >= stop or ebar.c >= stop:
                    continue
                mm = spike_lo - height
                risk = stop - ebar.c
                rr = ebar.c - risk
            if risk <= 0:
                continue
            n_signals += 1
            tgts = {"measured_move": mm, "reward=risk": rr}
            for m in models:
                for v, tgt in tgts.items():
                    sim = simulate(bars1, ebar.t, ebar.c, stop, tgt,
                                   spike.direction, m)
                    if sim:
                        buckets[(v, m)].append(sim)
                so = simulate_scaleout(bars1, ebar.t, ebar.c, stop, mm,
                                       spike.direction, m)
                if so:
                    buckets[("scale-out", m)].append(so)
            mm_bps = simulate(bars1, ebar.t, ebar.c, stop, mm, spike.direction, "bps")
            if mm_bps:
                by_month.setdefault(session_date[:7], []).append(mm_bps)
    print(f"  {n_spikes} spikes, {n_signals} with a first opposite close\n")

    print("=== BUY THE FIRST OPPOSITE CLOSE AFTER A SPIKE ===")
    for v in variants:
        print(f"\n  [{v}]")
        for m in models:
            s = summarize(buckets[(v, m)], f"{m} slippage")
            if s["n"] == 0:
                print(f"    {m}: n=0")
                continue
            print(f"    {m:5s} n={s['n']:5d}  win={s['win_rate']:.3f}  "
                  f"exp={s['expectancy_r']:+.3f}R  CI{s['expectancy_ci95']}  "
                  f"pf={s['profit_factor']}")
    months = [summarize(by_month[k], k) for k in sorted(by_month)]
    pos = sum(1 for s in months if s["n"] and s["expectancy_r"] > 0)
    print(f"\n  months positive (measured_move, bps): {pos}/{len(months)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
