#!/usr/bin/env python3
"""Bias-checked backtest of the microchannel-pullback refinement.

Runs on the random, un-curated, survivorship-complete Polygon sample
(scripts/ml/fetch_polygon_sample.py) — NOT the curated /spikes gallery.
It is built to answer every bias raised against the gallery study:

  - Random sample — symbol-days drawn at random, not hand-picked.
  - Survivorship-complete — the Polygon draw includes delisted names.
  - Out-of-sample — an explicit walk-forward date split; the verdict
    rests on the held-out cohort, not the in-sample fit.
  - One pre-registered trade design — no variant sweep.
  - Bootstrap confidence intervals + median + outlier share — a result
    whose 95% CI crosses zero, or that one trade carries, is not an edge.

TRADE DESIGN (pre-registered — see the constants below):

  entry  = the 1-minute first-pullback breakout (H1/L1) out of the spike
  stop   = entry -/+ ATR_STOP_K * ATR    (1-min ATR, as of the signal bar)
  target = entry +/- TARGET_R * risk     (a fixed R multiple)

An earlier pass used a "1 tick beyond the pullback" stop; it was
routinely 2-5 cents — inside the spread — so R-multiples exploded and
93% of setups were not executable. An ATR-sized stop is executable by
construction and self-scales to each name's volatility. ATR_STOP_K and
TARGET_R were fixed before this run; the corpus, however, was already
seen, so this is an informed pass, not virgin out-of-sample.

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
from pullback_detector import Bar, _atrs  # noqa: E402
from spike_detector import detect_spikes  # noqa: E402
from microchannel_pullback import detect_microchannel_pullback  # noqa: E402
from backtest_spike import aggregate_5m  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
CACHE_DIR = ROOT / "artifacts" / "backtest" / "bars_1m"
MANIFEST = ROOT / "artifacts" / "backtest" / "polygon_sample_manifest.json"
REPORT_OUT = ROOT / "artifacts" / "backtest" / "microchannel_random_report.json"

# Execution model — identical to backtest_spike.py.
COMMISSION_PER_SHARE = 0.005
ENTRY_SLIPPAGE_BPS = 2.0
STOP_SLIPPAGE_BPS = 4.0

# ----- pre-registered trade design (fixed before this run) ---------------
ATR_LEN = 14            # 1-minute ATR lookback
ATR_STOP_K = 1.5        # stop = entry -/+ ATR_STOP_K * ATR
TARGET_R = 2.0          # target = entry +/- TARGET_R * risk
MIN_RISK_ABS = 0.02     # degenerate-ATR guard — skip if the stop is < 2c
OOS_START = "2024-11-19"   # last 18 months of the 5y window — held out
RANDOM_STATE = 17


def to_bars(rows):
    return [Bar(t=r["t"], o=r["o"], h=r["h"], l=r["l"], c=r["c"]) for r in rows]


def simulate(direction, entry, stop, target, risk, bars, fire_index):
    """First of {stop, target} hit wins; a straddle is scored stopped;
    an unresolved trade exits at the last close. Returns net R."""
    long = direction == "long"
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
    total = float(r.sum())
    return {
        "label": label,
        "n": len(trades),
        "target_hit_rate": round(n_target / len(trades), 4),
        "win_rate": round(float((r > 0).mean()), 4),
        "expectancy_r": round(float(r.mean()), 4),
        "expectancy_ci95": ci,
        "ci_crosses_zero": bool(ci[0] <= 0 <= ci[1]),
        "median_r": round(float(np.median(r)), 4),
        "max_r": round(float(r.max()), 2),
        # Concentration: the largest single trade as a share of total R.
        "top_trade_share": (round(float(r.max() / total), 3)
                            if total > 0 else None),
        "profit_factor": (round(float(wins.sum() / -losses.sum()), 3)
                          if len(losses) and losses.sum() < 0 else None),
        "total_r": round(total, 2),
    }


def assess(oos: dict) -> str:
    """An edge has to clear every bar: enough trades, a 95% CI clear of
    zero, a positive median (not just an outlier-driven mean), and no
    single trade carrying the result."""
    if oos["n"] < 30:
        return "inconclusive — out-of-sample sample too small (n<30)"
    if oos["ci_crosses_zero"]:
        return "no edge — out-of-sample 95% CI crosses zero"
    if oos["median_r"] <= 0:
        return ("no edge — out-of-sample median R is not positive "
                "(mean is outlier-driven)")
    tts = oos.get("top_trade_share")
    if tts is not None and tts > 0.5:
        return "inconclusive — one trade is over half the out-of-sample R"
    if oos["expectancy_r"] <= 0:
        return "negative — out-of-sample expectancy is below zero"
    return ("positive edge — out-of-sample CI clear of zero, median "
            "positive, not outlier-driven")


def main() -> int:
    if not MANIFEST.exists():
        print(f"ERROR: {MANIFEST} not found — run fetch_polygon_sample.py first",
              file=sys.stderr)
        return 2
    manifest = json.loads(MANIFEST.read_text())
    sample = manifest["sample"]
    print(f"Scanning {len(sample)} random sessions for spikes...")

    trades = []
    n_spikes = 0
    n_sessions = 0
    skipped_atr = 0
    skipped_lookahead = 0

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
        atrs = _atrs(bars1, ATR_LEN)

        for sig in detect_spikes(bars5):
            n_spikes += 1
            spike_open = bars5[sig.spike_start_index].t
            s1 = next((i for i, b in enumerate(bars1) if b.t >= spike_open), None)
            if s1 is None:
                continue
            mc = detect_microchannel_pullback(bars1, s1, 1, sig.direction)
            if mc is None:
                continue
            # NO LOOK-AHEAD. The 5-min spike is not a usable signal until
            # its 3rd bar closes — that is when a mechanical observer can
            # know "this is a spike." A 1-minute entry that fires before
            # that is trading on a signal that does not yet exist.
            if sig.spike_start_index + 2 >= len(bars5):
                continue
            confirm_t = bars5[sig.spike_start_index + 2].t + 300
            if bars1[mc.fire_index].t < confirm_t:
                skipped_lookahead += 1
                continue
            # ATR as of the signal bar — the bar before entry, fully
            # closed at entry time (no look-ahead).
            atr = atrs[max(0, mc.fire_index - 1)]
            risk = ATR_STOP_K * atr
            if risk < MIN_RISK_ABS:
                skipped_atr += 1
                continue
            long = sig.direction == "long"
            entry_p = mc.entry_price
            stop = entry_p - risk if long else entry_p + risk
            target = (entry_p + TARGET_R * risk if long
                      else entry_p - TARGET_R * risk)
            sim = simulate(sig.direction, entry_p, stop, target, risk,
                           bars1, mc.fire_index)
            sim.update({
                "session_date": entry["session_date"],
                "is_opening": sig.is_opening,
                "oos": entry["session_date"] >= OOS_START,
            })
            trades.append(sim)

    print(f"  {n_sessions} sessions, {n_spikes} spikes, {len(trades)} trades")
    print(f"  skipped: {skipped_lookahead} look-ahead (entry before the "
          f"5-min spike confirmed), {skipped_atr} degenerate ATR")

    def cohort(pred, label):
        return summarize([t for t in trades if pred(t)], label)

    primary = {
        "all": cohort(lambda t: True, "all spikes"),
        "opening": cohort(lambda t: t["is_opening"], "opening spikes"),
        "opening_in_sample": cohort(
            lambda t: t["is_opening"] and not t["oos"], "opening · in-sample"),
        "opening_out_of_sample": cohort(
            lambda t: t["is_opening"] and t["oos"], "opening · OUT-OF-SAMPLE"),
        "intraday": cohort(lambda t: not t["is_opening"], "intraday spikes"),
    }
    verdict = assess(primary["opening_out_of_sample"])

    report = {
        "generated_from": "scripts/ml/backtest_microchannel_random.py",
        "corpus": {
            "source": "random Polygon 1-min sample (survivorship-complete)",
            "sessions_scanned": n_sessions,
            "spikes_detected": n_spikes,
            "trades": len(trades),
            "skipped_lookahead": skipped_lookahead,
            "lookahead_note": (
                "entries that fired before the 5-min spike's 3rd bar "
                "closed — i.e. before the spike was a usable signal — are "
                "discarded; including them is look-ahead bias"),
            "sample_params": manifest.get("params"),
        },
        "trade_design": {
            "entry": "1-min first-pullback breakout (H1/L1) out of the spike",
            "stop": f"entry -/+ {ATR_STOP_K} * ATR({ATR_LEN}) 1-min",
            "target": f"{TARGET_R}R",
            "atr_as_of": "signal bar (no look-ahead)",
            "pre_registered": "ATR_STOP_K and TARGET_R fixed before this run",
            "informed_pass": "the corpus was already seen — not virgin OOS",
            "out_of_sample_start": OOS_START,
            "execution": {
                "commission_per_share": COMMISSION_PER_SHARE,
                "entry_slippage_bps": ENTRY_SLIPPAGE_BPS,
                "stop_slippage_bps": STOP_SLIPPAGE_BPS,
            },
        },
        "primary": primary,
        "verdict": verdict,
    }
    REPORT_OUT.parent.mkdir(parents=True, exist_ok=True)
    REPORT_OUT.write_text(json.dumps(report, indent=2) + "\n")

    def line(s):
        if s["n"] == 0:
            print(f"  {s['label']:28s} n=0")
            return
        ci = s["expectancy_ci95"]
        flag = "CI crosses 0" if s["ci_crosses_zero"] else "CI clear of 0"
        tts = s.get("top_trade_share")
        print(f"  {s['label']:28s} n={s['n']:5d}  "
              f"mean={s['expectancy_r']:+.3f}R  "
              f"med={s['median_r']:+.3f}R  "
              f"CI95[{ci[0]:+.3f},{ci[1]:+.3f}]  "
              f"win={s['win_rate']:.3f}  "
              f"top={'n/a' if tts is None else f'{tts:.2f}'}  {flag}")

    print(f"\n=== BIAS-CHECKED MICROCHANNEL-PULLBACK BACKTEST ===")
    print(f"  design: entry=1-min H1/L1 · stop={ATR_STOP_K}xATR · "
          f"target={TARGET_R}R")
    for k in ("all", "opening", "opening_in_sample",
              "opening_out_of_sample", "intraday"):
        line(primary[k])
    print(f"\n  VERDICT: {verdict}")
    print(f"  report: {REPORT_OUT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
