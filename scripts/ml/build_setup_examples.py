#!/usr/bin/env python3
"""Build the curated example gallery for every Brooks setup.

For each setup this finds a balanced spread of detected instances on the
downloaded analogs corpus — target hits, breakeven scratches and stops,
long and short — simulates the scaling-in trade, and writes one combined
JSON the /setup-catalog page renders in the /spikes card format.

Output: public/setup-examples.json

Usage:
    python3 scripts/ml/build_setup_examples.py
"""

from __future__ import annotations

import importlib
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "live"))
sys.path.insert(0, str(Path(__file__).resolve().parent))

ROOT = Path(__file__).resolve().parents[2]
BT_DIR = ROOT / "artifacts" / "backtest"
OUT = ROOT / "public" / "setup-examples.json"
PER_SETUP = 4

# (key, label, type, backtest module, report file, report key, signal source)
SETUPS = [
    ("spike", "Spike", "trend origin", "backtest_spike",
     "spike_backtest_report.json", "all_spikes", "spike_detector:detect_spikes"),
    ("tfo", "Trend-from-the-open", "trend origin", "backtest_tfo_scaled",
     "tfo_scaled_backtest_report.json", "all", None),
    ("pullback", "Small pullback", "continuation", "backtest_pullback",
     "pullback_scaled_backtest_report.json", "all", None),
    ("h2l2", "High-2 / Low-2", "continuation", "backtest_h2l2",
     "h2l2_scaled_backtest_report.json", "all", None),
    ("ii", "Inside bar (ii / iii)", "breakout", "backtest_ii",
     "ii_scaled_backtest_report.json", "all", None),
    ("wedge", "Wedge / three-push", "reversal", "backtest_wedge",
     "wedge_scaled_backtest_report.json", "all", None),
    ("double_top", "Double top / bottom", "reversal", "backtest_double_top",
     "double_top_scaled_backtest_report.json", "all", None),
    ("breakout_pullback", "Breakout pullback", "continuation",
     "backtest_breakout_pullback",
     "breakout_pullback_scaled_backtest_report.json", "all", None),
    ("trading_range", "Trading-range breakout", "breakout",
     "backtest_trading_range",
     "trading_range_scaled_backtest_report.json", "all", None),
    ("channel_overshoot", "Channel-line overshoot", "reversal",
     "backtest_channel_overshoot",
     "channel_overshoot_scaled_backtest_report.json", "all", None),
    ("mtr", "Major trend reversal", "reversal", "backtest_mtr",
     "mtr_scaled_backtest_report.json", "all", None),
    ("final_flag", "Final flag", "reversal", "backtest_final_flag",
     "final_flag_scaled_backtest_report.json", "all", None),
    ("climax", "Climax / exhaustion", "reversal", "backtest_climax",
     "climax_scaled_backtest_report.json", "all", None),
]


def _signal_getter(source):
    if source is None:
        return lambda mod, bars: mod.setups_for_session(bars)
    mod_name, fn_name = source.split(":")
    fn = getattr(importlib.import_module(mod_name), fn_name)
    return lambda mod, bars: fn(bars)


def _example(mod, symbol, date, bars, sig, sim) -> dict:
    wide_stop, tranches = mod.scale_in_levels(sig)
    return {
        "symbol": symbol,
        "session_date": date,
        "direction": sig.direction,
        "bars": [{"t": b.t, "o": b.o, "h": b.h, "l": b.l, "c": b.c} for b in bars],
        "entry_ts": bars[sig.entry_index].t,
        "entry_price": round(sig.entry_price, 4),
        "stop_price": wide_stop,
        "target_price": round(sig.target_price, 4),
        "scale_in_prices": tranches,
        "tranches_filled": sim["tranches_filled"],
        "exit_reason": sim["exit_reason"],
        "net_r": sim["net_r"],
    }


def _curate(mod, get_signals, sessions) -> list[dict]:
    """A balanced spread — long/short x target/scratch/stop — picked
    deterministically (first match per bucket), then filled to PER_SETUP."""
    buckets: dict[tuple, dict] = {}
    spare: list[dict] = []
    for symbol, date, bars in sessions:
        for sig in get_signals(mod, bars):
            sim = mod.simulate_scaled(sig, bars)
            if sim is None or "tranches_filled" not in sim:
                continue
            r = sim["exit_reason"]
            cls = "target" if r == "target" else (
                "scratch" if r.startswith("breakeven") else "stop")
            key = (sig.direction, cls)
            ex = _example(mod, symbol, date, bars, sig, sim)
            if key not in buckets:
                buckets[key] = ex
            else:
                spare.append(ex)
        if len(buckets) >= 6 and len(spare) >= PER_SETUP:
            break
    picked = list(buckets.values())[:PER_SETUP]
    for ex in spare:
        if len(picked) >= PER_SETUP:
            break
        picked.append(ex)
    return picked


def main() -> int:
    spike_bt = importlib.import_module("backtest_spike")
    sessions = spike_bt.load_sessions()
    print(f"Loaded {len(sessions)} sessions")

    out_setups = []
    for key, label, kind, mod_name, report_file, report_key, source in SETUPS:
        mod = importlib.import_module(mod_name)
        verdict = {}
        rp = BT_DIR / report_file
        if rp.exists():
            rep = json.loads(rp.read_text())
            s = rep.get(report_key, {})
            verdict = {
                "n": s.get("n"),
                "expectancy_r": s.get("expectancy_r"),
                "profit_factor": s.get("profit_factor"),
                "win_rate": s.get("win_rate"),
            }
        examples = _curate(mod, _signal_getter(source), sessions)
        out_setups.append({
            "key": key, "label": label, "type": kind,
            "verdict": verdict, "examples": examples,
        })
        print(f"  {key}: {len(examples)} examples, "
              f"exp={verdict.get('expectancy_r')}R")

    OUT.write_text(json.dumps({
        "generated_from": "scripts/ml/build_setup_examples.py",
        "sessions_tested": len(sessions),
        "setups": out_setups,
    }, indent=2) + "\n")
    print(f"\nWrote {OUT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
