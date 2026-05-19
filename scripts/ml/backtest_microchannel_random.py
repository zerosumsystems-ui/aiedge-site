#!/usr/bin/env python3
"""Bias-checked backtest of the microchannel-pullback refinement.

Runs on the random, un-curated, survivorship-complete Polygon sample
(scripts/ml/fetch_polygon_sample.py) — NOT the curated /spikes gallery.
It is built to answer every bias raised against the gallery study:

  - Random sample — symbol-days drawn at random, not hand-picked.
  - Survivorship-complete — the Polygon draw includes delisted names.
  - Out-of-sample — an explicit walk-forward date split; the verdict
    rests on the held-out cohort, not the in-sample fit.
  - Single pre-registered variant — variant B (tight stop, microchannel
    measured move) was chosen on the pilot BEFORE this corpus was
    fetched. A and C are reported as secondary / exploratory only.
  - Bootstrap confidence intervals on every expectancy — a result whose
    95% CI crosses zero is not an edge.

Execution model matches backtest_spike.py (commission + slippage).

Usage:
    python3 scripts/ml/backtest_microchannel_random.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "live"))
from pullback_detector import Bar  # noqa: E402
from spike_detector import detect_spikes  # noqa: E402
from microchannel_pullback import TICK, detect_microchannel_pullback  # noqa: E402
from backtest_spike import aggregate_5m  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
CACHE_DIR = ROOT / "artifacts" / "backtest" / "bars_1m"
MANIFEST = ROOT / "artifacts" / "backtest" / "polygon_sample_manifest.json"
REPORT_OUT = ROOT / "artifacts" / "backtest" / "microchannel_random_report.json"

# Execution model — identical to backtest_spike.py.
COMMISSION_PER_SHARE = 0.005
ENTRY_SLIPPAGE_BPS = 2.0
STOP_SLIPPAGE_BPS = 4.0

# Pre-registered before this corpus was fetched.
PRIMARY_VARIANT = "B"
OOS_START = "2024-11-19"      # last 18 months of the 5y window — held out
RANDOM_STATE = 17

VARIANTS = ("A", "B", "C")
VARIANT_LABEL = {
    "A": "tight stop, 5-min target",
    "B": "tight stop, microchannel measured move",
    "C": "original 5-min stop & target",
}


def to_bars(rows):
    return [Bar(t=r["t"], o=r["o"], h=r["h"], l=r["l"], c=r["c"]) for r in rows]


def simulate(direction, entry, stop, target, bars, fire_index):
    """First of {stop, target} hit wins; a straddle is scored stopped;
    an unresolved trade exits at the last close. Returns net R."""
    long = direction == "long"
    risk = (entry - stop) if long else (stop - entry)
    if risk <= 0:
        return None
    es = ENTRY_SLIPPAGE_BPS / 1e4
    ss = STOP_SLIPPAGE_BPS / 1e4
    entry_fill = entry * (1 + es) if long else entry * (1 - es)

    exit_price = exit_reason = None
    for b in bars[fire_index:]:
        if long:
            hit_stop, hit_tgt = b.l <= stop, b.h >= target
        else:
            hit_stop, hit_tgt = b.h >= stop, b.l <= target
        if hit_stop:
            exit_price = stop * (1 - ss) if long else stop * (1 + ss)
            exit_reason = "stop_straddle" if hit_tgt else "stop"
            break
        if hit_tgt:
            exit_price, exit_reason = target, "target"
            break
    if exit_price is None:
        last_c = bars[-1].c
        exit_price = last_c * (1 - es) if long else last_c * (1 + es)
        exit_reason = "time"

    gross = (exit_price - entry_fill) if long else (entry_fill - exit_price)
    net_r = gross / risk - (2 * COMMISSION_PER_SHARE) / risk
    return {"exit_reason": exit_reason, "net_r": round(net_r, 4)}


def variant_levels(variant, direction, mc, sig):
    long = direction == "long"
    entry = mc.entry_price
    tight = (round(mc.pullback_extreme - TICK, 4) if long
             else round(mc.pullback_extreme + TICK, 4))
    if variant == "A":
        return tight, sig.target_price
    if variant == "B":
        tgt = (round(entry + mc.micro_leg_height, 4) if long
               else round(entry - mc.micro_leg_height, 4))
        return tight, tgt
    return sig.stop_price, sig.target_price


def bootstrap_ci(values, n=5000):
    if len(values) < 2:
        return [float("nan"), float("nan")]
    rng = np.random.default_rng(RANDOM_STATE)
    arr = np.asarray(values, dtype=float)
    means = [rng.choice(arr, size=len(arr), replace=True).mean() for _ in range(n)]
    return [round(float(np.percentile(means, 2.5)), 4),
            round(float(np.percentile(means, 97.5)), 4)]


def summarize(trades, label):
    """trades: list of dicts with net_r + exit_reason."""
    if not trades:
        return {"label": label, "n": 0}
    r = np.array([t["net_r"] for t in trades], dtype=float)
    n_target = sum(1 for t in trades if t["exit_reason"] == "target")
    wins = r[r > 0]
    losses = r[r <= 0]
    ci = bootstrap_ci(r)
    return {
        "label": label,
        "n": len(trades),
        "target_hit_rate": round(n_target / len(trades), 4),
        "win_rate": round(float((r > 0).mean()), 4),
        "expectancy_r": round(float(r.mean()), 4),
        "expectancy_ci95": ci,
        "ci_crosses_zero": bool(ci[0] <= 0 <= ci[1]),
        "profit_factor": (round(float(wins.sum() / -losses.sum()), 3)
                          if len(losses) and losses.sum() < 0 else None),
        "total_r": round(float(r.sum()), 2),
    }


def main() -> int:
    if not MANIFEST.exists():
        print(f"ERROR: {MANIFEST} not found — run fetch_polygon_sample.py first",
              file=sys.stderr)
        return 2
    manifest = json.loads(MANIFEST.read_text())
    sample = manifest["sample"]
    print(f"Scanning {len(sample)} random sessions for spikes...")

    # trades[variant] = list of trade dicts carrying segmentation tags.
    trades = {v: [] for v in VARIANTS}
    n_spikes = 0
    n_sessions = 0

    for entry in sample:
        cache = CACHE_DIR / f"{entry['symbol']}_{entry['session_date']}.json"
        if not cache.exists():
            continue
        try:
            rows = json.loads(cache.read_text())
        except Exception:
            continue
        if len(rows) < 30:
            continue
        n_sessions += 1
        bars1 = to_bars(rows)
        bars5 = aggregate_5m(rows)
        if len(bars5) < 4:
            continue

        for sig in detect_spikes(bars5):
            n_spikes += 1
            spike_open = bars5[sig.spike_start_index].t
            s1 = next((i for i, b in enumerate(bars1) if b.t >= spike_open), None)
            if s1 is None:
                continue
            mc = detect_microchannel_pullback(bars1, s1, 1, sig.direction)
            if mc is None:
                continue
            for v in VARIANTS:
                stop, target = variant_levels(v, sig.direction, mc, sig)
                if sig.direction == "long" and target <= mc.entry_price:
                    continue
                if sig.direction == "short" and target >= mc.entry_price:
                    continue
                sim = simulate(sig.direction, mc.entry_price, stop, target,
                               bars1, mc.fire_index)
                if sim is None:
                    continue
                sim.update({
                    "session_date": entry["session_date"],
                    "is_opening": sig.is_opening,
                    "oos": entry["session_date"] >= OOS_START,
                })
                trades[v].append(sim)

    print(f"  {n_sessions} sessions, {n_spikes} spikes, "
          f"{len(trades[PRIMARY_VARIANT])} {PRIMARY_VARIANT}-trades")

    def cohort(v, pred, label):
        return summarize([t for t in trades[v] if pred(t)], label)

    # Primary hypothesis: variant B, opening spikes, split in/out of sample.
    primary = {
        "all": cohort(PRIMARY_VARIANT, lambda t: True, "all spikes"),
        "opening": cohort(PRIMARY_VARIANT, lambda t: t["is_opening"],
                          "opening spikes"),
        "opening_in_sample": cohort(
            PRIMARY_VARIANT, lambda t: t["is_opening"] and not t["oos"],
            "opening · in-sample"),
        "opening_out_of_sample": cohort(
            PRIMARY_VARIANT, lambda t: t["is_opening"] and t["oos"],
            "opening · OUT-OF-SAMPLE"),
    }
    secondary = {
        v: cohort(v, lambda t: t["is_opening"], f"variant {v} — opening")
        for v in VARIANTS if v != PRIMARY_VARIANT
    }

    oos = primary["opening_out_of_sample"]
    verdict = (
        "no edge — out-of-sample 95% CI crosses zero"
        if oos["n"] == 0 or oos.get("ci_crosses_zero", True)
        else ("positive edge — out-of-sample 95% CI is entirely above zero"
              if oos["expectancy_r"] > 0
              else "negative — out-of-sample 95% CI is entirely below zero")
    )

    report = {
        "generated_from": "scripts/ml/backtest_microchannel_random.py",
        "corpus": {
            "source": "random Polygon 1-min sample (survivorship-complete)",
            "sessions_scanned": n_sessions,
            "spikes_detected": n_spikes,
            "sample_params": manifest.get("params"),
        },
        "method": {
            "primary_variant": PRIMARY_VARIANT,
            "primary_variant_label": VARIANT_LABEL[PRIMARY_VARIANT],
            "pre_registered": "variant B chosen on the pilot before this fetch",
            "out_of_sample_start": OOS_START,
            "execution": {
                "commission_per_share": COMMISSION_PER_SHARE,
                "entry_slippage_bps": ENTRY_SLIPPAGE_BPS,
                "stop_slippage_bps": STOP_SLIPPAGE_BPS,
            },
        },
        "primary": primary,
        "secondary_variants": secondary,
        "verdict": verdict,
    }
    REPORT_OUT.parent.mkdir(parents=True, exist_ok=True)
    REPORT_OUT.write_text(json.dumps(report, indent=2) + "\n")

    def line(s):
        if s["n"] == 0:
            print(f"  {s['label']:28s} n=0")
            return
        ci = s["expectancy_ci95"]
        flag = "  <- CI crosses 0" if s["ci_crosses_zero"] else "  <- CI clear of 0"
        print(f"  {s['label']:28s} n={s['n']:5d}  "
              f"exp={s['expectancy_r']:+.3f}R  "
              f"CI95[{ci[0]:+.3f},{ci[1]:+.3f}]  "
              f"tgt={s['target_hit_rate']:.3f}{flag}")

    print(f"\n=== BIAS-CHECKED MICROCHANNEL-PULLBACK BACKTEST ===")
    print(f"  primary variant: {PRIMARY_VARIANT} ({VARIANT_LABEL[PRIMARY_VARIANT]})")
    for k in ("all", "opening", "opening_in_sample", "opening_out_of_sample"):
        line(primary[k])
    print("  -- secondary variants (opening, exploratory) --")
    for v in secondary:
        line(secondary[v])
    print(f"\n  VERDICT: {verdict}")
    print(f"  report: {REPORT_OUT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
