#!/usr/bin/env python3
"""Backtest the Brooks spike-exhaustion FADE — a counter-trend setup.

Every setup tested so far — trend-from-the-open, opening-spike
continuation, with-trend pullback — trades *with* momentum, and every
one is null to negative. Brooks' own primary source predicts exactly
that: "about 80 percent of trading-range breakouts fail"
(src/content/blog/traders-equation.md). And the ML layer of the TFO
backtest is anti-predictive — its highest-conviction (biggest, most
climactic) picks fail hardest. Brooks names the mechanism directly:

  - "A bear spike can be a buying opportunity."        (brooks-wisdom)
  - "Second legs are often reversals."
  - "When a climax occurs after a trend has been going on for many
     bars, the odds of a two-legged sideways to down correction
     ... increase."

So this tests the *opposite* trade to backtest_spike.py: when the
spike detector flags a climactic spike (>=3 strong bars), FADE it —
go counter to the spike, expecting the climax to revert.

Pre-registered (fixed before results were seen), one setup, one run:

  spike       = scripts/ml/spike_detector.py (>=3 strong bars)
  direction   = OPPOSITE the spike (down-spike -> long, up-spike -> short)
  entry       = open of the first 5-min bar after the spike completes
  stop        = one tick beyond the spike's exhaustion extreme — if
                price makes a new extreme the climax is still running
  target      = pre-registered R-grid {1, 1.5, 2}R x {2h, eod};
                primary 1R/2h (Brooks: a reversal is "good for at
                least a scalp")
  risk floor  = a stop tighter than 5 bps of price is skipped

Detection on 5-min RTH bars; fills simulated on 1-min bars. Costs and
the conservative straddle rule are reused verbatim from the other
engines. Reuses the artifacts/backtest/bars_1m/ cache — no new fetch.

Usage:
    python3 scripts/ml/backtest_fade.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "live"))
from spike_detector import detect_spikes  # noqa: E402

_HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(_HERE))
import backtest_pullback as pb  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
BARS_CACHE = ROOT / "artifacts" / "backtest" / "bars_1m"
OUT_DIR = ROOT / "artifacts" / "backtest"

COMMISSION_PER_SHARE = 0.005
ENTRY_SLIPPAGE_BPS = 2.0
STOP_SLIPPAGE_BPS = 4.0
TICK = 0.01
MIN_RISK_FRAC = 0.0005
BAR_5M = 300

TARGET_R_GRID = [1.0, 1.5, 2.0]
HORIZON_GRID = {"2h": 24, "eod": 78}
PRIMARY_TARGET_R = 1.0
PRIMARY_HORIZON = "2h"


def simulate_fade(spike_dir: str, spike_extreme: float, entry_ts: int,
                  bars1: list[dict], target_r: float, horizon_bars: int,
                  cost_mult: float = 1.0) -> dict | None:
    """Fade a completed spike. spike_dir is the spike's own direction;
    the trade is the opposite. spike_extreme is the spike's exhaustion
    high/low — the stop sits one tick beyond it."""
    fade = "short" if spike_dir == "long" else "long"

    entry_1m = sorted(
        (b for b in bars1 if entry_ts <= int(b["t"]) < entry_ts + BAR_5M),
        key=lambda b: int(b["t"]),
    )
    if not entry_1m:
        return None
    ideal_entry = float(entry_1m[0]["o"])
    if ideal_entry <= 0:
        return None

    if fade == "long":
        stop = spike_extreme - TICK
        risk = ideal_entry - stop
    else:
        stop = spike_extreme + TICK
        risk = stop - ideal_entry
    if risk <= 0 or risk < MIN_RISK_FRAC * ideal_entry:
        return None

    es = ENTRY_SLIPPAGE_BPS * cost_mult / 1e4
    ss = STOP_SLIPPAGE_BPS * cost_mult / 1e4
    entry_fill = ideal_entry * (1 + es) if fade == "long" \
        else ideal_entry * (1 - es)
    target = (ideal_entry + target_r * risk) if fade == "long" \
        else (ideal_entry - target_r * risk)

    horizon_end = entry_ts + horizon_bars * BAR_5M
    path = sorted(
        (b for b in bars1 if entry_ts <= int(b["t"]) < horizon_end),
        key=lambda b: int(b["t"]),
    )
    if not path:
        return None

    exit_price = exit_reason = None
    for b in path:
        hi, lo = float(b["h"]), float(b["l"])
        if fade == "long":
            hit_stop, hit_tgt = lo <= stop, hi >= target
        else:
            hit_stop, hit_tgt = hi >= stop, lo <= target
        if hit_stop and hit_tgt:
            exit_price = stop * (1 - ss) if fade == "long" else stop * (1 + ss)
            exit_reason = "stop_straddle"
            break
        if hit_stop:
            exit_price = stop * (1 - ss) if fade == "long" else stop * (1 + ss)
            exit_reason = "stop"
            break
        if hit_tgt:
            exit_price = target
            exit_reason = "target"
            break
    if exit_price is None:
        last = float(path[-1]["c"])
        exit_price = last * (1 - es) if fade == "long" else last * (1 + es)
        exit_reason = "time"

    gross = (exit_price - entry_fill) if fade == "long" \
        else (entry_fill - exit_price)
    commission_r = (2 * COMMISSION_PER_SHARE * cost_mult) / risk
    return {
        "direction": fade,
        "exit_reason": exit_reason,
        "risk_per_share": round(risk, 4),
        "net_r": round(gross / risk - commission_r, 4),
    }


def main() -> int:
    cache_files = sorted(BARS_CACHE.glob("*.json"))
    if not cache_files:
        print(f"ERROR: no cached 1-min bars in {BARS_CACHE}", file=sys.stderr)
        return 2
    print(f"Scanning {len(cache_files)} cached sessions for spikes to fade...",
          flush=True)

    # detect once: (spike_dir, spike_extreme, entry_ts, is_opening, day, bars1)
    detected: list[tuple] = []
    symbols: set[str] = set()
    for cf in cache_files:
        try:
            bars1 = json.loads(cf.read_text())
        except Exception:
            continue
        if not bars1:
            continue
        symbol, day = cf.stem.rsplit("_", 1)
        symbols.add(symbol)
        bars5 = pb.aggregate_5m(bars1)
        for sig in detect_spikes(bars5):
            lo = sig.spike_start_index
            hi = lo + sig.spike_bar_count
            spike_bars = bars5[lo:hi]
            if not spike_bars or hi >= len(bars5):
                continue  # need a bar after the spike to enter on
            if sig.direction == "long":      # up-spike
                extreme = max(b.h for b in spike_bars)
            else:                            # down-spike
                extreme = min(b.l for b in spike_bars)
            entry_ts = bars5[hi].t
            detected.append((sig.direction, extreme, entry_ts,
                             sig.is_opening, day, bars1))
    print(f"  {len(detected)} spikes to fade", flush=True)

    def run_cell(target_r: float, horizon_bars: int, cost_mult: float = 1.0):
        out = []
        for spike_dir, extreme, entry_ts, is_open, day, bars1 in detected:
            sim = simulate_fade(spike_dir, extreme, entry_ts, bars1,
                                target_r, horizon_bars, cost_mult)
            if sim is None:
                continue
            sim["session_date"] = day
            sim["is_opening"] = is_open
            out.append(sim)
        return out

    print("Running grid (target R x horizon)...", flush=True)
    grid = []
    for hname, hbars in HORIZON_GRID.items():
        for tr in TARGET_R_GRID:
            s = pb.summarize(run_cell(tr, hbars), f"{tr}R / {hname}")
            s["target_r"], s["horizon"] = tr, hname
            grid.append(s)
            print(f"  {tr}R/{hname}: n={s['n']} exp={s.get('expectancy_r')}"
                  f" win={s.get('win_rate')} pf={s.get('profit_factor')}",
                  flush=True)

    horizon = HORIZON_GRID[PRIMARY_HORIZON]
    ledger = run_cell(PRIMARY_TARGET_R, horizon)
    longs = [t for t in ledger if t["direction"] == "long"]
    shorts = [t for t in ledger if t["direction"] == "short"]
    opening = [t for t in ledger if t["is_opening"]]

    cost_sens = []
    for cm in (1.0, 2.0, 3.0):
        s = pb.summarize(run_cell(PRIMARY_TARGET_R, horizon, cost_mult=cm),
                         f"costs x{cm}")
        s["cost_mult"] = cm
        cost_sens.append(s)

    by_month: dict[str, list[dict]] = {}
    for t in ledger:
        by_month.setdefault(t["session_date"][:7], []).append(t)

    report = {
        "config": {
            "setup": "Brooks spike-exhaustion fade (counter-trend)",
            "entry": "open of the first 5-min bar after the spike",
            "stop": "one tick beyond the spike exhaustion extreme",
            "primary_target_r": PRIMARY_TARGET_R,
            "primary_horizon": PRIMARY_HORIZON,
            "commission_per_share": COMMISSION_PER_SHARE,
            "entry_slippage_bps": ENTRY_SLIPPAGE_BPS,
            "stop_slippage_bps": STOP_SLIPPAGE_BPS,
        },
        "coverage": {"sessions_scanned": len(cache_files),
                     "symbols": sorted(symbols),
                     "spikes_detected": len(detected)},
        "all_trades": pb.summarize(ledger, f"all fades ({PRIMARY_TARGET_R}R/{PRIMARY_HORIZON})"),
        "grid": grid,
        "longs": pb.summarize(longs, "fade longs (down-spikes)"),
        "shorts": pb.summarize(shorts, "fade shorts (up-spikes)"),
        "opening_spikes": pb.summarize(opening, "fades of opening spikes"),
        "cost_sensitivity": cost_sens,
        "by_month": [pb.summarize(by_month[m], m) for m in sorted(by_month)],
    }

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out = OUT_DIR / "fade_backtest_report.json"
    out.write_text(json.dumps(report, indent=2) + "\n")

    def line(s):
        if not s.get("n"):
            print(f"  {s['label']:34s} n=0")
            return
        print(f"  {s['label']:34s} n={s['n']:4d}  exp={s['expectancy_r']:+.3f}R"
              f"  CI{s['expectancy_ci95']}  win={s['win_rate']:.3f}"
              f"  pf={s['profit_factor']}")

    print("\n=== BROOKS SPIKE-EXHAUSTION FADE ===")
    line(report["all_trades"])
    line(report["longs"])
    line(report["shorts"])
    line(report["opening_spikes"])
    a = report["all_trades"]
    lo, hi = a["expectancy_ci95"]
    print(f"  verdict: {'POSITIVE — CI excludes zero' if lo > 0 else 'NEGATIVE — CI excludes zero' if hi < 0 else 'NULL — CI straddles zero'}")
    print(f"\nReport: {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
