#!/usr/bin/env python3
"""Backtest of the microchannel-pullback refinement of the spike setup.

The opening-spike setup enters at the close of the 3rd spike bar
(it chases the spike). This refinement waits for the first pullback
out of the microchannel and enters on a with-trend breakout stop —
an H1 (bull) / L1 (bear). See microchannel_pullback.py.

Will asked to compare a couple of stop / target methods, so each trade
is simulated under three variants:

  A  tight 1-bar stop, keep the 5-min target
       stop   = 1 tick beyond the first-pullback extreme
       target = the original spike measured-move price
  B  tight 1-bar stop + a fresh measured move
       stop   = 1 tick beyond the first-pullback extreme
       target = the microchannel leg height projected from the entry
  C  keep the original 5-min stop and target
       stop   = the original spike's stop (1 tick beyond spike start)
       target = the original spike measured-move price

DATA: runs on the spike examples in public/spikes/examples.json — the
session bars and detected spikes the /spikes gallery already ships.
The detector is timeframe-agnostic, so the same engine re-runs over a
larger bar cache unchanged. With the curated examples this is a study
gallery refinement, not a full-corpus verdict.

Writes:
  artifacts/backtest/microchannel_backtest_report.json
  public/spikes/microchannel.json   (drives the /spikes page)

Usage:
    python3 scripts/ml/backtest_microchannel.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "live"))
from pullback_detector import Bar  # noqa: E402
from microchannel_pullback import TICK, detect_microchannel_pullback  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
EXAMPLES_IN = ROOT / "public" / "spikes" / "examples.json"
REPORT_OUT = ROOT / "artifacts" / "backtest" / "microchannel_backtest_report.json"
PAGE_OUT = ROOT / "public" / "spikes" / "microchannel.json"

# Execution model — identical to backtest_spike.py for a fair comparison.
COMMISSION_PER_SHARE = 0.005
ENTRY_SLIPPAGE_BPS = 2.0
STOP_SLIPPAGE_BPS = 4.0

VARIANTS = ("A", "B", "C")
VARIANT_LABEL = {
    "A": "tight stop, 5-min target",
    "B": "tight stop, microchannel measured move",
    "C": "original 5-min stop & target",
}


def simulate(direction, entry, stop, target, bars, fire_index):
    """Walk bars from the fill bar forward. First of {stop, target} hit
    wins; a bar that straddles both is scored stopped (conservative);
    an unresolved trade exits at the last close (time stop)."""
    long = direction == "long"
    risk = (entry - stop) if long else (stop - entry)
    if risk <= 0:
        return None

    es = ENTRY_SLIPPAGE_BPS / 1e4
    ss = STOP_SLIPPAGE_BPS / 1e4
    entry_fill = entry * (1 + es) if long else entry * (1 - es)

    exit_price = None
    exit_reason = None
    path = bars[fire_index:]
    for b in path:
        if long:
            hit_stop, hit_tgt = b.l <= stop, b.h >= target
        else:
            hit_stop, hit_tgt = b.h >= stop, b.l <= target
        if hit_stop and hit_tgt:
            exit_price = stop * (1 - ss) if long else stop * (1 + ss)
            exit_reason = "stop_straddle"
            break
        if hit_stop:
            exit_price = stop * (1 - ss) if long else stop * (1 + ss)
            exit_reason = "stop"
            break
        if hit_tgt:
            exit_price = target          # resting limit — clean fill
            exit_reason = "target"
            break
    if exit_price is None:
        last_c = path[-1].c
        exit_price = last_c * (1 - es) if long else last_c * (1 + es)
        exit_reason = "time"

    gross = (exit_price - entry_fill) if long else (entry_fill - exit_price)
    commission_r = (2 * COMMISSION_PER_SHARE) / risk
    net_r = gross / risk - commission_r
    return {
        "exit_reason": exit_reason,
        "net_r": round(net_r, 4),
        "risk_per_share": round(risk, 4),
    }


def variant_levels(variant, direction, mc, ex):
    """Stop & target for one variant. Returns (stop, target)."""
    long = direction == "long"
    entry = mc.entry_price
    tight_stop = (round(mc.pullback_extreme - TICK, 4) if long
                  else round(mc.pullback_extreme + TICK, 4))
    if variant == "A":
        return tight_stop, ex["target_price"]
    if variant == "B":
        target = (round(entry + mc.micro_leg_height, 4) if long
                  else round(entry - mc.micro_leg_height, 4))
        return tight_stop, target
    # C — the original 5-min spike levels
    return ex["stop_price"], ex["target_price"]


def summarize(trades, label):
    """trades: list of sim dicts ({exit_reason, net_r, ...})."""
    if not trades:
        return {"label": label, "n": 0}
    r = [t["net_r"] for t in trades]
    n = len(r)
    n_target = sum(1 for t in trades if t["exit_reason"] == "target")
    wins = [x for x in r if x > 0]
    losses = [x for x in r if x <= 0]
    loss_sum = sum(losses)
    return {
        "label": label,
        "n": n,
        "target_hit_rate": round(n_target / n, 4),
        "win_rate": round(len(wins) / n, 4),
        "expectancy_r": round(sum(r) / n, 4),
        "avg_win_r": round(sum(wins) / len(wins), 4) if wins else 0.0,
        "avg_loss_r": round(loss_sum / len(losses), 4) if losses else 0.0,
        "profit_factor": round(sum(wins) / -loss_sum, 3) if loss_sum < 0 else None,
        "total_r": round(sum(r), 2),
    }


def main() -> int:
    if not EXAMPLES_IN.exists():
        print(f"ERROR: {EXAMPLES_IN} not found", file=sys.stderr)
        return 2
    payload = json.loads(EXAMPLES_IN.read_text())
    examples = payload.get("examples") or []
    print(f"Refining {len(examples)} spike examples into microchannel pullbacks...")

    per_variant = {v: [] for v in VARIANTS}
    page_examples = []
    no_pullback = 0

    for ex in examples:
        raw_bars = ex["bars"]
        bars = [Bar(t=b["t"], o=b["o"], h=b["h"], l=b["l"], c=b["c"]) for b in raw_bars]
        spike_ts = set(ex["spike_bar_ts"])
        spike_idx = [i for i, b in enumerate(raw_bars) if b["t"] in spike_ts]
        if not spike_idx:
            no_pullback += 1
            continue
        spike_start = spike_idx[0]
        spike_count = spike_idx[-1] - spike_idx[0] + 1
        direction = ex["direction"]

        mc = detect_microchannel_pullback(bars, spike_start, spike_count, direction)
        if mc is None:
            no_pullback += 1
            continue

        variants_out = {}
        for v in VARIANTS:
            stop, target = variant_levels(v, direction, mc, ex)
            # The breakout entry fires AFTER the spike's 3rd bar, so it can
            # land past a target anchored to the spike. When that happens
            # the variant simply has no trade for this example — recording
            # one would book a "target" exit that is really a loss.
            if direction == "long" and target <= mc.entry_price:
                continue
            if direction == "short" and target >= mc.entry_price:
                continue
            sim = simulate(direction, mc.entry_price, stop, target, bars, mc.fire_index)
            if sim is None:
                continue
            per_variant[v].append(sim)
            variants_out[v] = {
                "stop": round(stop, 4),
                "target": round(target, 4),
                "exit_reason": sim["exit_reason"],
                "net_r": sim["net_r"],
            }

        page_examples.append({
            "symbol": ex["symbol"],
            "session_date": ex["session_date"],
            "direction": direction,
            "bars": raw_bars,
            "spike_bar_ts": ex["spike_bar_ts"],
            "pullback_bar_ts": [raw_bars[i]["t"] for i in mc.pullback_bar_indices],
            "signal_ts": raw_bars[mc.signal_index]["t"],
            "fire_ts": raw_bars[mc.fire_index]["t"],
            "raw_spike_entry": ex["entry_price"],
            "entry_price": mc.entry_price,
            "variants": variants_out,
        })

    variant_summary = {
        v: summarize(per_variant[v], f"variant {v} — {VARIANT_LABEL[v]}")
        for v in VARIANTS
    }
    # Best variant: highest expectancy, tie-break on target-hit rate.
    traded = [v for v in VARIANTS if variant_summary[v]["n"] > 0]
    chosen = max(
        traded,
        key=lambda v: (variant_summary[v]["expectancy_r"],
                       variant_summary[v]["target_hit_rate"]),
    ) if traded else None

    note = (
        f"Microchannel-pullback refinement applied to {len(page_examples)} "
        f"curated spike examples. {no_pullback} example(s) produced no "
        f"qualifying first pullback. A study gallery, not a full-corpus verdict."
    )

    report = {
        "config": {
            "entry": "first-pullback breakout stop (H1/L1) out of the spike",
            "variants": VARIANT_LABEL,
            "commission_per_share": COMMISSION_PER_SHARE,
            "entry_slippage_bps": ENTRY_SLIPPAGE_BPS,
            "stop_slippage_bps": STOP_SLIPPAGE_BPS,
        },
        "note": note,
        "examples_in": len(examples),
        "examples_traded": len(page_examples),
        "no_pullback": no_pullback,
        "chosen_variant": chosen,
        "variants": variant_summary,
    }
    REPORT_OUT.parent.mkdir(parents=True, exist_ok=True)
    REPORT_OUT.write_text(json.dumps(report, indent=2) + "\n")

    PAGE_OUT.parent.mkdir(parents=True, exist_ok=True)
    PAGE_OUT.write_text(json.dumps({
        "generated_from": "scripts/ml/backtest_microchannel.py",
        "note": note,
        "chosen_variant": chosen,
        "variants": variant_summary,
        "examples": page_examples,
    }, indent=2) + "\n")

    def line(s):
        if s["n"] == 0:
            print(f"  {s['label']:48s} n=0")
            return
        print(f"  {s['label']:48s} n={s['n']:3d}  "
              f"tgt-hit={s['target_hit_rate']:.3f}  "
              f"win={s['win_rate']:.3f}  "
              f"exp={s['expectancy_r']:+.3f}R  "
              f"total={s['total_r']:+.2f}R  pf={s['profit_factor']}")

    print(f"\n=== MICROCHANNEL-PULLBACK REFINEMENT ({len(page_examples)} traded) ===")
    for v in VARIANTS:
        line(variant_summary[v])
    print(f"\n  chosen variant: {chosen}")
    print(f"  report:  {REPORT_OUT.relative_to(ROOT)}")
    print(f"  page:    {PAGE_OUT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
